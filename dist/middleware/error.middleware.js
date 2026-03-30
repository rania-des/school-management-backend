"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = exports.AppError = void 0;
const zod_1 = require("zod");
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
const errorHandler = (err, _req, res, _next) => {
    // Zod validation errors
    if (err instanceof zod_1.ZodError) {
        return res.status(422).json({
            error: 'Validation failed',
            details: err.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            })),
        });
    }
    // Known operational errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: err.message,
        });
    }
    // Supabase / PostgreSQL errors
    if (err.code) {
        const code = err.code;
        if (code === '23505') {
            return res.status(409).json({ error: 'Resource already exists' });
        }
        if (code === '23503') {
            return res.status(400).json({ error: 'Referenced resource not found' });
        }
    }
    // Unhandled errors
    console.error('Unhandled error:', err);
    return res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
};
exports.errorHandler = errorHandler;
const notFound = (_req, res) => {
    res.status(404).json({ error: 'Route not found' });
};
exports.notFound = notFound;
//# sourceMappingURL=error.middleware.js.map