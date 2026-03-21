import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, getSupabaseClient } from '../config/supabase';
import { HTTP_STATUS } from '../config/constants';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
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
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Invalid or expired token',
      });
    }

    // Fetch profile to get role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, first_name, last_name, is_active')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'User profile not found',
      });
    }

    if (!profile.is_active) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Account is deactivated',
      });
    }

    req.user = {
      id: user.id,
      email: user.email!,
      role: profile.role,
      profile,
    };
    req.accessToken = token;

    return next();
  } catch (err) {
    return res.status(HTTP_STATUS.INTERNAL).json({ error: 'Authentication failed' });
  }
};

// Role-based access control middleware factory
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
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
