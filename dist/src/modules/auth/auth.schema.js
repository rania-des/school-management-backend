"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePasswordSchema = exports.resetPasswordWithTokenSchema = exports.resetPasswordSchema = exports.registerSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Adresse email invalide'),
    password: zod_1.z.string().min(6, 'Le mot de passe doit faire au moins 6 caractères'),
});
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z
        .string()
        .min(8, 'Le mot de passe doit faire au moins 8 caractères')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Le mot de passe doit contenir majuscule, minuscule et chiffre'),
    firstName: zod_1.z.string().min(2).max(100),
    lastName: zod_1.z.string().min(2).max(100),
    role: zod_1.z.enum(['student', 'parent', 'teacher', 'admin']),
    gender: zod_1.z.enum(['male', 'female']).optional(),
    phone: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.string().optional(),
});
exports.resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
// Schéma pour la réinitialisation depuis le lien email (?token=xxx)
exports.resetPasswordWithTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, 'Token requis'),
    password: zod_1.z
        .string()
        .min(8)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Le mot de passe doit contenir majuscule, minuscule et chiffre'),
});
exports.updatePasswordSchema = zod_1.z.object({
    password: zod_1.z
        .string()
        .min(8)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Le mot de passe doit contenir majuscule, minuscule et chiffre'),
});
//# sourceMappingURL=auth.schema.js.map