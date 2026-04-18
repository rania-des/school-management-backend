"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.authorize)('student', 'admin'));
// GET /students/my-profile
router.get('/my-profile', async (req, res, next) => {
    try {
        const { data: student, error } = await supabase_1.supabaseAdmin
            .from('students')
            .select(`
        *,
        classes(name),
        users:profile_id(first_name, last_name, email, avatar_url, phone)
      `)
            .eq('profile_id', req.user.id)
            .single();
        if (error || !student) {
            throw new error_middleware_1.AppError('Student not found', 404);
        }
        res.json((0, pagination_1.successResponse)(student));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=student.routes.js.map