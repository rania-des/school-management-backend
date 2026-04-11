import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { authService } from './auth.service';

const router = Router();

// ── Routes publiques ──────────────────────────────────────────────────────────
router.post('/login',           authController.login.bind(authController));
router.post('/register',        authController.register.bind(authController));
router.post('/refresh',         authController.refresh.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/reset-password',  authController.resetPasswordWithToken.bind(authController));

// ── Route TEMPORAIRE pour fixer les mots de passe (sans authentification) ────
// À SUPPRIMER APRÈS EXÉCUTION
router.post('/fix-passwords', async (req, res, next) => {
  try {
    const defaultPassword = req.body.password || 'Amer1234';
    const result = await authService.fixMissingPasswords(defaultPassword);
    res.json({
      message: 'Fix des mots de passe terminé',
      success: result.success,
      updated: result.updated,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

// ── Routes protégées (JWT requis) ─────────────────────────────────────────────
router.use(authenticate);
router.post('/logout',    authController.logout.bind(authController));
router.get('/me',         authController.getMe.bind(authController));
router.patch('/password', authController.updatePassword.bind(authController));

export default router;