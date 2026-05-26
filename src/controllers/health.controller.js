// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { checkDatabaseConnection } from '../config/database.js';

export function getRoot(_req, res) {
  res.json({ name: 'Valtrim API', status: 'ok' });
}

export async function getHealth(_req, res) {
  const database = await checkDatabaseConnection();
  res.json({
    ok: true,
    service: 'valtrim-api',
    timestamp: new Date().toISOString(),
    database,
  });
}
