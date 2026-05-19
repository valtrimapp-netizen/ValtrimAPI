import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDbPool, closeDbPool } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');

function hashContent(content) {
    // Normalize line endings to LF so Windows CRLF never causes a mismatch.
    return crypto.createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function hashContentLegacy(content) {
    // Backward compatibility for checksums created before line-ending normalization.
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function hashContentAsCrlf(content) {
    // Compatibility with files hashed when checked out with CRLF.
    return crypto.createHash('sha256').update(content.replace(/\r?\n/g, '\r\n'), 'utf8').digest('hex');
}

async function ensureMigrationsTable(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool) {
    const result = await pool.query('SELECT file_name, checksum FROM schema_migrations');
    return new Map(result.rows.map((row) => [row.file_name, row.checksum]));
}

async function run() {
    const pool = getDbPool();
    await ensureMigrationsTable(pool);

    const files = (await fs.readdir(migrationsDir))
        .filter((file) => file.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
        console.log('No SQL migrations found.');
        return;
    }

    const applied = await getAppliedMigrations(pool);

    for (const fileName of files) {
        const filePath = path.join(migrationsDir, fileName);
        const sql = await fs.readFile(filePath, 'utf8');
        const checksum = hashContent(sql);
        const legacyChecksum = hashContentLegacy(sql);
        const crlfChecksum = hashContentAsCrlf(sql);

        if (applied.has(fileName)) {
            const existingChecksum = applied.get(fileName);
            if (existingChecksum === checksum) {
                console.log(`Skipping ${fileName} (already applied)`);
                continue;
            }

            if (existingChecksum === legacyChecksum || existingChecksum === crlfChecksum) {
                // Automatically upgrade legacy checksum format to normalized format.
                await pool.query('UPDATE schema_migrations SET checksum = $2 WHERE file_name = $1', [fileName, checksum]);
                console.log(`Skipping ${fileName} (already applied, checksum format upgraded)`);
                continue;
            }

            if (existingChecksum !== checksum) {
                throw new Error(
                    `Checksum mismatch for already applied migration: ${fileName}. `
                    + `stored=${existingChecksum}, normalized=${checksum}, legacyRaw=${legacyChecksum}, crlfRaw=${crlfChecksum}`,
                );
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (file_name, checksum) VALUES ($1, $2)', [fileName, checksum]);
            await client.query('COMMIT');
            console.log(`Applied ${fileName}`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    console.log('Migrations completed successfully.');
}

try {
    await run();
} finally {
    await closeDbPool();
}
