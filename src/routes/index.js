import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { extractionRoutes } from './extraction.routes.js';
import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';

export const routes = [
  ...healthRoutes,
  ...authRoutes,
  ...extractionRoutes,
];

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createRouter() {
  const router = Router();
  for (const route of routes) {
    const handlers = [];
    if (route.auth) {
      handlers.push(requireAuth(route.auth));
    }
    handlers.push(asyncHandler(route.handler));
    router[route.method.toLowerCase()](route.path, ...handlers);
  }
  return router;
}
