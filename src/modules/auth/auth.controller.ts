import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updatePasswordSchema,
  resetPasswordWithTokenSchema,
  generate2FASchema,       
  activate2FASchema,       
  verify2FALoginSchema,    
  disable2FASchema,       
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
  
  async generate2FASecret(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.generate2FASecret(req.user!.id, req.user!.email);
      return res.json(result);
    } catch (err) { next(err); }
  }
  
  async activate2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = activate2FASchema.parse(req.body);
      const result = await authService.activate2FA(req.user!.id, token);
      return res.json(result);
    } catch (err) { next(err); }
  }
  
  async verify2FALogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { challengeId, token } = verify2FALoginSchema.parse(req.body);
      const result = await authService.complete2FALogin(challengeId, token);
      return res.json(result);
    } catch (err) { next(err); }
  }
  
  async disable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = disable2FASchema.parse(req.body);
      const result = await authService.disable2FA(req.user!.id, token);
      return res.json(result);
    } catch (err) { next(err); }
  }
}

export const authController = new AuthController();