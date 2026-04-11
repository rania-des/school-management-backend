import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', authController.login.bind(authController));
router.post('/register', authController.register.bind(authController));
router.post('/refresh', authController.refresh.bind(authController));
router.post('/forgot-password', authController.forgotPassword.bind(authController));

// Protected routes
router.use(authenticate);
router.post('/logout', authController.logout.bind(authController));
router.get('/me', authController.getMe.bind(authController));
router.patch('/password', authController.updatePassword.bind(authController));

export default router;