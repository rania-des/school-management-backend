"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = exports.isTeacherOrParent = exports.isParent = exports.isStudent = exports.isTeacher = exports.isAdmin = exports.authorize = exports.authenticate = void 0;
const supabase_1 = require("../config/supabase");
const constants_1 = require("../config/constants");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Missing or invalid authorization header',
            });
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase_1.supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'Invalid or expired token',
            });
        }
        // Fetch profile to get role
        const { data: profile } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('role, first_name, last_name, is_active')
            .eq('id', user.id)
            .single();
        if (!profile) {
            return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({
                error: 'User profile not found',
            });
        }
        if (!profile.is_active) {
            return res.status(constants_1.HTTP_STATUS.FORBIDDEN).json({
                error: 'Account is deactivated',
            });
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: profile.role,
            profile,
        };
        req.accessToken = token;
        return next();
    }
    catch (err) {
        return res.status(constants_1.HTTP_STATUS.INTERNAL).json({ error: 'Authentication failed' });
    }
};
exports.authenticate = authenticate;
// Role-based access control middleware factory
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(constants_1.HTTP_STATUS.UNAUTHORIZED).json({ error: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(constants_1.HTTP_STATUS.FORBIDDEN).json({
                error: `Access denied. Required roles: ${roles.join(', ')}`,
            });
        }
        return next();
    };
};
exports.authorize = authorize;
// Allow multiple roles (shorthand)
exports.isAdmin = (0, exports.authorize)('admin');
exports.isTeacher = (0, exports.authorize)('teacher', 'admin');
exports.isStudent = (0, exports.authorize)('student', 'admin');
exports.isParent = (0, exports.authorize)('parent', 'admin');
exports.isTeacherOrParent = (0, exports.authorize)('teacher', 'parent', 'admin');
exports.isAuthenticated = exports.authenticate;
//# sourceMappingURL=auth.middleware.js.map