// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
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
