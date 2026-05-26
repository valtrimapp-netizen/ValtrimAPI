// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..', '..');
const workspaceRoot = path.resolve(apiRoot, '..');

loadEnvFile(path.join(apiRoot, '.env'));

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSslEnabled: parseBoolean(process.env.DB_SSL_ENABLED, true),
  databaseSslRejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, false),
  databasePoolMax: parseNumber(process.env.DB_POOL_MAX, 10),
  databaseIdleTimeoutMs: parseNumber(process.env.DB_IDLE_TIMEOUT_MS, 30000),
  databaseConnectionTimeoutMs: parseNumber(process.env.DB_CONNECTION_TIMEOUT_MS, 5000),
  databaseHealthTimeoutMs: parseNumber(process.env.DB_HEALTH_TIMEOUT_MS, 3000),
  databaseRequired: parseBoolean(process.env.DB_REQUIRED, false),
  jwtIssuer: process.env.JWT_ISSUER || 'valtrim-api',
  jwtAudience: process.env.JWT_AUDIENCE || 'valtrim-web',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtAccessTtlSeconds: parseNumber(process.env.JWT_ACCESS_TTL_SECONDS, 900),
  refreshTokenTtlDays: Math.max(1, parseNumber(process.env.REFRESH_TOKEN_TTL_DAYS, 30)),
  apiRoot,
  workspaceRoot,
};
