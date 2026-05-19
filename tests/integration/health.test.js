import { vi, describe, it, expect, beforeEach } from 'vitest';

// Must be declared before importing app so Vitest hoists the mock
vi.mock('../../src/config/database.js', () => ({
    checkDatabaseConnection: vi.fn(),
    getDbPool: vi.fn(),
    query: vi.fn(),
    verifyDatabaseAtStartup: vi.fn().mockResolvedValue(undefined),
    closeDbPool: vi.fn(),
}));

import request from 'supertest';
import { app } from '../../src/app.js';
import * as db from '../../src/config/database.js';

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------
describe('GET /', () => {
    it('returns 200 with API name and status', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ name: 'Valtrim API', status: 'ok' });
    });

    it('sets Content-Type application/json', async () => {
        const res = await request(app).get('/');
        expect(res.headers['content-type']).toMatch(/application\/json/);
    });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
    beforeEach(() => {
        vi.mocked(db.checkDatabaseConnection).mockResolvedValue({ ok: true, latencyMs: 3 });
    });

    it('returns 200 with health structure', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            ok: true,
            service: 'valtrim-api',
            database: { ok: true },
        });
        expect(typeof res.body.timestamp).toBe('string');
    });

    it('reflects database degraded state', async () => {
        vi.mocked(db.checkDatabaseConnection).mockResolvedValue({ ok: false, error: 'timeout' });
        const res = await request(app).get('/health');
        expect(res.status).toBe(200); // health always responds, reports state in body
        expect(res.body.database.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 404 for unknown routes
// ---------------------------------------------------------------------------
describe('unknown routes', () => {
    it('returns 404 with structured error', async () => {
        const res = await request(app).get('/api/does-not-exist');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatchObject({
            status: 404,
            code: 'NOT_FOUND',
        });
    });

    it('includes the attempted method in the message', async () => {
        const res = await request(app).post('/api/no-such-route');
        expect(res.status).toBe(404);
        expect(res.body.error.message).toContain('POST');
    });
});
