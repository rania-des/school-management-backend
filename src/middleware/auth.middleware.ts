import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  profile?: Record<string, unknown>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      accessToken?: string;
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authorization header manquant ou invalide',
      });
    }

    const token = authHeader.split(' ')[1];

    // Vérifier le JWT Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    // Lire le rôle depuis la table `profiles`
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Profil utilisateur introuvable' });
    }

    req.user = {
      id: user.id,
      email: user.email!,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
      profile,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: "Erreur d'authentification" });
  }
};

// ── RBAC helpers ──────────────────────────────────────────────────────────────

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Accès refusé. Rôles requis : ${roles.join(', ')}`,
      });
    }
    return next();
  };
};

export const isAdmin           = authorize('admin');
export const isTeacher         = authorize('teacher', 'admin');
export const isStudent         = authorize('student', 'admin');
export const isParent          = authorize('parent', 'admin');
export const isTeacherOrParent = authorize('teacher', 'parent', 'admin');
export const isAuthenticated   = authenticate;