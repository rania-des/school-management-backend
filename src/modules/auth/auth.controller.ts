import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  resetPasswordWithTokenSchema,
} from './auth.schema';

export class AuthController {

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body   = loginSchema.parse(req.body);
      const result = await authService.login(body.email, body.password);
      return res.status(200).json(result);
    } catch (err) { return next(err); }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body   = registerSchema.parse(req.body);
      const result = await authService.register(body as any);
      return res.status(201).json(result);
    } catch (err) { return next(err); }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token requis' });
      const result = await authService.refreshToken(refreshToken);
      return res.json(result);
    } catch (err) { return next(err); }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await authService.logout(req.user!.id);
      return res.status(200).json({ message: 'Déconnexion réussie' });
    } catch (err) { return next(err); }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = resetPasswordSchema.parse(req.body);
      const result    = await authService.forgotPassword(email);
      return res.json(result);
    } catch (err) { return next(err); }
  }

  async resetPasswordWithToken(req: Request, res: Response, next: NextFunction) {
    try {
      const body   = resetPasswordWithTokenSchema.parse(req.body);
      const result = await authService.resetPasswordWithToken(body.token, body.password);
      return res.json(result);
    } catch (err) { return next(err); }
  }

  // ✅ POINT 2 — Transmettre currentPassword au service pour vérification
  async updatePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, password } = updatePasswordSchema.parse(req.body);
      const result = await authService.updatePassword(req.user!.id, currentPassword, password);
      return res.json(result);
    } catch (err) { return next(err); }
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      // Pass the access token so getMe can fetch profile with user's own JWT
      const result = await authService.getMe(req.user!.id, req.accessToken!);
      return res.json(result);
    } catch (err) { return next(err); }
  }
}

export const authController = new AuthController();