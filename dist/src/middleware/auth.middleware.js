"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = exports.isParent = exports.isStudent = exports.isTeacher = exports.isAdmin = exports.authorize = exports.authenticate = void 0;
const supabase_1 = require("../config/supabase");
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header manquant ou invalide' });
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase_1.supabaseAdmin.auth.getUser(token);
        if (error || !user) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('role, first_name, last_name')
            .eq('id', user.id)
            .single();
        if (profileError || !profile) {
            return res.status(401).json({ error: 'Profil utilisateur introuvable' });
        }
        req.user = {
            id: user.id,
            email: user.email,
            role: profile.role,
            firstName: profile.first_name,
            lastName: profile.last_name,
        };
        req.accessToken = token;
        return next();
    }
    catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(500).json({ error: "Erreur d'authentification" });
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Accès refusé. Rôles requis : ${roles.join(', ')}` });
        }
        return next();
    };
};
exports.authorize = authorize;
exports.isAdmin = (0, exports.authorize)('admin');
exports.isTeacher = (0, exports.authorize)('teacher', 'admin');
exports.isStudent = (0, exports.authorize)('student', 'admin');
exports.isParent = (0, exports.authorize)('parent', 'admin');
exports.isAuthenticated = exports.authenticate;
//# sourceMappingURL=auth.middleware.js.map