import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { aiService } from './ai.service';
import { AppError } from '../../middleware/error.middleware';
import { supabaseAdmin } from '../../config/supabase';

// ─── Validation schemas ───────────────────────────────────
const predictSchema = z.object({
  /** UUID of the student. Defaults to the logged-in student's own ID. */
  studentId:  z.string().uuid().optional(),
  quizScore:  z.number().min(0).max(5).optional(),
  oralScore:  z.number().min(0).max(10).optional(),
  language:   z.enum(['fr', 'en', 'ar']).default('fr'),
});

export class AiController {

  /**
   * POST /api/v1/ai/predict
   *
   * Accessible by: student (own data), teacher/admin (any studentId).
   * Parents can only access their children's data.
   */
  async predict(req: Request, res: Response, next: NextFunction) {
    try {
      const body = predictSchema.parse(req.body);
      const role = req.user!.role;

      let resolvedStudentId: string;

      if (role === 'student') {
        // Students always get their own prediction regardless of body.studentId
        const { data: student, error } = await supabaseAdmin
          .from('students')
          .select('id')
          .eq('profile_id', req.user!.id)
          .single();

        if (error || !student) throw new AppError('Student profile not found', 404);
        resolvedStudentId = student.id;

      } else if (role === 'parent') {
        // Parents may only query their own children
        if (!body.studentId) throw new AppError('studentId is required for parents', 400);

        const { data: parent } = await supabaseAdmin
          .from('parents')
          .select('id')
          .eq('profile_id', req.user!.id)
          .single();
        if (!parent) throw new AppError('Parent profile not found', 404);

        const { data: link } = await supabaseAdmin
          .from('parent_student')
          .select('student_id')
          .eq('parent_id', parent.id)
          .eq('student_id', body.studentId)
          .single();
        if (!link) throw new AppError('Access denied: not your child', 403);

        resolvedStudentId = body.studentId;

      } else {
        // teacher / admin — need explicit studentId
        if (!body.studentId) throw new AppError('studentId is required', 400);
        resolvedStudentId = body.studentId;
      }

      const result = await aiService.predict({
        studentId: resolvedStudentId,
        quizScore: body.quizScore,
        oralScore: body.oralScore,
        language:  body.language,
      });

      return res.status(200).json({
        success: true,
        data:    result,
      });

    } catch (err) {
      return next(err);
    }
  }
}

export const aiController = new AiController();