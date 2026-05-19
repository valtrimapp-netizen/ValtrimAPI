import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    HttpError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    MethodNotAllowedError,
    ConflictError,
    UnprocessableEntityError,
    TooManyRequestsError,
    InternalServerError,
    NotImplementedError,
    ServiceUnavailableError,
    assert,
    httpStatusCode,
} from '../../src/utils/errors.js';
import { classifyError } from '../../src/middlewares/errorHandler.js';

// ---------------------------------------------------------------------------
// httpStatusCode
// ---------------------------------------------------------------------------
describe('httpStatusCode', () => {
    it.each([
        [400, 'BAD_REQUEST'],
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [404, 'NOT_FOUND'],
        [405, 'METHOD_NOT_ALLOWED'],
        [409, 'CONFLICT'],
        [422, 'UNPROCESSABLE_ENTITY'],
        [429, 'TOO_MANY_REQUESTS'],
        [500, 'INTERNAL_SERVER_ERROR'],
        [501, 'NOT_IMPLEMENTED'],
        [503, 'SERVICE_UNAVAILABLE'],
    ])('%i → %s', (code, expected) => {
        expect(httpStatusCode(code)).toBe(expected);
    });

    it('returns UNKNOWN_ERROR for unrecognized codes', () => {
        expect(httpStatusCode(999)).toBe('UNKNOWN_ERROR');
        expect(httpStatusCode(0)).toBe('UNKNOWN_ERROR');
    });
});

// ---------------------------------------------------------------------------
// HttpError hierarchy
// ---------------------------------------------------------------------------
describe('HttpError subclasses', () => {
    it.each([
        [BadRequestError, 400, 'BAD_REQUEST'],
        [UnauthorizedError, 401, 'UNAUTHORIZED'],
        [ForbiddenError, 403, 'FORBIDDEN'],
        [NotFoundError, 404, 'NOT_FOUND'],
        [MethodNotAllowedError, 405, 'METHOD_NOT_ALLOWED'],
        [ConflictError, 409, 'CONFLICT'],
        [UnprocessableEntityError, 422, 'UNPROCESSABLE_ENTITY'],
        [TooManyRequestsError, 429, 'TOO_MANY_REQUESTS'],
        [InternalServerError, 500, 'INTERNAL_SERVER_ERROR'],
        [NotImplementedError, 501, 'NOT_IMPLEMENTED'],
        [ServiceUnavailableError, 503, 'SERVICE_UNAVAILABLE'],
    ])('%s has statusCode=%i and code=%s', (Cls, expectedStatus, expectedCode) => {
        const err = new Cls('test message');
        expect(err.statusCode).toBe(expectedStatus);
        expect(err.code).toBe(expectedCode);
        expect(err.message).toBe('test message');
        expect(err).toBeInstanceOf(HttpError);
        expect(err).toBeInstanceOf(Error);
    });

    it('UnprocessableEntityError carries details array', () => {
        const details = [{ field: 'email', message: 'invalid' }];
        const err = new UnprocessableEntityError('Bad input', details);
        expect(err.details).toEqual(details);
        expect(err.statusCode).toBe(422);
    });

    it('UnprocessableEntityError with no details has no details property', () => {
        const err = new UnprocessableEntityError('Bad input');
        expect(err.details).toBeUndefined();
    });

    it('HttpError accepts a custom code override', () => {
        const err = new HttpError('msg', 400, 'MY_CUSTOM_CODE');
        expect(err.code).toBe('MY_CUSTOM_CODE');
        expect(err.statusCode).toBe(400);
    });

    it('default HttpError uses 500', () => {
        const err = new HttpError('boom');
        expect(err.statusCode).toBe(500);
        expect(err.code).toBe('INTERNAL_SERVER_ERROR');
    });
});

// ---------------------------------------------------------------------------
// assert
// ---------------------------------------------------------------------------
describe('assert', () => {
    it('does not throw for truthy conditions', () => {
        expect(() => assert(true, 'msg')).not.toThrow();
        expect(() => assert(1, 'msg')).not.toThrow();
        expect(() => assert('value', 'msg')).not.toThrow();
        expect(() => assert({}, 'msg')).not.toThrow();
    });

    it('throws HttpError for falsy conditions', () => {
        expect(() => assert(false, 'bad')).toThrow(HttpError);
        expect(() => assert(null, 'bad')).toThrow(HttpError);
        expect(() => assert(0, 'bad')).toThrow(HttpError);
        expect(() => assert('', 'bad')).toThrow(HttpError);
        expect(() => assert(undefined, 'bad')).toThrow(HttpError);
    });

    it('defaults to statusCode 400', () => {
        try {
            assert(false, 'oops');
        } catch (err) {
            expect(err.statusCode).toBe(400);
        }
    });

    it('uses provided statusCode', () => {
        try {
            assert(false, 'not found', 404);
        } catch (err) {
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('not found');
        }
    });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------
describe('classifyError', () => {
    describe('HttpError instances', () => {
        it('returns statusCode and code from the error', () => {
            const err = new NotFoundError('Thing not found');
            expect(classifyError(err)).toEqual({
                statusCode: 404,
                code: 'NOT_FOUND',
                message: 'Thing not found',
            });
        });

        it('includes details when present', () => {
            const details = [{ field: 'name', message: 'required' }];
            const err = new UnprocessableEntityError('invalid', details);
            const result = classifyError(err);
            expect(result.details).toEqual(details);
        });

        it('does not include details key when absent', () => {
            const err = new BadRequestError('bad');
            const result = classifyError(err);
            expect('details' in result).toBe(false);
        });
    });

    describe('JWT errors', () => {
        it.each([
            ['JsonWebTokenError', 'Invalid token.'],
            ['TokenExpiredError', 'Token has expired.'],
            ['NotBeforeError', 'Token is not yet valid.'],
        ])('%s → 401 with correct message', (name, expectedMsg) => {
            const err = new Error('jwt error');
            err.name = name;
            const result = classifyError(err);
            expect(result.statusCode).toBe(401);
            expect(result.code).toBe('UNAUTHORIZED');
            expect(result.message).toBe(expectedMsg);
        });
    });

    describe('PostgreSQL errors', () => {
        function pgError(code) {
            const err = new Error('pg error');
            err.severity = 'ERROR';
            err.code = code;
            return err;
        }

        it.each([
            ['23505', 409], // unique_violation
            ['23503', 409], // foreign_key_violation
            ['23502', 422], // not_null_violation
            ['23514', 422], // check_violation
            ['22P02', 400], // invalid_text_representation
            ['22001', 422], // string_data_right_truncation
            ['42P01', 500], // undefined_table
            ['53300', 503], // too_many_connections
            ['57014', 504], // query_canceled
        ])('SQLSTATE %s → HTTP %i', (sqlstate, expectedStatus) => {
            expect(classifyError(pgError(sqlstate)).statusCode).toBe(expectedStatus);
        });

        it('ignores errors without severity (not a pg error)', () => {
            const err = new Error('not pg');
            err.code = '23505'; // looks like pg but no severity
            expect(classifyError(err).statusCode).toBe(500);
        });
    });

    describe('generic errors', () => {
        it('maps generic Error to 500', () => {
            const result = classifyError(new Error('boom'));
            expect(result.statusCode).toBe(500);
            expect(result.code).toBe('INTERNAL_SERVER_ERROR');
        });

        it('exposes message in development', () => {
            const original = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            const result = classifyError(new Error('secret details'));
            process.env.NODE_ENV = original;
            expect(result.message).toBe('secret details');
        });

        it('hides internal message in production', () => {
            const original = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            const result = classifyError(new Error('secret internal error'));
            process.env.NODE_ENV = original;
            expect(result.message).not.toContain('secret');
        });
    });
});
