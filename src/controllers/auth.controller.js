// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { UnprocessableEntityError } from '../utils/errors.js';
import {
    getRequestDeviceContext,
    loginWithLocalAuth,
    registerWithLocalAuth,
} from '../services/auth.service.js';
import {
    validateLoginPayload,
    validateRegisterPayload,
} from '../models/auth.schema.js';

export async function register(req, res) {
    const body = req.body ?? {};
    const validation = validateRegisterPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, validation.value.deviceName);
    const result = await registerWithLocalAuth({ ...validation.value, ...context });
    res.status(201).json(result);
}

export async function login(req, res) {
    const body = req.body ?? {};
    const validation = validateLoginPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, validation.value.deviceName);
    const result = await loginWithLocalAuth({ ...validation.value, ...context });
    res.json(result);
}
