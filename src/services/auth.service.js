// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { getDbPool } from '../config/database.js';
import { HttpError } from '../utils/errors.js';

function hashToken(raw) {
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function randomToken(bytes = 48) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function accessTokenExpiresAt() {
    return new Date(Date.now() + env.jwtAccessTtlSeconds * 1000).toISOString();
}

function refreshExpiresAtDate() {
    return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

function requireAuthConfig() {
    if (!env.jwtAccessSecret) {
        throw new HttpError('Missing JWT_ACCESS_SECRET configuration', 500);
    }
}

function signAccessToken({ userId, sessionId, roles, permissions }) {
    requireAuthConfig();

    return jwt.sign(
        {
            roles,
            permissions,
            sid: sessionId,
            typ: 'access',
        },
        env.jwtAccessSecret,
        {
            algorithm: 'HS256',
            expiresIn: env.jwtAccessTtlSeconds,
            issuer: env.jwtIssuer,
            audience: env.jwtAudience,
            subject: userId,
            jwtid: crypto.randomUUID(),
        }
    );
}

async function getUserRoles(clientOrPool, userId) {
    const rolesResult = await clientOrPool.query(
        `
      SELECT r.code
      FROM rel_user_roles ur
      INNER JOIN cat_roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
      ORDER BY r.code ASC
    `,
        [userId]
    );
    return rolesResult.rows.map((row) => row.code);
}

async function getUserPermissions(clientOrPool, userId) {
    const permissionsResult = await clientOrPool.query(
        `
      SELECT DISTINCT p.code
      FROM rel_user_roles ur
      INNER JOIN rel_role_permissions rp ON rp.role_id = ur.role_id
      INNER JOIN cat_permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
      ORDER BY p.code ASC
    `,
        [userId]
    );
    return permissionsResult.rows.map((row) => row.code);
}

async function hasLocalPasswordIdentity(clientOrPool, userId) {
    const result = await clientOrPool.query(
        `
            SELECT 1
            FROM sec_auth_identities
            WHERE user_id = $1
                AND provider = 'local'
                AND password_hash IS NOT NULL
            LIMIT 1
        `,
        [userId]
    );
    return result.rowCount > 0;
}

async function getRoleIdByCode(client, code) {
    const result = await client.query('SELECT id FROM cat_roles WHERE code = $1', [code]);
    if (result.rowCount < 1) {
        throw new HttpError(`Role not found: ${code}`, 500);
    }
    return result.rows[0].id;
}

async function createSessionAndRefreshToken(client, { userId, deviceName, ipAddress, userAgent }) {
    const refreshToken = randomToken(48);
    const refreshTokenHash = hashToken(refreshToken);
    const sessionKeyHash = hashToken(randomToken(32));
    const refreshTokenJti = crypto.randomUUID();
    const refreshExpiresAt = refreshExpiresAtDate();

    const sessionResult = await client.query(
        `
      INSERT INTO sec_user_sessions (
        user_id,
        session_key_hash,
        device_name,
        ip_address,
        user_agent,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, expires_at
    `,
        [userId, sessionKeyHash, deviceName, ipAddress, userAgent, refreshExpiresAt.toISOString()]
    );

    const session = sessionResult.rows[0];

    await client.query(
        `
      INSERT INTO sec_session_refresh_tokens (
        session_id,
        token_hash,
        token_jti,
        expires_at
      )
      VALUES ($1, $2, $3, $4)
    `,
        [session.id, refreshTokenHash, refreshTokenJti, session.expires_at]
    );

    return {
        sessionId: session.id,
        refreshToken,
        refreshExpiresAt: session.expires_at,
    };
}

async function createAuthResponse(client, { userId, email, fullName, deviceName, ipAddress, userAgent }) {
    const roles = await getUserRoles(client, userId);
    const permissions = await getUserPermissions(client, userId);
    const hasLocalPassword = await hasLocalPasswordIdentity(client, userId);

    const session = await createSessionAndRefreshToken(client, {
        userId,
        deviceName,
        ipAddress,
        userAgent,
    });

    await client.query('UPDATE core_users SET last_login_at = NOW() WHERE id = $1', [userId]);

    const accessToken = signAccessToken({
        userId,
        sessionId: session.sessionId,
        roles,
        permissions,
    });

    return {
        user: {
            id: userId,
            email,
            fullName,
            roles,
            permissions,
            hasLocalPassword,
        },
        accessToken,
        accessTokenExpiresAt: accessTokenExpiresAt(),
        refreshToken: session.refreshToken,
        refreshTokenExpiresAt: session.refreshExpiresAt,
    };
}

function normalizeIpAddress(rawIp) {
    if (!rawIp) return null;
    if (rawIp.startsWith('::ffff:')) {
        return rawIp.slice(7);
    }
    return rawIp;
}

function parseIpAddress(req) {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeIpAddress(forwarded.split(',')[0].trim());
    }
    const remote = req.socket?.remoteAddress;
    return remote ? normalizeIpAddress(remote) : null;
}

function parseUserAgent(req) {
    const userAgent = req.headers?.['user-agent'];
    return typeof userAgent === 'string' && userAgent.trim() ? userAgent.trim() : null;
}

export function getRequestDeviceContext(req, deviceName) {
    return {
        deviceName: deviceName || null,
        ipAddress: parseIpAddress(req),
        userAgent: parseUserAgent(req),
    };
}

export async function registerWithLocalAuth({ email, fullName, password, deviceName, ipAddress, userAgent }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const existingResult = await client.query('SELECT id FROM core_users WHERE email = $1', [email]);
        if (existingResult.rowCount > 0) {
            throw new HttpError('Email is already registered', 409);
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const userResult = await client.query(
            `
        INSERT INTO core_users (email, full_name)
        VALUES ($1, $2)
        RETURNING id, email, full_name
      `,
            [email, fullName]
        );
        const user = userResult.rows[0];

        await client.query(
            `
        INSERT INTO sec_auth_identities (user_id, provider, password_hash, is_primary)
        VALUES ($1, 'local', $2, TRUE)
      `,
            [user.id, passwordHash]
        );

        const normalRoleId = await getRoleIdByCode(client, 'normal');
        await client.query(
            `
        INSERT INTO rel_user_roles (user_id, role_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, role_id) DO NOTHING
      `,
            [user.id, normalRoleId]
        );

        const response = await createAuthResponse(client, {
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            deviceName,
            ipAddress,
            userAgent,
        });

        await client.query(
            `
        INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES ($1, 'auth.register.local', 'core_users', $2, $3::inet, $4)
      `,
            [user.id, user.id, ipAddress, userAgent]
        );

        await client.query('COMMIT');
        return response;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function loginWithLocalAuth({ email, password, deviceName, ipAddress, userAgent }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            `
        SELECT id, email, full_name, is_active
        FROM core_users
        WHERE email = $1
        LIMIT 1
      `,
            [email]
        );

        if (userResult.rowCount < 1) {
            throw new HttpError('Invalid credentials', 401);
        }

        const user = userResult.rows[0];
        if (!user.is_active) {
            throw new HttpError('User is inactive', 403);
        }

        const localIdentityResult = await client.query(
            `
        SELECT
          ai.password_hash
        FROM sec_auth_identities ai
        WHERE ai.user_id = $1
          AND ai.provider = 'local'
        LIMIT 1
      `,
            [user.id]
        );

        if (localIdentityResult.rowCount < 1 || !localIdentityResult.rows[0].password_hash) {
            throw new HttpError('Invalid credentials', 401);
        }

        const matches = await bcrypt.compare(password, localIdentityResult.rows[0].password_hash);
        if (!matches) {
            throw new HttpError('Invalid credentials', 401);
        }

        const response = await createAuthResponse(client, {
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            deviceName,
            ipAddress,
            userAgent,
        });

        await client.query(
            `
        INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES ($1, 'auth.login.local', 'core_users', $2, $3::inet, $4)
      `,
            [user.id, user.id, ipAddress, userAgent]
        );

        await client.query('COMMIT');
        return response;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
