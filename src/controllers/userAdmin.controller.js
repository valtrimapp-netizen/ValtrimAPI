import { UnprocessableEntityError } from '../utils/errors.js';
import { getRequestDeviceContext } from '../services/auth.service.js';
import { listUsersForAdmin, updateUserRoleByAdmin } from '../services/userAdmin.service.js';
import { validateUpdateUserRolePayload } from '../models/userAdmin.schema.js';

export async function listUsers(req, res) {
    const response = await listUsersForAdmin();
    res.json(response);
}

export async function updateUserRole(req, res) {
    const targetUserId = String(req.params?.userId || '').trim();
    if (!targetUserId) {
        throw new UnprocessableEntityError('Invalid admin request', ['userId is required']);
    }

    const validation = validateUpdateUserRolePayload(req.body ?? {});
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid admin request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const response = await updateUserRoleByAdmin({
        targetUserId,
        roleCode: validation.value.role,
        actorUserId: req.auth.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });

    res.json(response);
}
