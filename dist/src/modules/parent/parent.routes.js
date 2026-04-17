"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const supabase_1 = require("../../config/supabase");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.authorize)('parent', 'admin'));
// GET /parents/children
router.get('/children', async (req, res, next) => {
    try {
        const { data: parent } = await supabase_1.supabaseAdmin
            .from('parents')
            .select('id')
            .eq('profile_id', req.user.id)
            .single();
        if (!parent) {
            throw new error_middleware_1.AppError('Parent not found', 404);
        }
        const { data: children, error } = await supabase_1.supabaseAdmin
            .from('parent_student')
            .select(`
        student_id,
        relationship,
        is_primary,
        students(
          id,
          student_number,
          class_id,
          classes(name),
          users:profile_id(first_name, last_name, email, avatar_url)
        )
      `)
            .eq('parent_id', parent.id);
        if (error) {
            throw new error_middleware_1.AppError('Failed to fetch children', 500);
        }
        res.json((0, pagination_1.successResponse)(children || []));
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=parent.routes.js.map