// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { Pool } from 'pg';
import { env } from './env.js';

let pool;

function buildPoolConfig() {
    if (!env.databaseUrl) {
        return null;
    }

    const config = {
        connectionString: env.databaseUrl,
        max: env.databasePoolMax,
        idleTimeoutMillis: env.databaseIdleTimeoutMs,
        connectionTimeoutMillis: env.databaseConnectionTimeoutMs,
    };

    if (env.databaseSslEnabled) {
        config.ssl = { rejectUnauthorized: env.databaseSslRejectUnauthorized };
    }

    return config;
}

export function getDbPool() {
    if (!pool) {
        const config = buildPoolConfig();
        if (!config) {
            throw new Error('DATABASE_URL is not configured');
        }

        pool = new Pool(config);
        pool.on('error', (error) => {
            console.error('Unexpected PostgreSQL pool error:', error);
        });
    }

    return pool;
}

export async function closeDbPool() {
    if (!pool) {
        return;
    }

    const activePool = pool;
    pool = undefined;
    await activePool.end();
}

export async function query(text, params = []) {
    return getDbPool().query(text, params);
}

export async function checkDatabaseConnection() {
    if (!env.databaseUrl) {
        return {
            ok: false,
            error: 'DATABASE_URL is not configured',
        };
    }

    try {
        await query('SELECT 1');
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Database connection failed',
        };
    }
}

export async function verifyDatabaseAtStartup() {
    const result = await checkDatabaseConnection();

    if (result.ok) {
        console.log('PostgreSQL connection verified.');
        return;
    }

    const message = `PostgreSQL not ready: ${result.error}`;
    if (env.databaseRequired) {
        throw new Error(message);
    }

    console.warn(message);
}
