import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { getDbPool, query } from '../config/database.js';
import { HttpError } from '../utils/errors.js';
import { sendPasswordResetCodeEmail } from '../utils/email.js';

const googleClient = new OAuth2Client();

const PASSWORD_RESET_CODE_TTL_MINUTES = 10;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 15;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function generateOtpCode() {
    // 6-digit numeric code, zero-padded
    const n = crypto.randomInt(0, 1_000_000);
    return n.toString().padStart(6, '0');
}

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

function verifyAccessToken(token) {
    requireAuthConfig();

    return jwt.verify(token, env.jwtAccessSecret, {
        algorithms: ['HS256'],
        issuer: env.jwtIssuer,
        audience: env.jwtAudience,
    });
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

function extractSubjectFromGooglePayload(payload) {
    const candidate = payload?.sub || payload?.subject;
    return candidate ? String(candidate) : '';
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
            throw new HttpError(
                'Esta cuenta usa Google. Inicia sesión con Google y crea una contraseña en tu perfil para habilitar el acceso con correo y contraseña.',
                400,
                'LOCAL_PASSWORD_NOT_CONFIGURED'
            );
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

async function verifyGoogleIdToken(idToken) {
    if (!env.googleClientId) {
        throw new HttpError('Missing GOOGLE_CLIENT_ID configuration', 500);
    }

    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
        throw new HttpError('Invalid Google token payload', 401);
    }

    const subject = extractSubjectFromGooglePayload(payload);
    const email = String(payload.email || '').trim().toLowerCase();
    const fullName = String(payload.name || payload.given_name || '').trim();
    const emailVerified = Boolean(payload.email_verified);

    if (!subject || !email) {
        throw new HttpError('Google account is missing required claims', 401);
    }

    if (!emailVerified) {
        throw new HttpError('Google email is not verified', 401);
    }

    return {
        subject,
        email,
        fullName: fullName || email,
    };
}

export async function loginWithGoogleAuth({ idToken, deviceName, ipAddress, userAgent }) {
    const googleUser = await verifyGoogleIdToken(idToken);
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let userResult = await client.query(
            `
        SELECT u.id, u.email, u.full_name, u.is_active
        FROM sec_auth_identities ai
        INNER JOIN core_users u ON u.id = ai.user_id
        WHERE ai.provider = 'google' AND ai.provider_subject = $1
      `,
            [googleUser.subject]
        );

        if (userResult.rowCount < 1) {
            userResult = await client.query('SELECT id, email, full_name, is_active FROM core_users WHERE email = $1', [googleUser.email]);
        }

        let user;

        if (userResult.rowCount < 1) {
            const created = await client.query(
                `
          INSERT INTO core_users (email, full_name, is_email_verified)
          VALUES ($1, $2, TRUE)
          RETURNING id, email, full_name, is_active
        `,
                [googleUser.email, googleUser.fullName]
            );
            user = created.rows[0];

            const normalRoleId = await getRoleIdByCode(client, 'normal');
            await client.query(
                `
          INSERT INTO rel_user_roles (user_id, role_id)
          VALUES ($1, $2)
          ON CONFLICT (user_id, role_id) DO NOTHING
        `,
                [user.id, normalRoleId]
            );
        } else {
            user = userResult.rows[0];
        }

        if (!user.is_active) {
            throw new HttpError('User is inactive', 403);
        }

        const googleIdentity = await client.query(
            `
        SELECT id, user_id
        FROM sec_auth_identities
        WHERE provider = 'google' AND provider_subject = $1
      `,
            [googleUser.subject]
        );

        if (googleIdentity.rowCount < 1) {
            await client.query(
                `
          INSERT INTO sec_auth_identities (user_id, provider, provider_subject, is_primary)
          VALUES ($1, 'google', $2, FALSE)
        `,
                [user.id, googleUser.subject]
            );
        } else if (googleIdentity.rows[0].user_id !== user.id) {
            throw new HttpError('Google identity is linked to another user', 409);
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
        VALUES ($1, 'auth.login.google', 'core_users', $2, $3::inet, $4)
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

export async function refreshSessionTokens({ refreshToken, ipAddress, userAgent }) {
    const refreshTokenHash = hashToken(refreshToken);
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const tokenResult = await client.query(
            `
        SELECT
          rt.id,
          rt.session_id,
          rt.expires_at,
          rt.consumed_at,
          rt.revoked_at,
          s.user_id,
          s.revoked_at AS session_revoked_at,
          s.expires_at AS session_expires_at,
          u.email,
          u.full_name,
          u.is_active
        FROM sec_session_refresh_tokens rt
        INNER JOIN sec_user_sessions s ON s.id = rt.session_id
        INNER JOIN core_users u ON u.id = s.user_id
        WHERE rt.token_hash = $1
        FOR UPDATE
      `,
            [refreshTokenHash]
        );

        if (tokenResult.rowCount < 1) {
            throw new HttpError('Invalid refresh token', 401);
        }

        const tokenRow = tokenResult.rows[0];

        const tokenAlreadyUsed = tokenRow.consumed_at || tokenRow.revoked_at;
        if (tokenAlreadyUsed) {
            await client.query(
                `
          UPDATE sec_user_sessions
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoked_reason = COALESCE(revoked_reason, 'refresh_token_reuse')
          WHERE user_id = $1 AND revoked_at IS NULL
        `,
                [tokenRow.user_id]
            );
            throw new HttpError('Refresh token was already used', 401);
        }

        if (!tokenRow.is_active) {
            throw new HttpError('User is inactive', 403);
        }

        if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
            throw new HttpError('Refresh token expired', 401);
        }

        if (tokenRow.session_revoked_at || new Date(tokenRow.session_expires_at).getTime() <= Date.now()) {
            throw new HttpError('Session is not active', 401);
        }

        await client.query(
            'UPDATE sec_session_refresh_tokens SET consumed_at = NOW() WHERE id = $1',
            [tokenRow.id]
        );

        const nextRefreshToken = randomToken(48);
        const nextRefreshTokenHash = hashToken(nextRefreshToken);
        const nextTokenJti = crypto.randomUUID();

        const insertedToken = await client.query(
            `
        INSERT INTO sec_session_refresh_tokens (
          session_id,
          token_hash,
          token_jti,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id, expires_at
      `,
            [tokenRow.session_id, nextRefreshTokenHash, nextTokenJti, tokenRow.session_expires_at]
        );

        const nextTokenRow = insertedToken.rows[0];

        await client.query(
            'UPDATE sec_session_refresh_tokens SET replaced_by_token_id = $1 WHERE id = $2',
            [nextTokenRow.id, tokenRow.id]
        );

        await client.query('UPDATE sec_user_sessions SET last_seen_at = NOW() WHERE id = $1', [tokenRow.session_id]);

        const roles = await getUserRoles(client, tokenRow.user_id);
        const permissions = await getUserPermissions(client, tokenRow.user_id);
        const hasLocalPassword = await hasLocalPasswordIdentity(client, tokenRow.user_id);
        const accessToken = signAccessToken({
            userId: tokenRow.user_id,
            sessionId: tokenRow.session_id,
            roles,
            permissions,
        });

        await client.query(
            `
        INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES ($1, 'auth.refresh', 'sec_user_sessions', $2::text, $3::inet, $4)
      `,
            [tokenRow.user_id, tokenRow.session_id, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        return {
            user: {
                id: tokenRow.user_id,
                email: tokenRow.email,
                fullName: tokenRow.full_name,
                roles,
                permissions,
                hasLocalPassword,
            },
            accessToken,
            accessTokenExpiresAt: accessTokenExpiresAt(),
            refreshToken: nextRefreshToken,
            refreshTokenExpiresAt: nextTokenRow.expires_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function revokeSessionById({ sessionId, userId, reason = 'logout' }) {
    const result = await query(
        `
      UPDATE sec_user_sessions
      SET revoked_at = COALESCE(revoked_at, NOW()),
          revoked_reason = COALESCE(revoked_reason, $3)
      WHERE id = $1
        AND user_id = $2
        AND revoked_at IS NULL
      RETURNING id
    `,
        [sessionId, userId, reason]
    );

    return result.rowCount > 0;
}

export async function revokeAllSessionsForUser({ userId, exceptSessionId = null, reason = 'logout_all' }) {
    if (exceptSessionId) {
        await query(
            `
        UPDATE sec_user_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, $3)
        WHERE user_id = $1
          AND id <> $2
          AND revoked_at IS NULL
      `,
            [userId, exceptSessionId, reason]
        );
        return;
    }

    await query(
        `
      UPDATE sec_user_sessions
      SET revoked_at = COALESCE(revoked_at, NOW()),
          revoked_reason = COALESCE(revoked_reason, $2)
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
        [userId, reason]
    );
}

export async function authenticateAccessToken(authorizationHeader) {
    const token = extractBearerToken(authorizationHeader);
    if (!token) {
        throw new HttpError('Missing bearer token', 401);
    }

    let payload;
    try {
        payload = verifyAccessToken(token);
    } catch {
        throw new HttpError('Invalid or expired access token', 401);
    }

    const userId = String(payload?.sub || '');
    const sessionId = String(payload?.sid || '');
    const tokenRoles = Array.isArray(payload?.roles) ? payload.roles : [];
    const tokenPermissions = Array.isArray(payload?.permissions) ? payload.permissions : [];

    if (!userId || !sessionId) {
        throw new HttpError('Invalid token payload', 401);
    }

    const sessionResult = await query(
        `
      SELECT
        s.id AS session_id,
        s.user_id,
        s.revoked_at,
        s.expires_at,
        u.email,
        u.full_name,
        u.is_active
      FROM sec_user_sessions s
      INNER JOIN core_users u ON u.id = s.user_id
      WHERE s.id = $1
    `,
        [sessionId]
    );

    if (sessionResult.rowCount < 1) {
        throw new HttpError('Session not found', 401);
    }

    const session = sessionResult.rows[0];
    if (session.user_id !== userId) {
        throw new HttpError('Session does not match token', 401);
    }

    if (!session.is_active) {
        throw new HttpError('User is inactive', 403);
    }

    if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
        throw new HttpError('Session expired or revoked', 401);
    }

    const dbRoles = await getUserRoles(getDbPool(), userId);
    const dbPermissions = await getUserPermissions(getDbPool(), userId);
    const hasLocalPassword = await hasLocalPasswordIdentity(getDbPool(), userId);
    return {
        userId,
        sessionId,
        email: session.email,
        fullName: session.full_name,
        roles: dbRoles.length > 0 ? dbRoles : tokenRoles,
        permissions: dbPermissions.length > 0 ? dbPermissions : tokenPermissions,
        hasLocalPassword,
        token,
    };
}

function extractBearerToken(authorizationHeader) {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
        return null;
    }

    const [scheme, token] = authorizationHeader.trim().split(/\s+/);
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
        return null;
    }

    return token;
}

// ---------------------------------------------------------------------------
// Password reset (OTP via email)
// ---------------------------------------------------------------------------

async function findActiveLocalUserByEmail(client, email) {
    const result = await client.query(
        `
      SELECT u.id, u.email, u.full_name, u.is_active, a.id AS auth_identity_id
      FROM core_users u
      INNER JOIN sec_auth_identities a
        ON a.user_id = u.id AND a.provider = 'local'
      WHERE u.email = $1
      LIMIT 1
    `,
        [email]
    );
    return result.rowCount > 0 ? result.rows[0] : null;
}

export async function requestPasswordReset({ email, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const user = await findActiveLocalUserByEmail(client, email);

        if (user && user.is_active) {
            // Invalidate any previous active code for this user.
            await client.query(
                `
          UPDATE sec_password_reset_codes
          SET consumed_at = NOW()
          WHERE user_id = $1 AND consumed_at IS NULL
        `,
                [user.id]
            );

            const code = generateOtpCode();
            const codeHash = await bcrypt.hash(code, 8);
            const expiresAt = new Date(Date.now() + PASSWORD_RESET_CODE_TTL_MINUTES * 60 * 1000);

            await client.query(
                `
          INSERT INTO sec_password_reset_codes (
            user_id, code_hash, max_attempts, expires_at, ip_address, user_agent
          ) VALUES ($1, $2, $3, $4, $5::inet, $6)
        `,
                [user.id, codeHash, PASSWORD_RESET_MAX_ATTEMPTS, expiresAt, ipAddress, userAgent]
            );

            await client.query(
                `
          INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
          VALUES ($1, 'auth.password_reset.requested', 'core_users', $2::text, $3::inet, $4)
        `,
                [user.id, user.id, ipAddress, userAgent]
            );

            await client.query('COMMIT');

            // Send the email outside the transaction (best-effort).
            try {
                await sendPasswordResetCodeEmail({
                    to: user.email,
                    code,
                    ttlMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
                });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('[auth] failed to deliver password reset email', err);
            }
        } else {
            // Email not registered or user inactive — commit empty tx and pretend success
            // to prevent account enumeration.
            await client.query('COMMIT');
        }

        return {
            ok: true,
            ttlMinutes: PASSWORD_RESET_CODE_TTL_MINUTES,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function verifyPasswordResetOtp({ email, code, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    const genericError = new HttpError('Invalid or expired verification code', 400);

    try {
        await client.query('BEGIN');

        const user = await findActiveLocalUserByEmail(client, email);
        if (!user || !user.is_active) {
            await client.query('ROLLBACK');
            throw genericError;
        }

        const codeResult = await client.query(
            `
        SELECT id, code_hash, attempts, max_attempts, expires_at
        FROM sec_password_reset_codes
        WHERE user_id = $1
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
            [user.id]
        );

        if (codeResult.rowCount < 1) {
            await client.query('ROLLBACK');
            throw genericError;
        }

        const row = codeResult.rows[0];

        if (new Date(row.expires_at).getTime() <= Date.now()) {
            await client.query(
                'UPDATE sec_password_reset_codes SET consumed_at = NOW() WHERE id = $1',
                [row.id]
            );
            await client.query('COMMIT');
            throw genericError;
        }

        if (row.attempts >= row.max_attempts) {
            await client.query(
                'UPDATE sec_password_reset_codes SET consumed_at = NOW() WHERE id = $1',
                [row.id]
            );
            await client.query('COMMIT');
            throw new HttpError('Too many attempts. Request a new verification code.', 429);
        }

        const matches = await bcrypt.compare(code, row.code_hash);
        if (!matches) {
            await client.query(
                'UPDATE sec_password_reset_codes SET attempts = attempts + 1 WHERE id = $1',
                [row.id]
            );
            await client.query('COMMIT');
            throw genericError;
        }

        // Code valid — issue a short-lived reset token.
        const resetToken = randomToken(32);
        const resetTokenHash = hashToken(resetToken);
        const resetTokenExpiresAt = new Date(
            Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
        );

        await client.query(
            `
        UPDATE sec_password_reset_codes
        SET verified_at = NOW(),
            reset_token_hash = $2,
            reset_token_expires_at = $3
        WHERE id = $1
      `,
            [row.id, resetTokenHash, resetTokenExpiresAt]
        );

        await client.query(
            `
        INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES ($1, 'auth.password_reset.verified', 'core_users', $2::text, $3::inet, $4)
      `,
            [user.id, user.id, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        return {
            ok: true,
            resetToken,
            resetTokenExpiresAt: resetTokenExpiresAt.toISOString(),
        };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function resetPasswordWithToken({
    email,
    resetToken,
    newPassword,
    ipAddress = null,
    userAgent = null,
}) {
    const pool = getDbPool();
    const client = await pool.connect();

    const genericError = new HttpError('Invalid or expired reset token', 400);

    try {
        await client.query('BEGIN');

        const user = await findActiveLocalUserByEmail(client, email);
        if (!user || !user.is_active) {
            await client.query('ROLLBACK');
            throw genericError;
        }

        const tokenHash = hashToken(resetToken);

        const rowResult = await client.query(
            `
        SELECT id, reset_token_expires_at
        FROM sec_password_reset_codes
        WHERE user_id = $1
          AND reset_token_hash = $2
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
            [user.id, tokenHash]
        );

        if (rowResult.rowCount < 1) {
            await client.query('ROLLBACK');
            throw genericError;
        }

        const row = rowResult.rows[0];
        if (
            !row.reset_token_expires_at ||
            new Date(row.reset_token_expires_at).getTime() <= Date.now()
        ) {
            await client.query(
                'UPDATE sec_password_reset_codes SET consumed_at = NOW() WHERE id = $1',
                [row.id]
            );
            await client.query('COMMIT');
            throw genericError;
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await client.query(
            `
        UPDATE sec_auth_identities
        SET password_hash = $2, updated_at = NOW()
        WHERE user_id = $1 AND provider = 'local'
      `,
            [user.id, passwordHash]
        );

        await client.query(
            'UPDATE sec_password_reset_codes SET consumed_at = NOW() WHERE id = $1',
            [row.id]
        );

        // Revoke every active session for safety.
        await client.query(
            `
        UPDATE sec_user_sessions
        SET revoked_at = COALESCE(revoked_at, NOW()),
            revoked_reason = COALESCE(revoked_reason, 'password_reset')
        WHERE user_id = $1 AND revoked_at IS NULL
      `,
            [user.id]
        );

        await client.query(
            `
        INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES ($1, 'auth.password_reset.completed', 'core_users', $2::text, $3::inet, $4)
      `,
            [user.id, user.id, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        return { ok: true };
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw error;
    } finally {
        client.release();
    }
}


export async function updateUserProfile({ userId, fullName, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE core_users SET full_name = $2, updated_at = NOW() WHERE id = $1 AND is_active = TRUE RETURNING id, email, full_name`,
            [userId, fullName]
        );

        if (result.rowCount < 1) {
            throw new HttpError('User not found', 404);
        }

        const user = result.rows[0];

        await client.query(
            `INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent) VALUES ($1, 'auth.profile.update', 'core_users', $2, $3::inet, $4)`,
            [user.id, user.id, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        const roles = await getUserRoles(pool, user.id);
        const permissions = await getUserPermissions(pool, user.id);
        const hasLocalPassword = await hasLocalPasswordIdentity(pool, user.id);

        return {
            user: {
                id: user.id,
                email: user.email,
                fullName: user.full_name,
                roles,
                permissions,
                hasLocalPassword,
            },
        };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw error;
    } finally {
        client.release();
    }
}

export async function changeUserPassword({ userId, currentPassword, newPassword, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const identityResult = await client.query(
            `SELECT ai.password_hash, u.is_active FROM sec_auth_identities ai INNER JOIN core_users u ON u.id = ai.user_id WHERE ai.user_id = $1 AND ai.provider = 'local'`,
            [userId]
        );

        if (identityResult.rowCount < 1) {
            throw new HttpError('Local password is not configured for this account', 400);
        }

        const identity = identityResult.rows[0];
        if (!identity.is_active) {
            throw new HttpError('User is inactive', 403);
        }

        const matches = await bcrypt.compare(currentPassword, identity.password_hash);
        if (!matches) {
            throw new HttpError('Current password is incorrect', 400);
        }

        const newHash = await bcrypt.hash(newPassword, 12);

        await client.query(
            `UPDATE sec_auth_identities SET password_hash = $2, updated_at = NOW() WHERE user_id = $1 AND provider = 'local'`,
            [userId, newHash]
        );

        await client.query(
            `INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent) VALUES ($1, 'auth.password.change', 'core_users', $2, $3::inet, $4)`,
            [userId, userId, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        return { ok: true };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw error;
    } finally {
        client.release();
    }
}

export async function createLocalPasswordForUser({ userId, newPassword, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userResult = await client.query('SELECT is_active FROM core_users WHERE id = $1 FOR UPDATE', [userId]);
        if (userResult.rowCount < 1) {
            throw new HttpError('User not found', 404);
        }
        if (!userResult.rows[0].is_active) {
            throw new HttpError('User is inactive', 403);
        }

        const localIdentityResult = await client.query(
            `SELECT id, password_hash FROM sec_auth_identities WHERE user_id = $1 AND provider = 'local' FOR UPDATE`,
            [userId]
        );

        if (localIdentityResult.rowCount > 0 && localIdentityResult.rows[0].password_hash) {
            throw new HttpError('Local password is already configured for this account', 400);
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        if (localIdentityResult.rowCount > 0) {
            await client.query(
                `UPDATE sec_auth_identities SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
                [localIdentityResult.rows[0].id, passwordHash]
            );
        } else {
            await client.query(
                `INSERT INTO sec_auth_identities (user_id, provider, password_hash, is_primary) VALUES ($1, 'local', $2, FALSE)`,
                [userId, passwordHash]
            );
        }

        await client.query(
            `INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, ip_address, user_agent) VALUES ($1, 'auth.password.create_local', 'core_users', $2, $3::inet, $4)`,
            [userId, userId, ipAddress, userAgent]
        );

        await client.query('COMMIT');

        return { ok: true, hasLocalPassword: true };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw error;
    } finally {
        client.release();
    }
}
