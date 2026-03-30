import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email?: string;
    password?: string;
}, {
    email?: string;
    password?: string;
}>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    role: z.ZodEnum<["student", "parent", "teacher", "admin"]>;
    gender: z.ZodOptional<z.ZodEnum<["male", "female"]>>;
    phone: z.ZodOptional<z.ZodString>;
    dateOfBirth: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email?: string;
    phone?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: "student" | "teacher" | "parent" | "admin";
    gender?: "male" | "female";
    dateOfBirth?: string;
}, {
    email?: string;
    phone?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: "student" | "teacher" | "parent" | "admin";
    gender?: "male" | "female";
    dateOfBirth?: string;
}>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword?: string;
    newPassword?: string;
}, {
    currentPassword?: string;
    newPassword?: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email?: string;
}, {
    email?: string;
}>;
export declare const updatePasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password?: string;
}, {
    password?: string;
}>;
//# sourceMappingURL=auth.schema.d.ts.map