import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    statusCode: number;
    isOperational: boolean;
    constructor(message: string, statusCode: number);
}
export declare const errorHandler: (err: Error, _req: Request, res: Response, _next: NextFunction) => Response<any, Record<string, any>>;
export declare const notFound: (_req: Request, res: Response) => void;
//# sourceMappingURL=error.middleware.d.ts.map