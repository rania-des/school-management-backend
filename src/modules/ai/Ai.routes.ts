import { Router } from 'express';
import { aiController } from './ai.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// All AI routes require a valid JWT
router.use(authenticate);

/**
 * POST /api/v1/ai/predict
 *
 * Body (JSON):
 *   studentId?  — UUID, required for teacher/admin/parent, auto-resolved for students
 *   quizScore?  — number 0–5  (from the front-end quiz result)
 *   oralScore?  — number 0–10 (from /api/v1/student/evaluate-answer)
 *   language?   — "fr" | "en" | "ar"  (default: "fr")
 *
 * Response 200:
 *   { success: true, data: { prediction, recommendations, riskLevel, averageGrade, attendanceRate } }
 *
 * Errors:
 *   400 — missing/invalid body
 *   401 — not authenticated
 *   403 — parent accessing non-child data
 *   404 — student profile not found
 *   502 — Ollama HTTP error
 *   504 — Ollama timeout
 */
router.post('/predict', (req, res, next) => aiController.predict(req, res, next));

export default router;