// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { getHealth, getRoot } from '../controllers/health.controller.js';

export const healthRoutes = [
  {
    method: 'GET',
    path: '/',
    handler: getRoot,
  },
  {
    method: 'GET',
    path: '/health',
    handler: getHealth,
  },
];
