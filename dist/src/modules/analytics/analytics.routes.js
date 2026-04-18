"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// GET /analytics/dashboard/student - student's personal dashboard
router.get('/dashboard/student', async (req, res, next) => {
    try {
        let studentId = req.query.studentId;
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', req.user.id).single();
            studentId = student?.id;
        }
        if (!studentId)
            throw new error_middleware_1.AppError('studentId required', 400);
        // Get current academic year
        const { data: year } = await supabase_1.supabaseAdmin
            .from('academic_years').select('id').eq('is_current', true).single();
        const academicYearId = year?.id;
        // Grades per subject
        const { data: grades } = await supabase_1.supabaseAdmin
            .from('grades')
            .select('score, coefficient, subjects(name, coefficient, color), period')
            .eq('student_id', studentId)
            .eq('academic_year_id', academicYearId);
        // Attendance stats
        const { data: attendance } = await supabase_1.supabaseAdmin
            .from('attendance')
            .select('status')
            .eq('student_id', studentId);
        const attendanceStats = (attendance || []).reduce((acc, a) => {
            acc[a.status] = (acc[a.status] || 0) + 1;
            return acc;
        }, {});
        // Upcoming assignments
        const { data: assignments } = await supabase_1.supabaseAdmin
            .from('assignments')
            .select('title, due_date, type, subjects(name, color)')
            .eq('class_id', req.query.classId || '')
            .gte('due_date', new Date().toISOString())
            .order('due_date')
            .limit(5);
        // Per-subject averages
        const subjectAverages = {};
        (grades || []).forEach((g) => {
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
            (grades || []).forEach((g) => {
                const w = g.coefficient * (g.subjects?.coefficient || 1);
                totalWeighted += g.score * w;
                totalWeight += w;
            });
            generalAverage = totalWeight > 0 ? (totalWeighted / totalWeight).toFixed(2) : null;
        }
        return res.json((0, pagination_1.successResponse)({
            generalAverage,
            subjectAverages: Object.values(subjectAverages),
            attendanceStats,
            upcomingAssignments: assignments || [],
            totalGrades: (grades || []).length,
        }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /analytics/dashboard/teacher - teacher's class dashboard
router.get('/dashboard/teacher', (0, auth_middleware_1.authorize)('teacher', 'admin'), async (req, res, next) => {
    try {
        let teacherId;
        if (req.user.role === 'teacher') {
            const { data } = await supabase_1.supabaseAdmin
                .from('teachers').select('id').eq('profile_id', req.user.id).single();
            if (!data)
                throw new error_middleware_1.AppError('Teacher not found', 404);
            teacherId = data.id;
        }
        else {
            teacherId = req.query.teacherId;
            if (!teacherId)
                throw new error_middleware_1.AppError('teacherId required', 400);
        }
        const { classId, period, academicYearId } = req.query;
        // Get teacher's classes
        const { data: assignments } = await supabase_1.supabaseAdmin
            .from('teacher_assignments')
            .select('class_id, subject_id, classes(name), subjects(name)')
            .eq('teacher_id', teacherId)
            .eq('academic_year_id', academicYearId || '');
        // Class stats
        let classStats = null;
        if (classId && period && academicYearId) {
            const { data: classGrades } = await supabase_1.supabaseAdmin
                .from('grades')
                .select('student_id, score, subjects(name)')
                .eq('class_id', classId)
                .eq('period', period)
                .eq('academic_year_id', academicYearId);
            const scores = (classGrades || []).map((g) => g.score);
            const average = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : null;
            const min = scores.length > 0 ? Math.min(...scores) : null;
            const max = scores.length > 0 ? Math.max(...scores) : null;
            // Students below 10 (in difficulty)
            const { data: students } = await supabase_1.supabaseAdmin
                .from('students')
                .select('id, student_number, profiles(first_name, last_name)')
                .eq('class_id', classId);
            const studentAverages = await Promise.all((students || []).map(async (s) => {
                const { data } = await supabase_1.supabaseAdmin.rpc('get_student_average', {
                    p_student_id: s.id,
                    p_period: period,
                    p_academic_year_id: academicYearId,
                });
                return { ...s, average: data };
            }));
            const inDifficulty = studentAverages.filter((s) => s.average && s.average < 10);
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
        const { data: recentAssignments } = await supabase_1.supabaseAdmin
            .from('assignments')
            .select('*, subjects(name), classes(name)')
            .eq('teacher_id', teacherId)
            .order('created_at', { ascending: false })
            .limit(5);
        // Pending submissions to grade
        const { count: pendingSubmissions } = await supabase_1.supabaseAdmin
            .from('submissions')
            .select('*', { count: 'exact', head: true })
            .in('assignment_id', (recentAssignments || []).map((a) => a.id))
            .eq('status', 'submitted');
        return res.json((0, pagination_1.successResponse)({
            classes: assignments,
            classStats,
            recentAssignments: recentAssignments || [],
            pendingSubmissions: pendingSubmissions || 0,
        }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /analytics/dashboard/admin
router.get('/dashboard/admin', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data: year } = await supabase_1.supabaseAdmin
            .from('academic_years').select('id').eq('is_current', true).single();
        const academicYearId = year?.id;
        // User counts by role
        const { data: profiles } = await supabase_1.supabaseAdmin
            .from('profiles').select('role, is_active');
        const userStats = (profiles || []).reduce((acc, p) => {
            acc[p.role] = (acc[p.role] || 0) + 1;
            acc[`${p.role}_active`] = (acc[`${p.role}_active`] || 0) + (p.is_active ? 1 : 0);
            return acc;
        }, {});
        // Financial stats
        const { data: payments } = await supabase_1.supabaseAdmin
            .from('payments').select('amount, status').eq('academic_year_id', academicYearId || '');
        const financialStats = (payments || []).reduce((acc, p) => {
            acc.total += parseFloat(p.amount);
            acc[p.status] = (acc[p.status] || 0) + parseFloat(p.amount);
            return acc;
        }, { total: 0, paid: 0, pending: 0, overdue: 0 });
        // Classes count
        const { count: classCount } = await supabase_1.supabaseAdmin
            .from('classes').select('*', { count: 'exact', head: true });
        // Attendance today
        const today = new Date().toISOString().split('T')[0];
        const { data: todayAttendance } = await supabase_1.supabaseAdmin
            .from('attendance').select('status').eq('date', today);
        const attendanceToday = (todayAttendance || []).reduce((acc, a) => {
            acc[a.status] = (acc[a.status] || 0) + 1;
            return acc;
        }, {});
        // Recent announcements
        const { data: recentAnnouncements } = await supabase_1.supabaseAdmin
            .from('announcements')
            .select('*, profiles(first_name, last_name)')
            .order('created_at', { ascending: false })
            .limit(5);
        return res.json((0, pagination_1.successResponse)({
            userStats,
            financialStats,
            classCount: classCount || 0,
            attendanceToday,
            recentAnnouncements: recentAnnouncements || [],
        }));
    }
    catch (err) {
        return next(err);
    }
});
// GET /analytics/progression/:studentId - progression over time
router.get('/progression/:studentId', async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const { academicYearId } = req.query;
        // Verify access
        if (req.user.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students').select('id').eq('profile_id', req.user.id).single();
            if (student?.id !== studentId)
                throw new error_middleware_1.AppError('Forbidden', 403);
        }
        const { data: grades } = await supabase_1.supabaseAdmin
            .from('grades')
            .select('score, period, grade_date, subjects(name, color), coefficient')
            .eq('student_id', studentId)
            .eq('academic_year_id', academicYearId || '')
            .order('grade_date');
        // Group by period
        const periodMap = {};
        (grades || []).forEach((g) => {
            if (!periodMap[g.period])
                periodMap[g.period] = { scores: [], weighted: 0, weight: 0 };
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
        return res.json((0, pagination_1.successResponse)({ progression, grades }));
    }
    catch (err) {
        return next(err);
    }
});
function getGradeDistribution(scores) {
    const distribution = { '0-5': 0, '5-10': 0, '10-15': 0, '15-20': 0 };
    scores.forEach((s) => {
        if (s < 5)
            distribution['0-5']++;
        else if (s < 10)
            distribution['5-10']++;
        else if (s < 15)
            distribution['10-15']++;
        else
            distribution['15-20']++;
    });
    return distribution;
}
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map