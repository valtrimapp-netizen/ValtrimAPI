import { extractionRoutes } from './extraction.routes.js';
import { healthRoutes } from './health.routes.js';

export const routes = [
  ...healthRoutes,
  ...extractionRoutes,
];

export function matchRoute(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const segments = splitPath(url.pathname);

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const routeSegments = splitPath(route.path);
    if (routeSegments.length !== segments.length) continue;

    const params = {};
    let matched = true;
    for (let i = 0; i < routeSegments.length; i += 1) {
      const part = routeSegments[i];
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segments[i]);
      } else if (part !== segments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      req.params = params;
      return route;
    }
  }
  return null;
}

function splitPath(pathname) {
  return pathname.split('/').filter(Boolean);
}
