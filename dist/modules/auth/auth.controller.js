"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.AuthController = void 0;
const auth_service_1 = require("./auth.service");
const auth_schema_1 = require("./auth.schema");
class AuthController {
    async login(req, res, next) {
        try {
            const body = auth_schema_1.loginSchema.parse(req.body);
            const result = await auth_service_1.authService.login(body.email, body.password);
            return res.status(200).json(result);
        }
        catch (err) {
            return next(err);
        }
    }
    async register(req, res, next) {
        try {
            const body = auth_schema_1.registerSchema.parse(req.body);
            const result = await auth_service_1.authService.register(body);
            return res.status(201).json(result);
        }
        catch (err) {
            return next(err);
        }
    }
    async refresh(req, res, next) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({ error: 'Refresh token required' });
            }
            const result = await auth_service_1.authService.refreshToken(refreshToken);
            return res.json(result);
        }
        catch (err) {
            return next(err);
        }
    }
    async logout(req, res, next) {
        try {
            await auth_service_1.authService.logout(req.user.id);
            return res.status(200).json({ message: 'Logged out successfully' });
        }
        catch (err) {
            return next(err);
        }
    }
    async forgotPassword(req, res, next) {
        try {
            const { email } = auth_schema_1.resetPasswordSchema.parse(req.body);
            const result = await auth_service_1.authService.forgotPassword(email);
            return res.json(result);
        }
        catch (err) {
            return next(err);
        }
    }
    async updatePassword(req, res, next) {
        try {
            const { password } = auth_schema_1.updatePasswordSchema.parse(req.body);
            const result = await auth_service_1.authService.updatePassword(req.user.id, password);
            return res.json(result);
        }
        catch (err) {
            return next(err);
        }
    }
    async getMe(req, res, next) {
        try {
            const result = await auth_service_1.authService.getMe(req.user.id);
            return res.json(result);
        }
        catch (err) {
            return next(err);
        }
    }
}
exports.AuthController = AuthController;
exports.authController = new AuthController();
//# sourceMappingURL=auth.controller.js.map