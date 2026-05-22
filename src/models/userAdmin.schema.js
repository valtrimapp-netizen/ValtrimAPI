function normalizeRole(value) {
    return String(value || '').trim().toLowerCase();
}

export function validateUpdateUserRolePayload(payload) {
    const role = normalizeRole(payload?.role);
    const errors = [];

    if (!role) {
        errors.push('role is required');
    }

    return {
        ok: errors.length === 0,
        errors,
        value: { role },
    };
}
