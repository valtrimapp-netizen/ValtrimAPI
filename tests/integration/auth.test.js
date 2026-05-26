// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
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
    getRequestDeviceContext: vi
        .fn()
        .mockReturnValue({ ipAddress: '127.0.0.1', userAgent: 'vitest' }),
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import * as authService from '../../src/services/auth.service.js';

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
// Removed auth endpoints stay unavailable
// ---------------------------------------------------------------------------
describe('removed auth routes', () => {
    it('returns 404 for session/profile endpoints that are no longer exposed', async () => {
        const targets = [
            ['get', '/api/auth/me'],
            ['post', '/api/auth/refresh'],
            ['post', '/api/auth/logout'],
            ['post', '/api/auth/logout-all'],
            ['post', '/api/auth/google'],
        ];

        for (const [method, path] of targets) {
            const res = await request(app)[method](path);
            expect(res.status).toBe(404);
        }
    });
});
