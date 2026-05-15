import { sendJson } from '../utils/http.js';
import { corsHeaders } from '../middlewares/cors.js';

export function getRoot(_req, res) {
  sendJson(
    res,
    200,
    {
      name: 'Valtrim API',
      status: 'ok',
    },
    corsHeaders()
  );
}

export function getHealth(_req, res) {
  sendJson(
    res,
    200,
    {
      ok: true,
      service: 'valtrim-api',
      timestamp: new Date().toISOString(),
    },
    corsHeaders()
  );
}
