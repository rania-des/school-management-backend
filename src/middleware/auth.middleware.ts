import { Request, Response, NextFunction } from 'express';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
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

    const user = await userRes.json() as { id: string; email: string };
    if (!user?.id) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    // Fetch profile using user's own JWT (no service_role needed)
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role,first_name,last_name`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
      }
    );

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
      email: user.email!,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: "Erreur d'authentification" });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Accès refusé. Rôles requis : ${roles.join(', ')}` });
    }
    return next();
  };
};

export const isAdmin = authorize('admin');
export const isTeacher = authorize('teacher', 'admin');
export const isStudent = authorize('student', 'admin');
export const isParent = authorize('parent', 'admin');
export const isAuthenticated = authenticate;