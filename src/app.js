import { handleCors, corsHeaders } from './middlewares/cors.js';
import { sendError } from './middlewares/errorHandler.js';
import { matchRoute } from './routes/index.js';
import { notFound } from './utils/http.js';

export async function requestHandler(req, res) {
  if (!req.url) {
    sendError(res, new Error('Invalid request'), 400);
    return;
  }

  if (handleCors(req, res)) {
    return;
  }

  const route = matchRoute(req);
  if (!route) {
    notFound(req, res, corsHeaders());
    return;
  }

  try {
    await route.handler(req, res);
  } catch (error) {
    sendError(res, error);
  }
}
