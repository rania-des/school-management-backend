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
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: 'Invalid or expired token',
      });
    }

    // Fetch profile to get role (table users, pas profiles)
    const { data: profile, error: profileError } = await supabaseAdmin
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
      email: user.email!,
      role: profile.role,
      firstName: profile.first_name,
      lastName: profile.last_name,
      profile,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

// Role-based access control middleware factory
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
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

// Allow multiple roles (shorthand)
export const isAdmin = authorize('admin');
export const isTeacher = authorize('teacher', 'admin');
export const isStudent = authorize('student', 'admin');
export const isParent = authorize('parent', 'admin');
export const isTeacherOrParent = authorize('teacher', 'parent', 'admin');
export const isAuthenticated = authenticate;