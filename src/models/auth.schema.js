function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
    return String(value || '').trim();
}

function normalizePassword(value) {
    return String(value || '');
}

function normalizeDeviceName(value) {
    const parsed = String(value || '').trim();
    return parsed || null;
}

export function validateRegisterPayload(payload) {
    const email = normalizeEmail(payload?.email);
    const fullName = normalizeName(payload?.fullName);
    const password = normalizePassword(payload?.password);
    const deviceName = normalizeDeviceName(payload?.deviceName);

    const errors = [];
    if (!email || !email.includes('@') || email.length > 255) {
        errors.push('email must be a valid email address');
    }
    if (!fullName || fullName.length < 2 || fullName.length > 120) {
        errors.push('fullName must contain between 2 and 120 characters');
    }
    if (!password || password.length < 8 || password.length > 128) {
        errors.push('password must contain between 8 and 128 characters');
    }

    return {
        ok: errors.length === 0,
        errors,
        value: { email, fullName, password, deviceName },
    };
}

export function validateLoginPayload(payload) {
    const email = normalizeEmail(payload?.email);
    const password = normalizePassword(payload?.password);
    const deviceName = normalizeDeviceName(payload?.deviceName);

    const errors = [];
    if (!email || !email.includes('@') || email.length > 255) {
        errors.push('email must be a valid email address');
    }
    if (!password || password.length < 8 || password.length > 128) {
        errors.push('password must contain between 8 and 128 characters');
    }

    return {
        ok: errors.length === 0,
        errors,
        value: { email, password, deviceName },
    };
}

export function validateGoogleLoginPayload(payload) {
    const idToken = String(payload?.idToken || '').trim();
    const deviceName = normalizeDeviceName(payload?.deviceName);

    const errors = [];
    if (!idToken) {
        errors.push('idToken is required');
    }

    return {
        ok: errors.length === 0,
        errors,
        value: { idToken, deviceName },
    };
}

export function validateRefreshPayload(payload) {
    const refreshToken = String(payload?.refreshToken || '').trim();
    const errors = [];
    if (!refreshToken) {
        errors.push('refreshToken is required');
    }

    return {
        ok: errors.length === 0,
        errors,
        value: { refreshToken },
    };
}

function normalizeOtpCode(value) {
    return String(value || '').replace(/\D/g, '');
}

export function validateForgotPasswordPayload(payload) {
    const email = normalizeEmail(payload?.email);
    const errors = [];
    if (!email || !email.includes('@') || email.length > 255) {
        errors.push('email must be a valid email address');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { email },
    };
}

export function validateVerifyOtpPayload(payload) {
    const email = normalizeEmail(payload?.email);
    const code = normalizeOtpCode(payload?.code);
    const errors = [];
    if (!email || !email.includes('@') || email.length > 255) {
        errors.push('email must be a valid email address');
    }
    if (!code || code.length !== 6) {
        errors.push('code must be a 6-digit numeric value');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { email, code },
    };
}

export function validateUpdateProfilePayload(payload) {
    const fullName = normalizeName(payload?.fullName);
    const errors = [];
    if (!fullName || fullName.length < 2 || fullName.length > 120) {
        errors.push('fullName must contain between 2 and 120 characters');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { fullName },
    };
}

export function validateChangePasswordPayload(payload) {
    const currentPassword = normalizePassword(payload?.currentPassword);
    const newPassword = normalizePassword(payload?.newPassword);
    const errors = [];
    if (!currentPassword) {
        errors.push('currentPassword is required');
    }
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
        errors.push('newPassword must contain between 8 and 128 characters');
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
        errors.push('newPassword must be different from currentPassword');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { currentPassword, newPassword },
    };
}

export function validateCreatePasswordPayload(payload) {
    const newPassword = normalizePassword(payload?.newPassword);
    const errors = [];
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
        errors.push('newPassword must contain between 8 and 128 characters');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { newPassword },
    };
}

export function validateResetPasswordPayload(payload) {
    const email = normalizeEmail(payload?.email);
    const code = normalizeOtpCode(payload?.code);
    const resetToken = String(payload?.resetToken || '').trim() || null;
    const newPassword = normalizePassword(payload?.newPassword);

    const errors = [];
    if (!email || !email.includes('@') || email.length > 255) {
        errors.push('email must be a valid email address');
    }
    if (!resetToken && (!code || code.length !== 6)) {
        errors.push('either resetToken or a 6-digit code is required');
    }
    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
        errors.push('newPassword must contain between 8 and 128 characters');
    }
    return {
        ok: errors.length === 0,
        errors,
        value: { email, code: code || null, resetToken, newPassword },
    };
}
