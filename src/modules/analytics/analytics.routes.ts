import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { AppError } from '../../middleware/error.middleware';
import { successResponse } from '../../utils/pagination';
import { sbGet, sbGetOne } from '../../utils/sbClient';

const router = Router();
router.use(authenticate);

function getGradeDistribution(scores: number[]) {
  const d = { '0-5': 0, '5-10': 0, '10-15': 0, '15-20': 0 };
  scores.forEach((s) => {
    if (s < 5) d['0-5']++;
    else if (s < 10) d['5-10']++;
    else if (s < 15) d['10-15']++;
    else d['15-20']++;
  });
  return d;
}

// GET /analytics/dashboard/student
router.get('/dashboard/student', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let studentId = req.query.studentId as string;
    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      studentId = student?.id;
    }
    if (!studentId) throw new AppError('studentId required', 400);

    const year = await sbGetOne('academic_years', 'is_current=eq.true&select=id');
    const academicYearId = year?.id;

    const [grades, attendance, assignments] = await Promise.all([
      sbGet('grades', `student_id=eq.${studentId}&academic_year_id=eq.${academicYearId}&select=score,coefficient,subjects(name,coefficient,color),period`).catch(() => []),
      sbGet('attendance', `student_id=eq.${studentId}&select=status`).catch(() => []),
      sbGet('assignments', `due_date=gte.${new Date().toISOString()}&select=title,due_date,type,subjects(name,color)&order=due_date&limit=5`).catch(() => []),
    ]);

    const attendanceStats = attendance.reduce((acc: Record<string, number>, a: any) => {
      acc[a.status] = (acc[a.status] || 0) + 1; return acc;
    }, {});

    const subjectAverages: Record<string, any> = {};
    grades.forEach((g: any) => {
      const subName = g.subjects?.name;
      if (!subjectAverages[subName]) subjectAverages[subName] = { name: subName, color: g.subjects?.color, average: 0, grades: [] };
      subjectAverages[subName].grades.push(g.score);
    });
    Object.values(subjectAverages).forEach((s: any) => {
      s.average = s.grades.reduce((a: number, b: number) => a + b, 0) / s.grades.length;
    });

    let generalAverage = null;
    if (grades.length > 0) {
      let totalWeighted = 0, totalWeight = 0;
      grades.forEach((g: any) => {
        const w = g.coefficient * (g.subjects?.coefficient || 1);
        totalWeighted += g.score * w; totalWeight += w;
      });
      generalAverage = totalWeight > 0 ? (totalWeighted / totalWeight).toFixed(2) : null;
    }

    return res.json(successResponse({
      generalAverage, subjectAverages: Object.values(subjectAverages),
      attendanceStats, upcomingAssignments: assignments, totalGrades: grades.length,
    }));
  } catch (err) { return next(err); }
});

// GET /analytics/dashboard/teacher
router.get('/dashboard/teacher', authorize('teacher', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    let teacherId: string;
    if (req.user!.role === 'teacher') {
      const t = await sbGetOne('teachers', `profile_id=eq.${req.user!.id}&select=id`);
      if (!t) throw new AppError('Teacher not found', 404);
      teacherId = t.id;
    } else {
      teacherId = req.query.teacherId as string;
      if (!teacherId) throw new AppError('teacherId required', 400);
    }
    const { classId, period, academicYearId } = req.query;

    const [assignments2, recentAssignments] = await Promise.all([
      academicYearId ? sbGet('teacher_assignments', `teacher_id=eq.${teacherId}&academic_year_id=eq.${academicYearId}&select=class_id,subject_id,classes(name),subjects(name)`).catch(() => []) : Promise.resolve([]),
      sbGet('assignments', `teacher_id=eq.${teacherId}&select=*,subjects(name),classes(name)&order=created_at.desc&limit=5`).catch(() => []),
    ]);

    let classStats = null;
    if (classId && period && academicYearId) {
      const classGrades = await sbGet('grades', `class_id=eq.${classId}&period=eq.${period}&academic_year_id=eq.${academicYearId}&select=student_id,score,subjects(name)`).catch(() => []);
      const scores = classGrades.map((g: any) => g.score);
      const average = scores.length > 0 ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2) : null;
      const students = await sbGet('students', `class_id=eq.${classId}&select=id,student_number,profiles:profile_id(first_name,last_name)`).catch(() => []);
      classStats = {
        average, min: scores.length > 0 ? Math.min(...scores) : null,
        max: scores.length > 0 ? Math.max(...scores) : null,
        totalStudents: students.length, totalGrades: classGrades.length,
        distribution: getGradeDistribution(scores),
      };
    }

    const pendingCount = recentAssignments.length > 0
      ? await sbGet('submissions', `assignment_id=in.(${recentAssignments.map((a: any) => a.id).join(',')})&status=eq.submitted&select=id`).then(d => d.length).catch(() => 0)
      : 0;

    return res.json(successResponse({
      classes: assignments2, classStats,
      recentAssignments, pendingSubmissions: pendingCount,
    }));
  } catch (err) { return next(err); }
});

// GET /analytics/dashboard/admin
router.get('/dashboard/admin', authorize('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = await sbGetOne('academic_years', 'is_current=eq.true&select=id');
    const academicYearId = year?.id;

    const [profiles, payments, classes2, todayAttendance, recentAnnouncements] = await Promise.all([
      sbGet('profiles', 'select=role,is_active').catch(() => []),
      academicYearId ? sbGet('payments', `academic_year_id=eq.${academicYearId}&select=amount,status`).catch(() => []) : Promise.resolve([]),
      sbGet('classes', 'select=id').catch(() => []),
      sbGet('attendance', `date=eq.${new Date().toISOString().split('T')[0]}&select=status`).catch(() => []),
      sbGet('announcements', 'select=*,profiles:author_id(first_name,last_name)&order=created_at.desc&limit=5').catch(() => []),
    ]);

    const userStats = profiles.reduce((acc: Record<string, number>, p: any) => {
      acc[p.role] = (acc[p.role] || 0) + 1;
      acc[`${p.role}_active`] = (acc[`${p.role}_active`] || 0) + (p.is_active ? 1 : 0);
      return acc;
    }, {});

    const financialStats = payments.reduce(
      (acc: any, p: any) => {
        acc.total += parseFloat(p.amount);
        acc[p.status] = (acc[p.status] || 0) + parseFloat(p.amount);
        return acc;
      }, { total: 0, paid: 0, pending: 0, overdue: 0 }
    );

    const attendanceToday = todayAttendance.reduce((acc: Record<string, number>, a: any) => {
      acc[a.status] = (acc[a.status] || 0) + 1; return acc;
    }, {});

    return res.json(successResponse({
      userStats, financialStats, classCount: classes2.length,
      attendanceToday, recentAnnouncements,
    }));
  } catch (err) { return next(err); }
});

// GET /analytics/progression/:studentId
router.get('/progression/:studentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;
    if (req.user!.role === 'student') {
      const student = await sbGetOne('students', `profile_id=eq.${req.user!.id}&select=id`);
      if (student?.id !== studentId) throw new AppError('Forbidden', 403);
    }
    const grades = await sbGet('grades', `student_id=eq.${studentId}&academic_year_id=eq.${academicYearId}&select=score,period,grade_date,subjects(name,color),coefficient&order=grade_date`).catch(() => []);

    const periodMap: Record<string, any> = {};
    grades.forEach((g: any) => {
      if (!periodMap[g.period]) periodMap[g.period] = { scores: [], weighted: 0, weight: 0 };
      periodMap[g.period].scores.push(g.score);
      periodMap[g.period].weighted += g.score * g.coefficient;
      periodMap[g.period].weight += g.coefficient;
    });

    const progression = Object.entries(periodMap).map(([period, data]: any) => ({
      period, average: (data.weighted / data.weight).toFixed(2),
      gradeCount: data.scores.length,
      min: Math.min(...data.scores), max: Math.max(...data.scores),
    }));

    return res.json(successResponse({ progression, grades }));
  } catch (err) { return next(err); }
});

export default router;