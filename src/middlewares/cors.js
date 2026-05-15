import { env } from '../config/env.js';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': env.corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export function handleCors(req, res) {
  if (req.method !== 'OPTIONS') return false;

  res.writeHead(204, corsHeaders());
  res.end();
  return true;
}
