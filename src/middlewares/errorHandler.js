import { sendJson } from '../utils/http.js';
import { corsHeaders } from './cors.js';

export function sendError(res, error, statusCode = 500) {
  sendJson(
    res,
    statusCode,
    {
      error: error instanceof Error ? error.message : 'Internal Server Error',
    },
    corsHeaders()
  );
}
