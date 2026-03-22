"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const storage_1 = require("../../utils/storage");
const multer_1 = __importDefault(require("multer"));
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const updateProfileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(2).max(100).optional(),
    lastName: zod_1.z.string().min(2).max(100).optional(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    gender: zod_1.z.enum(['male', 'female']).optional(),
    dateOfBirth: zod_1.z.string().optional(),
});
// GET /users/me/profile - update own profile
router.get('/me/profile', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('Profile not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/me/profile
router.patch('/me/profile', async (req, res, next) => {
    try {
        const body = updateProfileSchema.parse(req.body);
        const updateData = {};
        if (body.firstName)
            updateData.first_name = body.firstName;
        if (body.lastName)
            updateData.last_name = body.lastName;
        if (body.phone !== undefined)
            updateData.phone = body.phone;
        if (body.address !== undefined)
            updateData.address = body.address;
        if (body.gender)
            updateData.gender = body.gender;
        if (body.dateOfBirth)
            updateData.date_of_birth = body.dateOfBirth;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', req.user.id)
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to update profile', 500);
        return res.json((0, pagination_1.successResponse)(data, 'Profile updated successfully'));
    }
    catch (err) {
        return next(err);
    }
});
// POST /users/me/avatar
router.post('/me/avatar', upload.single('avatar'), async (req, res, next) => {
    try {
        if (!req.file)
            throw new error_middleware_1.AppError('No file uploaded', 400);
        const url = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.AVATARS, req.file, req.user.id);
        const { data } = await supabase_1.supabaseAdmin
            .from('profiles')
            .update({ avatar_url: url })
            .eq('id', req.user.id)
            .select('avatar_url')
            .single();
        return res.json((0, pagination_1.successResponse)({ avatarUrl: data?.avatar_url }));
    }
    catch (err) {
        return next(err);
    }
});
// ==================== ADMIN ROUTES ====================
// GET /users - list all users (admin only)
router.get('/', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { page, limit, offset } = (0, pagination_1.getPagination)(req);
        const { role, search } = req.query;
        let query = supabase_1.supabaseAdmin
            .from('profiles')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (role)
            query = query.eq('role', role);
        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        }
        const { data, count, error } = await query;
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch users', 500);
        return res.json((0, pagination_1.paginate)(data || [], count || 0, { page, limit, offset }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /users/:id (admin only)
router.get('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('User not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/:id/status (admin: activate/deactivate)
router.patch('/:id/status', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { isActive } = zod_1.z.object({ isActive: zod_1.z.boolean() }).parse(req.body);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('profiles')
            .update({ is_active: isActive })
            .eq('id', req.params.id)
            .select()
            .single();
        if (error || !data)
            throw new error_middleware_1.AppError('User not found', 404);
        return res.json((0, pagination_1.successResponse)(data, `User ${isActive ? 'activated' : 'deactivated'}`));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /users/:id (admin only)
router.delete('/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        if (req.params.id === req.user.id) {
            throw new error_middleware_1.AppError('Cannot delete your own account', 400);
        }
        const { error } = await supabase_1.supabaseAdmin.auth.admin.deleteUser(req.params.id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete user', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.routes.js.map