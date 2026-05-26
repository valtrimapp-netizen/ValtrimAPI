// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
import { describe, it, expect } from 'vitest';
import {
    validateRegisterPayload,
    validateLoginPayload,
    validateGoogleLoginPayload,
    validateRefreshPayload,
} from '../../src/models/auth.schema.js';

// ---------------------------------------------------------------------------
// validateRegisterPayload
// ---------------------------------------------------------------------------
describe('validateRegisterPayload', () => {
    const valid = {
        email: 'user@example.com',
        fullName: 'John Doe',
        password: 'securePass1',
    };

    it('accepts valid input', () => {
        const result = validateRegisterPayload(valid);
        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('normalizes email to lowercase and trims whitespace', () => {
        const result = validateRegisterPayload({ ...valid, email: '  TEST@EXAMPLE.COM  ' });
        expect(result.value.email).toBe('test@example.com');
    });

    it('trims fullName', () => {
        const result = validateRegisterPayload({ ...valid, fullName: '  Jane  ' });
        expect(result.value.fullName).toBe('Jane');
    });

    it('defaults deviceName to null when omitted', () => {
        const result = validateRegisterPayload(valid);
        expect(result.value.deviceName).toBeNull();
    });

    it('passes deviceName through when provided', () => {
        const result = validateRegisterPayload({ ...valid, deviceName: 'My Phone' });
        expect(result.value.deviceName).toBe('My Phone');
    });

    it('rejects missing email', () => {
        const result = validateRegisterPayload({ ...valid, email: '' });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes('email'))).toBe(true);
    });

    it('rejects email without @', () => {
        const result = validateRegisterPayload({ ...valid, email: 'notanemail' });
        expect(result.ok).toBe(false);
    });

    it('rejects fullName shorter than 2 characters', () => {
        const result = validateRegisterPayload({ ...valid, fullName: 'A' });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes('fullName'))).toBe(true);
    });

    it('rejects password shorter than 8 characters', () => {
        const result = validateRegisterPayload({ ...valid, password: 'short' });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.includes('password'))).toBe(true);
    });

    it('rejects password longer than 128 characters', () => {
        const result = validateRegisterPayload({ ...valid, password: 'a'.repeat(129) });
        expect(result.ok).toBe(false);
    });

    it('accumulates multiple errors', () => {
        const result = validateRegisterPayload({ email: 'bad', fullName: 'A', password: 'short' });
        expect(result.ok).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('handles null/undefined payload gracefully', () => {
        expect(validateRegisterPayload(null).ok).toBe(false);
        expect(validateRegisterPayload(undefined).ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateLoginPayload
// ---------------------------------------------------------------------------
describe('validateLoginPayload', () => {
    const valid = { email: 'user@example.com', password: 'securePass1' };

    it('accepts valid input', () => {
        expect(validateLoginPayload(valid).ok).toBe(true);
    });

    it('normalizes email to lowercase', () => {
        const result = validateLoginPayload({ ...valid, email: 'USER@EXAMPLE.COM' });
        expect(result.value.email).toBe('user@example.com');
    });

    it('rejects missing email', () => {
        expect(validateLoginPayload({ ...valid, email: '' }).ok).toBe(false);
    });

    it('rejects short password', () => {
        expect(validateLoginPayload({ ...valid, password: 'short' }).ok).toBe(false);
    });

    it('handles null payload gracefully', () => {
        expect(validateLoginPayload(null).ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateGoogleLoginPayload
// ---------------------------------------------------------------------------
describe('validateGoogleLoginPayload', () => {
    it('accepts valid idToken', () => {
        const result = validateGoogleLoginPayload({ idToken: 'google-id-token-string' });
        expect(result.ok).toBe(true);
        expect(result.value.idToken).toBe('google-id-token-string');
    });

    it('rejects empty idToken', () => {
        expect(validateGoogleLoginPayload({ idToken: '' }).ok).toBe(false);
    });

    it('rejects missing idToken', () => {
        expect(validateGoogleLoginPayload({}).ok).toBe(false);
    });

    it('trims idToken', () => {
        const result = validateGoogleLoginPayload({ idToken: '  token123  ' });
        expect(result.value.idToken).toBe('token123');
    });
});

// ---------------------------------------------------------------------------
// validateRefreshPayload
// ---------------------------------------------------------------------------
describe('validateRefreshPayload', () => {
    it('accepts valid refreshToken', () => {
        const result = validateRefreshPayload({ refreshToken: 'some-opaque-token' });
        expect(result.ok).toBe(true);
        expect(result.value.refreshToken).toBe('some-opaque-token');
    });

    it('rejects empty refreshToken', () => {
        expect(validateRefreshPayload({ refreshToken: '' }).ok).toBe(false);
    });

    it('rejects missing refreshToken', () => {
        expect(validateRefreshPayload({}).ok).toBe(false);
    });
});
