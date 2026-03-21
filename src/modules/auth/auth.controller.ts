import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from './auth.schema';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = loginSchema.parse(req.body);
      const result = await authService.login(body.email, body.password);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = registerSchema.parse(req.body);
      const result = await authService.register(body);
      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }
      const result = await authService.refreshToken(refreshToken);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.user!.id);
      return res.status(200).json({ message: 'Logged out successfully' });
    } catch (err) {
      return next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = resetPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(email);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }

  async updatePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { password } = updatePasswordSchema.parse(req.body);
      const result = await authService.updatePassword(req.user!.id, password);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.getMe(req.user!.id);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
}

export const authController = new AuthController();
