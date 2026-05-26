// WATERMARK_AUTHOR: Hecho por Gerardo Esparza
const STATUS_CODES = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    402: 'PAYMENT_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    406: 'NOT_ACCEPTABLE',
    408: 'REQUEST_TIMEOUT',
    409: 'CONFLICT',
    410: 'GONE',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'UNPROCESSABLE_ENTITY',
    423: 'LOCKED',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    501: 'NOT_IMPLEMENTED',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
};

export function httpStatusCode(statusCode) {
    return STATUS_CODES[statusCode] ?? 'UNKNOWN_ERROR';
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------
export class HttpError extends Error {
    constructor(message, statusCode = 500, code = null) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.code = code ?? httpStatusCode(statusCode);
    }
}

// ---------------------------------------------------------------------------
// 4xx — Client errors
// ---------------------------------------------------------------------------
export class BadRequestError extends HttpError {
    constructor(message = 'Bad Request') {
        super(message, 400);
        this.name = 'BadRequestError';
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends HttpError {
    constructor(message = 'Forbidden') {
        super(message, 403);
        this.name = 'ForbiddenError';
    }
}

export class NotFoundError extends HttpError {
    constructor(message = 'Not Found') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

export class MethodNotAllowedError extends HttpError {
    constructor(message = 'Method Not Allowed') {
        super(message, 405);
        this.name = 'MethodNotAllowedError';
    }
}

export class ConflictError extends HttpError {
    constructor(message = 'Conflict') {
        super(message, 409);
        this.name = 'ConflictError';
    }
}

/** Use `details` for field-level validation errors: [{ field, message }] */
export class UnprocessableEntityError extends HttpError {
    constructor(message = 'Unprocessable Entity', details = null) {
        super(message, 422);
        this.name = 'UnprocessableEntityError';
        if (details != null) this.details = details;
    }
}

export class TooManyRequestsError extends HttpError {
    constructor(message = 'Too Many Requests') {
        super(message, 429);
        this.name = 'TooManyRequestsError';
    }
}

// ---------------------------------------------------------------------------
// 5xx — Server errors
// ---------------------------------------------------------------------------
export class InternalServerError extends HttpError {
    constructor(message = 'Internal Server Error') {
        super(message, 500);
        this.name = 'InternalServerError';
    }
}

export class NotImplementedError extends HttpError {
    constructor(message = 'Not Implemented') {
        super(message, 501);
        this.name = 'NotImplementedError';
    }
}

export class ServiceUnavailableError extends HttpError {
    constructor(message = 'Service Unavailable') {
        super(message, 503);
        this.name = 'ServiceUnavailableError';
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function assert(condition, message, statusCode = 400) {
    if (!condition) throw new HttpError(message, statusCode);
}
