import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-me';

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

    // Vérifier le JWT
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Token invalide' });
    }

    // Lire le rôle depuis la table `profiles`
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, first_name, last_name, email')
      .eq('id', decoded.id)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Profil utilisateur introuvable' });
    }

    req.user = {
      id: decoded.id,
      email: profile.email,
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