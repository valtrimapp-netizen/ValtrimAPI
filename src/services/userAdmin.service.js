import { getDbPool } from '../config/database.js';
import { HttpError } from '../utils/errors.js';

async function getAllRoles(client) {
    const result = await client.query(
        `
        SELECT id, code, name
        FROM cat_roles
        ORDER BY code ASC
        `
    );

    return result.rows;
}

async function getRoleByCode(client, roleCode) {
    const result = await client.query(
        `
        SELECT id, code, name
        FROM cat_roles
        WHERE code = $1
        LIMIT 1
        `,
        [roleCode]
    );

    return result.rows[0] ?? null;
}

function mapUsers(rows) {
    return rows.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        isActive: row.is_active,
        createdAt: row.created_at,
        roles: Array.isArray(row.roles) ? row.roles : [],
    }));
}

export async function listUsersForAdmin() {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        const [usersResult, rolesResult] = await Promise.all([
            client.query(
                `
                SELECT
                    u.id,
                    u.email,
                    u.full_name,
                    u.is_active,
                    u.created_at,
                    COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles
                FROM core_users u
                LEFT JOIN rel_user_roles ur ON ur.user_id = u.id
                LEFT JOIN cat_roles r ON r.id = ur.role_id
                GROUP BY u.id, u.email, u.full_name, u.is_active, u.created_at
                ORDER BY u.created_at DESC
                `
            ),
            getAllRoles(client),
        ]);

        return {
            users: mapUsers(usersResult.rows),
            roles: rolesResult.map((role) => ({
                code: role.code,
                name: role.name,
            })),
        };
    } finally {
        client.release();
    }
}

export async function updateUserRoleByAdmin({ targetUserId, roleCode, actorUserId, ipAddress = null, userAgent = null }) {
    const pool = getDbPool();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (targetUserId === actorUserId) {
            throw new HttpError('No puedes cambiar tu propio rol desde este panel.', 409, 'SELF_ROLE_UPDATE_NOT_ALLOWED');
        }

        const userResult = await client.query(
            `
            SELECT id, email, full_name, is_active, created_at
            FROM core_users
            WHERE id = $1
            LIMIT 1
            `,
            [targetUserId]
        );

        if (userResult.rowCount < 1) {
            throw new HttpError('User not found', 404, 'USER_NOT_FOUND');
        }

        const role = await getRoleByCode(client, roleCode);
        if (!role) {
            throw new HttpError('Role not found', 422, 'ROLE_NOT_FOUND');
        }

        await client.query('DELETE FROM rel_user_roles WHERE user_id = $1', [targetUserId]);
        await client.query(
            `
            INSERT INTO rel_user_roles (user_id, role_id, assigned_by_user_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, role_id) DO UPDATE
              SET assigned_by_user_id = EXCLUDED.assigned_by_user_id,
                  assigned_at = NOW()
            `,
            [targetUserId, role.id, actorUserId]
        );

        await client.query(
            `
            INSERT INTO evt_audit_log (actor_user_id, action, entity_type, entity_id, metadata, ip_address, user_agent)
            VALUES ($1, 'admin.user.role.update', 'core_users', $2::text, $3::jsonb, $4::inet, $5)
            `,
            [
                actorUserId,
                targetUserId,
                JSON.stringify({ role: role.code }),
                ipAddress,
                userAgent,
            ]
        );

        const updatedUserResult = await client.query(
            `
            SELECT
                u.id,
                u.email,
                u.full_name,
                u.is_active,
                u.created_at,
                COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles
            FROM core_users u
            LEFT JOIN rel_user_roles ur ON ur.user_id = u.id
            LEFT JOIN cat_roles r ON r.id = ur.role_id
            WHERE u.id = $1
            GROUP BY u.id, u.email, u.full_name, u.is_active, u.created_at
            `,
            [targetUserId]
        );

        await client.query('COMMIT');

        return {
            user: mapUsers(updatedUserResult.rows)[0],
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
