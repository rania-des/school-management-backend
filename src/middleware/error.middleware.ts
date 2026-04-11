import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Supabase / PostgreSQL errors
  if ((err as any).code) {
    const code = (err as any).code;
    if (code === '23505') {
      return res.status(409).json({ error: 'Resource already exists' });
    }
    if (code === '23503') {
      return res.status(400).json({ error: 'Referenced resource not found' });
    }
    if (code === 'PGRST116') {
      return res.status(404).json({ error: 'Resource not found' });
    }
  }

  // Unhandled errors
  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
};