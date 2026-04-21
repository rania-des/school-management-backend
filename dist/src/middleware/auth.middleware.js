"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = exports.isParent = exports.isStudent = exports.isTeacher = exports.isAdmin = exports.authorize = exports.authenticate = void 0;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header manquant ou invalide' });
        }
        const token = authHeader.split(' ')[1];
        // Verify token with Supabase using user's own JWT (no service_role needed)
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!userRes.ok) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }
        const user = await userRes.json();
        if (!user?.id) {
            return res.status(401).json({ error: 'Token invalide ou expiré' });
        }
        // Fetch profile using user's own JWT (no service_role needed)
        const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,first_name,last_name`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${token}`,
            },
        });
        if (!profileRes.ok) {
            return res.status(401).json({ error: 'Profil utilisateur introuvable' });
        }
        const profiles = await profileRes.json();
        const profile = Array.isArray(profiles) ? profiles[0] : null;
        if (!profile) {
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