// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/config/database.js', () => ({
    checkDatabaseConnection: vi.fn().mockResolvedValue({ ok: true }),
    getDbPool: vi.fn(),
    query: vi.fn(),
    verifyDatabaseAtStartup: vi.fn().mockResolvedValue(undefined),
    closeDbPool: vi.fn(),
}));

vi.mock('../../src/services/auth.service.js', () => ({
    authenticateAccessToken: vi.fn(),
    getRequestDeviceContext: vi.fn().mockReturnValue({ ipAddress: '127.0.0.1', userAgent: 'vitest' }),
}));

vi.mock('../../src/services/userAdmin.service.js', () => ({
    listUsersForAdmin: vi.fn(),
    updateUserRoleByAdmin: vi.fn(),
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/services/auth.service.js';
import * as userAdminService from '../../src/services/userAdmin.service.js';

const ADMIN_AUTH = {
    userId: 'admin-user-1',
    sessionId: 'session-1',
    email: 'admin@valtrim.com',
    fullName: 'Admin User',
    roles: ['admin'],
    permissions: ['admin.panel'],
};

const NORMAL_AUTH = {
    ...ADMIN_AUTH,
    roles: ['normal'],
    permissions: ['auth.self.read'],
};

describe('GET /api/admin/users', () => {
    beforeEach(() => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(ADMIN_AUTH);
        vi.mocked(userAdminService.listUsersForAdmin).mockResolvedValue({
            users: [
                {
                    id: 'u1',
                    email: 'one@example.com',
                    fullName: 'User One',
                    roles: ['normal'],
                    isActive: true,
                    createdAt: new Date().toISOString(),
                },
            ],
            roles: [
                { code: 'admin', name: 'Administrador' },
                { code: 'normal', name: 'Usuario normal' },
            ],
        });
    });

    it('returns 200 and users for admin', async () => {
        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', 'Bearer admin.token');

        expect(res.status).toBe(200);
        expect(res.body.users).toHaveLength(1);
        expect(res.body.roles).toHaveLength(2);
    });

    it('returns 403 for non-admin', async () => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(NORMAL_AUTH);

        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', 'Bearer normal.token');

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });
});

describe('PATCH /api/admin/users/:userId/role', () => {
    beforeEach(() => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(ADMIN_AUTH);
        vi.mocked(userAdminService.updateUserRoleByAdmin).mockResolvedValue({
            user: {
                id: 'u2',
                email: 'two@example.com',
                fullName: 'User Two',
                roles: ['admin'],
                isActive: true,
                createdAt: new Date().toISOString(),
            },
        });
    });

    it('returns 200 and updated user', async () => {
        const res = await request(app)
            .patch('/api/admin/users/u2/role')
            .set('Authorization', 'Bearer admin.token')
            .send({ role: 'admin' });

        expect(res.status).toBe(200);
        expect(res.body.user.roles).toContain('admin');
        expect(vi.mocked(userAdminService.updateUserRoleByAdmin)).toHaveBeenCalledWith(
            expect.objectContaining({
                targetUserId: 'u2',
                roleCode: 'admin',
                actorUserId: ADMIN_AUTH.userId,
            })
        );
    });

    it('returns 422 when role is missing', async () => {
        const res = await request(app)
            .patch('/api/admin/users/u2/role')
            .set('Authorization', 'Bearer admin.token')
            .send({});

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('returns 403 for non-admin', async () => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(NORMAL_AUTH);

        const res = await request(app)
            .patch('/api/admin/users/u2/role')
            .set('Authorization', 'Bearer normal.token')
            .send({ role: 'normal' });

        expect(res.status).toBe(403);
    });
});
