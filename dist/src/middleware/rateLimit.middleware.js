"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strictRateLimit = exports.uploadRateLimit = exports.authRateLimit = exports.globalRateLimit = void 0;
// APRÈS
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const isDev = process.env.NODE_ENV !== 'production';
exports.globalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 10000 : 500, // 10 000 en dev, 500 en prod
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev, // désactivé totalement en dev
    message: { error: 'Too many requests, please try again later' },
});
exports.authRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: isDev ? 1000 : 20, // 1 000 en dev, 20 en prod
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev, // désactivé totalement en dev
    skipSuccessfulRequests: true,
    message: { error: 'Too many authentication attempts, please try again later' },
});
exports.uploadRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: isDev ? 1000 : 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev,
    message: { error: 'Upload limit reached, please try again later' },
});
exports.strictRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60 * 1000,
    max: isDev ? 1000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isDev,
    message: { error: 'Too many requests, please slow down' },
});
//# sourceMappingURL=rateLimit.middleware.js.map