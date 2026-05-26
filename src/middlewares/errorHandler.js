// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { HttpError, httpStatusCode } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// PostgreSQL error classification (SQLSTATE codes)
// node-postgres sets error.severity + error.code (5-char SQLSTATE)
// ---------------------------------------------------------------------------
const PG_ERROR_MAP = {
  // Class 22 — Data Exception
  '22001': { statusCode: 422, message: 'Value too long for the target field.' },
  '22003': { statusCode: 422, message: 'Numeric value out of range.' },
  '22007': { statusCode: 422, message: 'Invalid date/time format.' },
  '22P02': { statusCode: 400, message: 'Invalid input format.' },
  // Class 23 — Integrity Constraint Violation
  '23502': { statusCode: 422, message: 'A required field is missing.' },
  '23503': { statusCode: 409, message: 'Referenced record does not exist or is in use.' },
  '23505': { statusCode: 409, message: 'A record with the same unique value already exists.' },
  '23514': { statusCode: 422, message: 'Value violates a check constraint.' },
  // Class 42 — Syntax/Schema Errors (server-side, treat as 500)
  '42P01': { statusCode: 500, message: 'Database configuration error (undefined table).' },
  '42703': { statusCode: 500, message: 'Database configuration error (undefined column).' },
  // Class 53 — Insufficient Resources
  '53300': { statusCode: 503, message: 'Database is temporarily unavailable (too many connections).' },
  '53400': { statusCode: 503, message: 'Database configuration limit reached.' },
  // Class 57 — Operator Intervention
  '57014': { statusCode: 504, message: 'Database query timed out.' },
};

function classifyPgError(error) {
  // node-postgres marks DB errors with a `severity` property
  if (!error?.severity || typeof error.code !== 'string') return null;
  const entry = PG_ERROR_MAP[error.code];
  if (!entry) return null;
  return {
    statusCode: entry.statusCode,
    code: httpStatusCode(entry.statusCode),
    message: entry.message,
  };
}

// ---------------------------------------------------------------------------
// JWT error classification (jsonwebtoken library)
// ---------------------------------------------------------------------------
function classifyJwtError(error) {
  switch (error?.name) {
    case 'JsonWebTokenError': return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Invalid token.' };
    case 'TokenExpiredError': return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Token has expired.' };
    case 'NotBeforeError': return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Token is not yet valid.' };
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Main classifier — returns { statusCode, code, message, details? }
// ---------------------------------------------------------------------------
export function classifyError(error) {
  // 1. Our own typed HttpError hierarchy
  if (error instanceof HttpError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details != null ? { details: error.details } : {}),
    };
  }

  // 2. JWT errors
  const jwt = classifyJwtError(error);
  if (jwt) return jwt;

  // 3. PostgreSQL errors
  const pg = classifyPgError(error);
  if (pg) return pg;

  // 4. Generic JS error — don't leak internals in production
  const isProd = process.env.NODE_ENV === 'production';
  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: isProd ? 'An unexpected error occurred.' : (error?.message ?? 'Unknown error'),
  };
}

// ---------------------------------------------------------------------------
// Express error middleware — must have exactly 4 params
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
export function expressErrorHandler(err, req, res, next) {
  const classified = classifyError(err);

  if (classified.statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] ${classified.statusCode} ${classified.code}:`, err);
  }

  res.status(classified.statusCode).json({
    error: {
      status: classified.statusCode,
      code: classified.code,
      message: classified.message,
      ...(classified.details != null ? { details: classified.details } : {}),
    },
  });
}
