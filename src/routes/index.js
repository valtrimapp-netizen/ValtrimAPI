// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { Router } from 'express';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';

export const routes = [
  ...healthRoutes,
  ...authRoutes,
];

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createRouter() {
  const router = Router();
  for (const route of routes) {
    router[route.method.toLowerCase()](route.path, asyncHandler(route.handler));
  }
  return router;
}
