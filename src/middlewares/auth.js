import { authenticateAccessToken } from '../services/auth.service.js';
import { HttpError } from '../utils/errors.js';

export async function authorizeRequest(req, routeAuthConfig = {}) {
    if (!routeAuthConfig?.required) {
        return null;
    }

    const auth = await authenticateAccessToken(req.headers?.authorization);

    const requiredRoles = Array.isArray(routeAuthConfig.roles) ? routeAuthConfig.roles : [];
    if (requiredRoles.length > 0) {
        const hasRole = auth.roles.some((role) => requiredRoles.includes(role));
        if (!hasRole) {
            throw new HttpError('Forbidden', 403);
        }
    }

    const permissions = new Set(Array.isArray(auth.permissions) ? auth.permissions : []);
    const requiredPermissionsAll = Array.isArray(routeAuthConfig.permissionsAll) ? routeAuthConfig.permissionsAll : [];
    const requiredPermissionsAny = Array.isArray(routeAuthConfig.permissionsAny) ? routeAuthConfig.permissionsAny : [];

    if (requiredPermissionsAll.length > 0) {
        const missing = requiredPermissionsAll.filter((permission) => !permissions.has(permission));
        if (missing.length > 0) {
            throw new HttpError('Forbidden', 403);
        }
    }

    if (requiredPermissionsAny.length > 0) {
        const hasAnyPermission = requiredPermissionsAny.some((permission) => permissions.has(permission));
        if (!hasAnyPermission) {
            throw new HttpError('Forbidden', 403);
        }
    }

    req.auth = auth;
    return auth;
}

/**
 * Express middleware factory. Apply to individual routes in the router.
 * Usage: requireAuth({ required: true, permissionsAll: ['x.read'] })
 */
export function requireAuth(config = {}) {
    return async (req, res, next) => {
        try {
            await authorizeRequest(req, config);
            next();
        } catch (err) {
            next(err);
        }
    };
}
