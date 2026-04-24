import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';

const router = Router();
router.use(authenticate);

// GET /analytics/dashboard/student - student's personal dashboard
router.get('/dashboard/student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.query.studentId as string;

    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      studentId = student?.id;
    }

    if (!studentId) throw new AppError('studentId required', 400);

    // Get current academic year
    const { data: year } = await supabaseAdmin
      .from('academic_years').select('id').eq('is_current', true).single();

    const academicYearId = year?.id;

    // Grades per subject
    const { data: grades } = await supabaseAdmin
      .from('grades')
      .select('score, coefficient, subjects(name, coefficient, color), period')
      .eq('student_id', studentId)
      .eq('academic_year_id', academicYearId);

    // Attendance stats
    const { data: attendance } = await supabaseAdmin
      .from('attendance')
      .select('status')
      .eq('student_id', studentId);

    const attendanceStats = (attendance || []).reduce((acc: Record<string, number>, a: any) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    // Upcoming assignments
    const { data: assignments } = await supabaseAdmin
      .from('assignments')
      .select('title, due_date, type, subjects(name, color)')
      .eq('class_id', req.query.classId || '')
      .gte('due_date', new Date().toISOString())
      .order('due_date')
      .limit(5);

    // Per-subject averages
    const subjectAverages: Record<string, { name: string; color: string; average: number; grades: number[] }> = {};
    (grades || []).forEach((g: any) => {
      const subjectName = g.subjects?.name;
      if (!subjectAverages[subjectName]) {
        subjectAverages[subjectName] = {
          name: subjectName,
          color: g.subjects?.color,
          average: 0,
          grades: [],
        };
      }
      subjectAverages[subjectName].grades.push(g.score);
    });

    Object.values(subjectAverages).forEach((s) => {
      s.average = s.grades.reduce((a, b) => a + b, 0) / s.grades.length;
    });

    // General average
    let generalAverage = null;
    if (grades && grades.length > 0) {
      let totalWeighted = 0;
      let totalWeight = 0;
      (grades || []).forEach((g: any) => {
        const w = g.coefficient * (g.subjects?.coefficient || 1);
        totalWeighted += g.score * w;
        totalWeight += w;
      });
      generalAverage = totalWeight > 0 ? (totalWeighted / totalWeight).toFixed(2) : null;
    }

    return res.json(successResponse({
      generalAverage,
      subjectAverages: Object.values(subjectAverages),
      attendanceStats,
      upcomingAssignments: assignments || [],
      totalGrades: (grades || []).length,
    }));
  } catch (err) {
    return next(err);
  }
});

// GET /analytics/dashboard/teacher - teacher's class dashboard
router.get('/dashboard/teacher', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let teacherId: string;
    if (req.user!.role === 'teacher') {
      const { data } = await supabaseAdmin
        .from('teachers').select('id').eq('profile_id', req.user!.id).single();
      if (!data) throw new AppError('Teacher not found', 404);
      teacherId = data.id;
    } else {
      teacherId = req.query.teacherId as string;
      if (!teacherId) throw new AppError('teacherId required', 400);
    }

    const { classId, period, academicYearId } = req.query;

    // Get teacher's classes
    const { data: assignments } = await supabaseAdmin
      .from('teacher_assignments')
      .select('class_id, subject_id, classes(name), subjects(name)')
      .eq('teacher_id', teacherId)
      .eq('academic_year_id', academicYearId || '');

    // Class stats
    let classStats = null;
    if (classId && period && academicYearId) {
      const { data: classGrades } = await supabaseAdmin
        .from('grades')
        .select('student_id, score, subjects(name)')
        .eq('class_id', classId)
        .eq('period', period)
        .eq('academic_year_id', academicYearId);

      const scores = (classGrades || []).map((g: any) => g.score);
      const average = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2) : null;
      const min = scores.length > 0 ? Math.min(...scores) : null;
      const max = scores.length > 0 ? Math.max(...scores) : null;

      // Students below 10 (in difficulty)
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('id, student_number, profiles(first_name, last_name)')
        .eq('class_id', classId);

      const studentAverages = await Promise.all(
        (students || []).map(async (s: any) => {
          const { data } = await supabaseAdmin.rpc('get_student_average', {
            p_student_id: s.id,
            p_period: period,
            p_academic_year_id: academicYearId,
          });
          return { ...s, average: data };
        })
      );

      // MODIFICATION: Enrichir inDifficulty avec attendanceRate + riskLevel heuristique
      const inDifficultyRaw = await Promise.all(
        studentAverages
          .filter((s) => s.average !== null)
          .map(async (s) => {
            const { data: att } = await supabaseAdmin
              .from('attendance')
              .select('status')
              .eq('student_id', s.id);

            const total   = (att || []).length;
            const present = (att || []).filter((a: any) => a.status === 'present').length;
            const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null;

            // Même heuristique que aiService (sans Ollama — rapide)
            let riskScore = 0;
            if (s.average < 8)        riskScore += 3;
            else if (s.average < 10)  riskScore += 2;
            else if (s.average < 12)  riskScore += 1;
            if (attendanceRate !== null) {
              if (attendanceRate < 70)       riskScore += 3;
              else if (attendanceRate < 85)  riskScore += 1;
            }
            const riskLevel: 'high' | 'medium' | 'low' =
              riskScore >= 5 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

            return { ...s, attendanceRate, riskLevel };
          })
      );

      const inDifficulty = inDifficultyRaw.filter(
        (s) => s.average < 10 || s.riskLevel === 'high'
      );

      classStats = {
        average,
        min,
        max,
        totalStudents: (students || []).length,
        totalGrades: (classGrades || []).length,
        inDifficulty,
        distribution: getGradeDistribution(scores),
      };
    }

    // Recent assignments
    const { data: recentAssignments } = await supabaseAdmin
      .from('assignments')
      .select('*, subjects(name), classes(name)')
      .eq('teacher_id', teacherId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Pending submissions to grade
    const { count: pendingSubmissions } = await supabaseAdmin
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .in('assignment_id', (recentAssignments || []).map((a: any) => a.id))
      .eq('status', 'submitted');

    return res.json(successResponse({
      classes: assignments,
      classStats,
      recentAssignments: recentAssignments || [],
      pendingSubmissions: pendingSubmissions || 0,
    }));
  } catch (err) {
    return next(err);
  }
});

// GET /analytics/dashboard/admin
router.get('/dashboard/admin', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: year } = await supabaseAdmin
      .from('academic_years').select('id').eq('is_current', true).single();
    const academicYearId = year?.id;

    // User counts by role
    const { data: profiles } = await supabaseAdmin
      .from('profiles').select('role, is_active');

    const userStats = (profiles || []).reduce((acc: Record<string, number>, p: any) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      acc[`${p.role}_active`] = (acc[`${p.role}_active`] || 0) + (p.is_active ? 1 : 0);
      return acc;
    }, {});

    // Financial stats
    const { data: payments } = await supabaseAdmin
      .from('payments').select('amount, status').eq('academic_year_id', academicYearId || '');

    const financialStats = (payments || []).reduce(
      (acc: { total: number; paid: number; pending: number; overdue: number }, p: any) => {
        acc.total += parseFloat(p.amount);
        acc[p.status as keyof typeof acc] = (acc[p.status as keyof typeof acc] || 0) + parseFloat(p.amount);
        return acc;
      },
      { total: 0, paid: 0, pending: 0, overdue: 0 }
    );

    // Classes count
    const { count: classCount } = await supabaseAdmin
      .from('classes').select('*', { count: 'exact', head: true });

    // Attendance today
    const today = new Date().toISOString().split('T')[0];
    const { data: todayAttendance } = await supabaseAdmin
      .from('attendance').select('status').eq('date', today);

    const attendanceToday = (todayAttendance || []).reduce((acc: Record<string, number>, a: any) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    // Recent announcements
    const { data: recentAnnouncements } = await supabaseAdmin
      .from('announcements')
      .select('*, profiles(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(5);

    return res.json(successResponse({
      userStats,
      financialStats,
      classCount: classCount || 0,
      attendanceToday,
      recentAnnouncements: recentAnnouncements || [],
    }));
  } catch (err) {
    return next(err);
  }
});

// GET /analytics/progression/:studentId - progression over time
router.get('/progression/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    // Verify access
    if (req.user!.role === 'student') {
      const { data: student } = await supabaseAdmin
        .from('students').select('id').eq('profile_id', req.user!.id).single();
      if (student?.id !== studentId) throw new AppError('Forbidden', 403);
    }

    const { data: grades } = await supabaseAdmin
      .from('grades')
      .select('score, period, grade_date, subjects(name, color), coefficient')
      .eq('student_id', studentId)
      .eq('academic_year_id', academicYearId || '')
      .order('grade_date');

    // Group by period
    const periodMap: Record<string, { scores: number[]; weighted: number; weight: number }> = {};
    (grades || []).forEach((g: any) => {
      if (!periodMap[g.period]) periodMap[g.period] = { scores: [], weighted: 0, weight: 0 };
      periodMap[g.period].scores.push(g.score);
      periodMap[g.period].weighted += g.score * g.coefficient;
      periodMap[g.period].weight += g.coefficient;
    });

    const progression = Object.entries(periodMap).map(([period, data]) => ({
      period,
      average: (data.weighted / data.weight).toFixed(2),
      gradeCount: data.scores.length,
      min: Math.min(...data.scores),
      max: Math.max(...data.scores),
    }));

    return res.json(successResponse({ progression, grades }));
  } catch (err) {
    return next(err);
  }
});

function getGradeDistribution(scores: number[]) {
  const distribution = { '0-5': 0, '5-10': 0, '10-15': 0, '15-20': 0 };
  scores.forEach((s) => {
    if (s < 5) distribution['0-5']++;
    else if (s < 10) distribution['5-10']++;
    else if (s < 15) distribution['10-15']++;
    else distribution['15-20']++;
  });
  return distribution;
}

export default router;