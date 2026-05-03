import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// ── Routes publiques ──────────────────────────────────────────────────────────
router.post('/login',           authController.login.bind(authController));
router.post('/register',        authController.register.bind(authController));
router.post('/refresh',         authController.refresh.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password',  authController.resetPasswordWithToken.bind(authController));
router.post('/2fa/verify-login', authController.verify2FALogin.bind(authController));

// ── Routes protégées (JWT requis) ─────────────────────────────────────────────
router.use(authenticate);
router.post('/logout',    authController.logout.bind(authController));
router.get('/me',         authController.getMe.bind(authController));
router.patch('/password', authController.updatePassword.bind(authController));

// Routes protégées (après authenticate)
router.post('/2fa/generate', authController.generate2FASecret.bind(authController));
router.post('/2fa/activate', authController.activate2FA.bind(authController));
router.post('/2fa/disable', authController.disable2FA.bind(authController));

export default router;