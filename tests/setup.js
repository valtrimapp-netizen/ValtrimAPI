// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
// Set all env vars BEFORE any module is loaded.
// env.js uses loadEnvFile which only sets vars that are undefined,
// so these values will take precedence over .env.
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // random port, not used in tests (we use supertest)
process.env.CORS_ORIGIN = '*';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_valtrim';
process.env.DB_SSL_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
process.env.JWT_ISSUER = 'valtrim-test';
process.env.JWT_AUDIENCE = 'valtrim-web-test';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.STORAGE_ROOT = '/tmp/valtrim-test';
