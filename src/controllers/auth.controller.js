import { UnprocessableEntityError } from '../utils/errors.js';
import {
    changeUserPassword,
    getRequestDeviceContext,
    loginWithGoogleAuth,
    loginWithLocalAuth,
    refreshSessionTokens,
    registerWithLocalAuth,
    requestPasswordReset,
    resetPasswordWithToken,
    revokeAllSessionsForUser,
    revokeSessionById,
    updateUserProfile,
    verifyPasswordResetOtp,
} from '../services/auth.service.js';
import {
    validateChangePasswordPayload,
    validateForgotPasswordPayload,
    validateGoogleLoginPayload,
    validateLoginPayload,
    validateRefreshPayload,
    validateRegisterPayload,
    validateResetPasswordPayload,
    validateUpdateProfilePayload,
    validateVerifyOtpPayload,
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

export async function loginGoogle(req, res) {
    const body = req.body ?? {};
    const validation = validateGoogleLoginPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, validation.value.deviceName);
    const result = await loginWithGoogleAuth({ ...validation.value, ...context });
    res.json(result);
}

export async function refresh(req, res) {
    const body = req.body ?? {};
    const validation = validateRefreshPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await refreshSessionTokens({ ...validation.value, ...context });
    res.json(result);
}

export async function me(req, res) {
    res.json({
        user: {
            id: req.auth.userId,
            email: req.auth.email,
            fullName: req.auth.fullName,
            roles: req.auth.roles,
            permissions: req.auth.permissions,
        },
        session: {
            id: req.auth.sessionId,
        },
    });
}

export async function logout(req, res) {
    await revokeSessionById({
        sessionId: req.auth.sessionId,
        userId: req.auth.userId,
        reason: 'logout',
    });
    res.json({ ok: true });
}

export async function updateProfile(req, res) {
    const body = req.body ?? {};
    const validation = validateUpdateProfilePayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await updateUserProfile({
        userId: req.auth.userId,
        fullName: validation.value.fullName,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });
    res.json(result);
}

export async function changePassword(req, res) {
    const body = req.body ?? {};
    const validation = validateChangePasswordPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await changeUserPassword({
        userId: req.auth.userId,
        currentPassword: validation.value.currentPassword,
        newPassword: validation.value.newPassword,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });
    res.json(result);
}

export async function logoutAll(req, res) {
    await revokeAllSessionsForUser({
        userId: req.auth.userId,
        exceptSessionId: req.auth.sessionId,
        reason: 'logout_all',
    });
    res.json({ ok: true });
}

export async function forgotPassword(req, res) {
    const body = req.body ?? {};
    const validation = validateForgotPasswordPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await requestPasswordReset({
        email: validation.value.email,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });
    res.json(result);
}

export async function verifyPasswordResetCode(req, res) {
    const body = req.body ?? {};
    const validation = validateVerifyOtpPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await verifyPasswordResetOtp({
        email: validation.value.email,
        code: validation.value.code,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });
    res.json(result);
}

export async function resetPassword(req, res) {
    const body = req.body ?? {};
    const validation = validateResetPasswordPayload(body);
    if (!validation.ok) {
        throw new UnprocessableEntityError('Invalid auth request', validation.errors);
    }

    if (!validation.value.resetToken) {
        throw new UnprocessableEntityError('Invalid auth request', ['resetToken is required']);
    }

    const context = getRequestDeviceContext(req, null);
    const result = await resetPasswordWithToken({
        email: validation.value.email,
        resetToken: validation.value.resetToken,
        newPassword: validation.value.newPassword,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
    });
    res.json(result);
}
