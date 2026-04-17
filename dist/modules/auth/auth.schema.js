"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePasswordSchema = exports.resetPasswordSchema = exports.changePasswordSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
    firstName: zod_1.z.string().min(2).max(100),
    lastName: zod_1.z.string().min(2).max(100),
    role: zod_1.z.enum(['student', 'parent', 'teacher', 'admin']),
    gender: zod_1.z.enum(['male', 'female']).optional(),
    phone: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});
exports.resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.updatePasswordSchema = zod_1.z.object({
    password: zod_1.z.string().min(8)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});
//# sourceMappingURL=auth.schema.js.map