import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

/**
 * ══════════════════════════════════════════════════════════════
 * Middleware d'authentification — OMNIA Platform
 * ══════════════════════════════════════════════════════════════
 *
 * Support :
 * - Tokens JWT standard de Supabase (Bearer)
 * - Tokens JWT personnalisés émis après validation 2FA (signés avec JWT_SECRET)
 * ══════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const JWT_SECRET = process.env.JWT_SECRET!;

// Client admin Supabase (service_role) pour accès direct aux profiles
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
    let userId: string | null = null;
    let userEmail: string | null = null;

    // ---- 1. Tentative de vérification avec JWT_SECRET (token custom 2FA) ----
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email?: string };
      userId = decoded.sub;
      userEmail = decoded.email ?? null;
    } catch (err) {
      // Ce n'est pas un token custom, on continuera avec la méthode Supabase
    }

    // ---- 2. Si pas de userId via JWT custom, on vérifie via Supabase ----
    if (!userId) {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!userRes.ok) {
        return res.status(401).json({ error: 'Token invalide ou expiré (Supabase)' });
      }

      const supabaseUser = await userRes.json() as { id: string; email: string };
      if (!supabaseUser?.id) {
        return res.status(401).json({ error: 'Token invalide : utilisateur introuvable' });
      }
      userId = supabaseUser.id;
      userEmail = supabaseUser.email;
    }

    // ---- 3. Récupération du profil depuis la base (via supabaseAdmin) ----
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, first_name, last_name, is_active')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('Profile fetch error:', error);
      return res.status(401).json({ error: 'Profil utilisateur introuvable' });
    }

    if (profile.is_active === false) {
      return res.status(403).json({ error: 'Compte désactivé. Veuillez contacter l\'administrateur.' });
    }

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Erreur interne d\'authentification' });
  }
};

// --- Authorisation par rôles ---
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Accès refusé. Rôle requis : ${roles.join(', ')}` });
    }
    return next();
  };
};

export const isAdmin = authorize('admin');
export const isTeacher = authorize('teacher', 'admin');
export const isStudent = authorize('student', 'admin');
export const isParent = authorize('parent', 'admin');
export const isAuthenticated = authenticate;