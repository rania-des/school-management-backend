"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public routes
router.post('/login', auth_controller_1.authController.login.bind(auth_controller_1.authController));
router.post('/register', auth_controller_1.authController.register.bind(auth_controller_1.authController));
router.post('/refresh', auth_controller_1.authController.refresh.bind(auth_controller_1.authController));
router.post('/forgot-password', auth_controller_1.authController.forgotPassword.bind(auth_controller_1.authController));
// Protected routes
router.use(auth_middleware_1.authenticate);
router.post('/logout', auth_controller_1.authController.logout.bind(auth_controller_1.authController));
router.get('/me', auth_controller_1.authController.getMe.bind(auth_controller_1.authController));
router.patch('/password', auth_controller_1.authController.updatePassword.bind(auth_controller_1.authController));
exports.default = router;
//# sourceMappingURL=auth.routes.js.map