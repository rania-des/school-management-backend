import { Router, Request, Response, NextFunction } from 'express';
import { aiController } from './ai.controller';
import { aiService } from './ai.service';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { strictRateLimit } from '../../middleware/rateLimit.middleware';
import { supabaseAdmin } from '../../config/supabase';
import { AppError } from '../../middleware/error.middleware';

const router = Router();
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
router.post('/predict', strictRateLimit, (req, res, next) => aiController.predict(req, res, next));

/**
 * POST /api/v1/ai/chat
 * Body: { userMessage: string, language: 'fr'|'en', history?: {role,content}[] }
 */
router.post('/chat', strictRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userMessage, language = 'fr', history = [] } = req.body;
    if (!userMessage) throw new AppError('userMessage requis', 400);

    // Import callOllama via le service existant
    const { aiService: aiServiceModule } = await import('./ai.service');

    const historyText = history.slice(-8)
      .map((m: any) => `${m.role === 'user' ? 'Élève' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = language === 'fr'
      ? `Tu es un assistant scolaire intelligent pour un élève tunisien. Réponds en français de manière claire, pédagogique et encourageante. Sois concis mais utile.`
      : `You are an intelligent school assistant for a Tunisian student. Respond in English clearly, pedagogically and encouragingly.`;

    const prompt = `${systemPrompt}\n\nHistorique:\n${historyText}\n\nÉlève: ${userMessage}\nAssistant:`;

    // Appel direct Ollama
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
    const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b';

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.7, num_predict: 800 } }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) throw new AppError(`Ollama HTTP ${response.status}`, 502);
    const data = await response.json() as { response?: string };

    return res.json({ success: true, data: { prediction: data.response || '' } });
  } catch (err: any) {
    return next(err);
  }
});

/**
 * GET /api/v1/ai/teacher/students/predictions
 * 
 * Query params:
 *   classId         (required)  — UUID de la classe
 *   academicYearId  (optional)  — UUID de l'année académique
 *   language        (optional)  — "fr" | "en" | "ar" (default: "fr")
 *
 * Appelle aiService.predict() (Ollama) pour chaque élève en parallèle.
 * Retourne la liste triée : high → medium → low → unknown
 */
router.get(
  '/teacher/students/predictions',
  authorize('teacher', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { classId, academicYearId, language = 'fr' } = req.query as Record<string, string>;
      
      if (!classId) throw new AppError('classId is required', 400);

      // ── 1. Récupérer tous les élèves de la classe ─────────────────────
      const { data: students, error } = await supabaseAdmin
        .from('students')
        .select('id, student_number, profiles:profile_id(first_name, last_name, avatar_url)')
        .eq('class_id', classId);

      if (error) throw new AppError('Failed to fetch students', 500);
      if (!students || students.length === 0) {
        return res.json({ success: true, data: [] });
      }

      // ── 2. Appel aiService.predict() (inclut Ollama) pour chaque élève en parallèle
      const settled = await Promise.allSettled(
        students.map(async (s: any) => {
          const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;

          const result = await aiService.predict({
            studentId: s.id,
            language: (language as 'fr' | 'en' | 'ar') || 'fr',
          });

          return {
            studentId:       s.id,
            studentNumber:   s.student_number,
            firstName:       profile?.first_name  ?? '',
            lastName:        profile?.last_name   ?? '',
            avatarUrl:       profile?.avatar_url  ?? null,
            averageGrade:    result.averageGrade,
            attendanceRate:  result.attendanceRate,
            riskLevel:       result.riskLevel,
            prediction:      result.prediction,
            recommendations: result.recommendations,
          };
        })
      );

      // ── 3. Séparer succès / échecs ───────────────────────────────────
      const results = settled.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;

        const s = students[i] as any;
        const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
        return {
          studentId:       s.id,
          studentNumber:   s.student_number,
          firstName:       profile?.first_name ?? '',
          lastName:        profile?.last_name  ?? '',
          avatarUrl:       profile?.avatar_url ?? null,
          averageGrade:    null,
          attendanceRate:  null,
          riskLevel:       'unknown' as const,
          prediction:      'Prédiction indisponible (Ollama hors ligne ou données manquantes).',
          recommendations: [],
          error:           (r.reason as Error)?.message ?? 'Unknown error',
        };
      });

      // ── 4. Trier : high → medium → low → unknown ─────────────────────
      const order: Record<string, number> = { high: 0, medium: 1, low: 2, unknown: 3 };
      results.sort((a, b) => (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3));

      return res.json({ success: true, data: results });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;