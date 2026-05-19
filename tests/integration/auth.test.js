import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted before any imports that trigger the module graph
// ---------------------------------------------------------------------------
vi.mock('../../src/config/database.js', () => ({
    checkDatabaseConnection: vi.fn().mockResolvedValue({ ok: true }),
    getDbPool: vi.fn(),
    query: vi.fn(),
    verifyDatabaseAtStartup: vi.fn().mockResolvedValue(undefined),
    closeDbPool: vi.fn(),
}));

vi.mock('../../src/services/auth.service.js', () => ({
    registerWithLocalAuth: vi.fn(),
    loginWithLocalAuth: vi.fn(),
    loginWithGoogleAuth: vi.fn(),
    refreshSessionTokens: vi.fn(),
    revokeSessionById: vi.fn(),
    revokeAllSessionsForUser: vi.fn(),
    authenticateAccessToken: vi.fn(),
    getRequestDeviceContext: vi
        .fn()
        .mockReturnValue({ ipAddress: '127.0.0.1', userAgent: 'vitest' }),
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/services/auth.service.js';

// Shared mock auth payload returned by authenticateAccessToken for protected routes
const MOCK_AUTH = {
    userId: 'user-uuid-1234',
    sessionId: 'session-uuid-5678',
    email: 'test@example.com',
    fullName: 'Test User',
    roles: ['normal'],
    permissions: [
        'auth.self.read',
        'auth.session.revoke',
        'auth.session.revoke_all',
    ],
};

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
    const validBody = {
        email: 'new@example.com',
        fullName: 'New User',
        password: 'StrongPass123',
    };

    beforeEach(() => {
        vi.mocked(authService.registerWithLocalAuth).mockResolvedValue({
            accessToken: 'access.token.here',
            refreshToken: 'refresh-token-opaque',
            user: { id: 'user-uuid', email: validBody.email, fullName: validBody.fullName },
        });
    });

    it('returns 201 with tokens on valid input', async () => {
        const res = await request(app).post('/api/auth/register').send(validBody);
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
    });

    it('calls registerWithLocalAuth with normalized email', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ ...validBody, email: 'NEW@EXAMPLE.COM' });
        expect(vi.mocked(authService.registerWithLocalAuth)).toHaveBeenCalledWith(
            expect.objectContaining({ email: 'new@example.com' })
        );
    });

    it('returns 422 with details on invalid body', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'bad', fullName: 'A', password: 'short' });
        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
        expect(Array.isArray(res.body.error.details)).toBe(true);
        expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
    });

    it('returns 422 when body is empty', async () => {
        const res = await request(app).post('/api/auth/register').send({});
        expect(res.status).toBe(422);
    });

    it('returns structured error on service failure', async () => {
        vi.mocked(authService.registerWithLocalAuth).mockRejectedValue(
            new Error('unexpected')
        );
        const res = await request(app).post('/api/auth/register').send(validBody);
        expect(res.status).toBe(500);
        expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
    const validBody = { email: 'user@example.com', password: 'password123' };

    beforeEach(() => {
        vi.mocked(authService.loginWithLocalAuth).mockResolvedValue({
            accessToken: 'access.token',
            refreshToken: 'refresh-token',
            user: { id: 'user-uuid', email: validBody.email },
        });
    });

    it('returns 200 with tokens on valid credentials', async () => {
        const res = await request(app).post('/api/auth/login').send(validBody);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
    });

    it('returns 422 on missing password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'user@example.com' });
        expect(res.status).toBe(422);
    });

    it('forwards service errors as structured responses', async () => {
        const { HttpError } = await import('../../src/utils/errors.js');
        vi.mocked(authService.loginWithLocalAuth).mockRejectedValue(
            new HttpError('Invalid credentials', 401)
        );
        const res = await request(app).post('/api/auth/login').send(validBody);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
describe('POST /api/auth/refresh', () => {
    beforeEach(() => {
        vi.mocked(authService.refreshSessionTokens).mockResolvedValue({
            accessToken: 'new.access.token',
            refreshToken: 'new-refresh-token',
        });
    });

    it('returns 200 with new tokens', async () => {
        const res = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken: 'valid-opaque-token' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body).toHaveProperty('refreshToken');
    });

    it('returns 422 when refreshToken is missing', async () => {
        const res = await request(app).post('/api/auth/refresh').send({});
        expect(res.status).toBe(422);
    });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me  (protected)
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
    it('returns 401 when no Authorization header', async () => {
        vi.mocked(authService.authenticateAccessToken).mockRejectedValue(
            new (await import('../../src/utils/errors.js')).UnauthorizedError('No token')
        );
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with user and session on valid token', async () => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(MOCK_AUTH);
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer valid.jwt.token');
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({
            id: MOCK_AUTH.userId,
            email: MOCK_AUTH.email,
            roles: MOCK_AUTH.roles,
            permissions: MOCK_AUTH.permissions,
        });
        expect(res.body.session.id).toBe(MOCK_AUTH.sessionId);
    });

    it('returns 403 when token lacks required permission', async () => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue({
            ...MOCK_AUTH,
            permissions: [], // no permissions at all
        });
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer limited.jwt.token');
        expect(res.status).toBe(403);
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout  (protected)
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
    beforeEach(() => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(MOCK_AUTH);
        vi.mocked(authService.revokeSessionById).mockResolvedValue(undefined);
    });

    it('returns 200 on successful logout', async () => {
        const res = await request(app)
            .post('/api/auth/logout')
            .set('Authorization', 'Bearer valid.jwt.token');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('calls revokeSessionById with correct ids', async () => {
        await request(app)
            .post('/api/auth/logout')
            .set('Authorization', 'Bearer valid.jwt.token');
        expect(vi.mocked(authService.revokeSessionById)).toHaveBeenCalledWith(
            expect.objectContaining({
                sessionId: MOCK_AUTH.sessionId,
                userId: MOCK_AUTH.userId,
            })
        );
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout-all  (protected)
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout-all', () => {
    beforeEach(() => {
        vi.mocked(authService.authenticateAccessToken).mockResolvedValue(MOCK_AUTH);
        vi.mocked(authService.revokeAllSessionsForUser).mockResolvedValue(undefined);
    });

    it('returns 200 on successful logout-all', async () => {
        const res = await request(app)
            .post('/api/auth/logout-all')
            .set('Authorization', 'Bearer valid.jwt.token');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});
