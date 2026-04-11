"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = exports.isTeacherOrParent = exports.isParent = exports.isStudent = exports.isTeacher = exports.isAdmin = exports.authorize = exports.authenticate = void 0;
const supabase_1 = require("../config/supabase");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid authorization header',
            });
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase_1.supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({
                error: 'Invalid or expired token',
            });
        }
        // Fetch profile to get role (table users, pas profiles)
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('role, first_name, last_name')
            .eq('id', user.id)
            .single();
        if (profileError || !profile) {
            return res.status(401).json({
                error: 'User profile not found',
            });
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: profile.role,
            firstName: profile.first_name,
            lastName: profile.last_name,
            profile,
        };
        req.accessToken = token;
        return next();
    }
    catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};
exports.authenticate = authenticate;
// Role-based access control middleware factory
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
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