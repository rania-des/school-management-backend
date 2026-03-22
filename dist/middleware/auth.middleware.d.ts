import { Request, Response, NextFunction } from 'express';
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
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const authorize: (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isAdmin: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isTeacher: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isStudent: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isParent: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isTeacherOrParent: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const isAuthenticated: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.middleware.d.ts.map