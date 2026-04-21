"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../../config/supabase");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// =============================================================================
// UTILS
// =============================================================================
async function hashPassword(password) {
    const salt = await bcryptjs_1.default.genSalt(10);
    return bcryptjs_1.default.hash(password, salt);
}
// =============================================================================
// USERS MANAGEMENT
// =============================================================================
// GET /admin/users - list all users with pagination and filters
router.get('/users', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { role, search, page, limit } = req.query;
        const { from, to } = (0, pagination_1.getPagination)(Number(page), Number(limit));
        let query = supabase_1.supabaseAdmin
            .from('profiles')
            .select('*', { count: 'exact' });
        if (role && role !== 'all') {
            query = query.eq('role', role);
        }
        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
        }
        const { data, error, count } = await query.range(from, to).order('created_at', { ascending: false });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch users', 500);
        return res.json((0, pagination_1.successResponse)((0, pagination_1.paginate)(data || [], Number(page), Number(limit), count || 0)));
    }
    catch (err) {
        return next(err);
    }
});
// GET /admin/users/:id - get user details
router.get('/users/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
        if (profileError || !profile)
            throw new error_middleware_1.AppError('User not found', 404);
        let extraData = null;
        if (profile.role === 'student') {
            const { data: student } = await supabase_1.supabaseAdmin
                .from('students')
                .select('*, class:classes(*)')
                .eq('profile_id', id)
                .single();
            extraData = student;
        }
        else if (profile.role === 'teacher') {
            const { data: teacher } = await supabase_1.supabaseAdmin
                .from('teachers')
                .select('*')
                .eq('profile_id', id)
                .single();
            extraData = teacher;
        }
        else if (profile.role === 'parent') {
            const { data: children } = await supabase_1.supabaseAdmin
                .from('parent_student')
                .select('student:students(*, class:classes(*))')
                .eq('parent_id', id);
            extraData = { children: children || [] };
        }
        return res.json((0, pagination_1.successResponse)({ ...profile, ...extraData }));
    }
    catch (err) {
        return next(err);
    }
});
// POST /admin/users - create a new user
router.post('/users', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { email, password, firstName, lastName, role, phone, address, gender } = req.body;
        if (!email || !password || !firstName || !lastName || !role) {
            throw new error_middleware_1.AppError('Missing required fields', 400);
        }
        const hashedPassword = await hashPassword(password);
        // Create auth user via Supabase Admin API
        const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { first_name: firstName, last_name: lastName, role },
        });
        if (authError)
            throw new error_middleware_1.AppError(authError.message, 400);
        // Create profile
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('profiles')
            .insert({
            id: authUser.user.id,
            email,
            first_name: firstName,
            last_name: lastName,
            role,
            phone,
            address,
            gender,
        })
            .select()
            .single();
        if (profileError)
            throw new error_middleware_1.AppError('Failed to create profile', 500);
        // Create role-specific record
        if (role === 'student') {
            const { error: studentError } = await supabase_1.supabaseAdmin
                .from('students')
                .insert({ profile_id: authUser.user.id });
            if (studentError)
                throw new error_middleware_1.AppError('Failed to create student record', 500);
        }
        else if (role === 'teacher') {
            const { error: teacherError } = await supabase_1.supabaseAdmin
                .from('teachers')
                .insert({ profile_id: authUser.user.id });
            if (teacherError)
                throw new error_middleware_1.AppError('Failed to create teacher record', 500);
        }
        else if (role === 'parent') {
            // Parent record will be created when linking to students
        }
        return res.status(201).json((0, pagination_1.successResponse)(profile, 'User created successfully'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /admin/users/:id - update user
router.patch('/users/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, phone, address, gender, role, classId, studentNumber } = req.body;
        const updates = {};
        if (firstName !== undefined)
            updates.first_name = firstName;
        if (lastName !== undefined)
            updates.last_name = lastName;
        if (phone !== undefined)
            updates.phone = phone;
        if (address !== undefined)
            updates.address = address;
        if (gender !== undefined)
            updates.gender = gender;
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('profiles')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (profileError)
            throw new error_middleware_1.AppError('Failed to update user', 500);
        // Update role-specific data
        if (role === 'student' && classId) {
            await supabase_1.supabaseAdmin
                .from('students')
                .update({ class_id: classId, student_number: studentNumber })
                .eq('profile_id', id);
        }
        else if (role === 'teacher') {
            // Teacher updates if needed
        }
        return res.json((0, pagination_1.successResponse)(profile, 'User updated'));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/users/:id - delete user
router.delete('/users/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        // Delete auth user via Supabase Admin API
        const { error: authError } = await supabase_1.supabaseAdmin.auth.admin.deleteUser(id);
        if (authError)
            throw new error_middleware_1.AppError('Failed to delete user', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /admin/users/:id/reset-password - reset user password
router.patch('/users/:id/reset-password', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!password)
            throw new error_middleware_1.AppError('Password is required', 400);
        const hashedPassword = await hashPassword(password);
        const { error } = await supabase_1.supabaseAdmin.auth.admin.updateUserById(id, { password: hashedPassword });
        if (error)
            throw new error_middleware_1.AppError('Failed to reset password', 500);
        return res.json((0, pagination_1.successResponse)(null, 'Password reset successfully'));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// CLASSES MANAGEMENT
// =============================================================================
// GET /admin/classes
router.get('/classes', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes')
            .select(`
        *,
        level:levels(*),
        academic_year:academic_years(*),
        students:students(count)
      `)
            .order('name');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch classes', 500);
        const formatted = (data || []).map((c) => ({
            ...c,
            students_count: c.students?.[0]?.count || 0,
            students: undefined,
        }));
        return res.json((0, pagination_1.successResponse)(formatted));
    }
    catch (err) {
        return next(err);
    }
});
// POST /admin/classes
router.post('/classes', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { name, level_id, academic_year_id, capacity } = req.body;
        if (!name)
            throw new error_middleware_1.AppError('Name is required', 400);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes')
            .insert({ name, level_id, academic_year_id, capacity })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create class', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /admin/classes/:id
router.patch('/classes/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, level_id, academic_year_id, capacity } = req.body;
        const updates = {};
        if (name !== undefined)
            updates.name = name;
        if (level_id !== undefined)
            updates.level_id = level_id;
        if (academic_year_id !== undefined)
            updates.academic_year_id = academic_year_id;
        if (capacity !== undefined)
            updates.capacity = capacity;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to update class', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/classes/:id
router.delete('/classes/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin.from('classes').delete().eq('id', id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete class', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// GET /admin/classes/:id
router.get('/classes/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { data: classData, error: classError } = await supabase_1.supabaseAdmin
            .from('classes')
            .select('*, level:levels(*), academic_year:academic_years(*)')
            .eq('id', id)
            .single();
        if (classError)
            throw new error_middleware_1.AppError('Class not found', 404);
        const { data: students } = await supabase_1.supabaseAdmin
            .from('students')
            .select(`
        id,
        student_number,
        profile_id,
        profiles:profile_id(first_name, last_name, email)
      `)
            .eq('class_id', id);
        const { data: schedule } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select('*, subjects:subject_id(*), teachers:teacher_id(*)')
            .eq('class_id', id)
            .order('day_of_week', { ascending: true })
            .order('start_time', { ascending: true });
        return res.json((0, pagination_1.successResponse)({
            ...classData,
            students: students || [],
            schedule: schedule || [],
        }));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// SUBJECTS MANAGEMENT
// =============================================================================
// GET /admin/subjects
router.get('/subjects', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('subjects')
            .select('*')
            .order('name');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch subjects', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /admin/subjects
router.post('/subjects', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { name, code, coefficient, color } = req.body;
        if (!name)
            throw new error_middleware_1.AppError('Name is required', 400);
        const { data, error } = await supabase_1.supabaseAdmin
            .from('subjects')
            .insert({ name, code, coefficient, color })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create subject', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /admin/subjects/:id
router.patch('/subjects/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, coefficient, color } = req.body;
        const updates = {};
        if (name !== undefined)
            updates.name = name;
        if (code !== undefined)
            updates.code = code;
        if (coefficient !== undefined)
            updates.coefficient = coefficient;
        if (color !== undefined)
            updates.color = color;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('subjects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to update subject', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/subjects/:id
router.delete('/subjects/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin.from('subjects').delete().eq('id', id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete subject', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// LEVELS
// =============================================================================
// GET /admin/levels
router.get('/levels', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('levels')
            .select('*')
            .order('order', { ascending: true });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch levels', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// ACADEMIC YEARS
// =============================================================================
// GET /admin/academic-years
router.get('/academic-years', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('academic_years')
            .select('*')
            .order('start_date', { ascending: false });
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch academic years', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /admin/academic-years
router.post('/academic-years', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { name, start_date, end_date, is_current } = req.body;
        if (!name || !start_date || !end_date) {
            throw new error_middleware_1.AppError('Name, start_date and end_date are required', 400);
        }
        // If is_current is true, set all others to false
        if (is_current) {
            await supabase_1.supabaseAdmin.from('academic_years').update({ is_current: false }).neq('id', '');
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('academic_years')
            .insert({ name, start_date, end_date, is_current: is_current || false })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create academic year', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /admin/academic-years/:id
router.patch('/academic-years/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, start_date, end_date, is_current } = req.body;
        const updates = {};
        if (name !== undefined)
            updates.name = name;
        if (start_date !== undefined)
            updates.start_date = start_date;
        if (end_date !== undefined)
            updates.end_date = end_date;
        if (is_current !== undefined)
            updates.is_current = is_current;
        // If setting is_current to true, set all others to false
        if (is_current === true) {
            await supabase_1.supabaseAdmin.from('academic_years').update({ is_current: false }).neq('id', id);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('academic_years')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to update academic year', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/academic-years/:id
router.delete('/academic-years/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin.from('academic_years').delete().eq('id', id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete academic year', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// GET /admin/academic-years/:id
router.get('/academic-years/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('academic_years')
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw new error_middleware_1.AppError('Academic year not found', 404);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// TEACHER ASSIGNMENTS
// =============================================================================
// GET /admin/teacher-assignments
router.get('/teacher-assignments', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select(`
        *,
        teacher:teachers(profile_id, profiles:profile_id(first_name, last_name)),
        subject:subjects(name),
        class:classes(name)
      `)
            .order('day_of_week')
            .order('start_time');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch teacher assignments', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// POST /admin/teacher-assignments
router.post('/teacher-assignments', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { teacher_id, class_id, subject_id, day_of_week, start_time, end_time, room } = req.body;
        if (!teacher_id || !class_id || !subject_id || !day_of_week || !start_time || !end_time) {
            throw new error_middleware_1.AppError('Missing required fields', 400);
        }
        const { data, error } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .insert({
            teacher_id,
            class_id,
            subject_id,
            day_of_week,
            start_time,
            end_time,
            room,
            is_active: true,
        })
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to create teacher assignment', 500);
        return res.status(201).json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/teacher-assignments/:id
router.delete('/teacher-assignments/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin.from('schedule_slots').delete().eq('id', id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete teacher assignment', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// STUDENT ENROLLMENT
// =============================================================================
// PATCH /admin/students/:id/enroll
router.patch('/students/:id/enroll', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { class_id, student_number } = req.body;
        const updates = {};
        if (class_id !== undefined)
            updates.class_id = class_id;
        if (student_number !== undefined)
            updates.student_number = student_number;
        const { data, error } = await supabase_1.supabaseAdmin
            .from('students')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw new error_middleware_1.AppError('Failed to enroll student', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// PARENT-STUDENT LINKS
// =============================================================================
// GET /admin/parent-student
router.get('/parent-student', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('parent_student')
            .select(`
        *,
        parent:parents(profile_id, profiles:profile_id(first_name, last_name)),
        student:students(id, student_number, profiles:profile_id(first_name, last_name), class:classes(name))
      `);
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch parent-student links', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// DELETE /admin/parent-student/:id
router.delete('/parent-student/:id', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabaseAdmin.from('parent_student').delete().eq('id', id);
        if (error)
            throw new error_middleware_1.AppError('Failed to delete parent-student link', 500);
        return res.status(204).send();
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// SECTIONS (for compatibility)
// =============================================================================
// GET /admin/sections - alias for classes
router.get('/sections', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('classes')
            .select('*')
            .order('name');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch sections', 500);
        return res.json((0, pagination_1.successResponse)(data));
    }
    catch (err) {
        return next(err);
    }
});
// =============================================================================
// CANTINE - STUDENTS WITH CLASS (pour le select régimes)
// =============================================================================
// GET /admin/students-with-class — pour le select régimes cantine
router.get('/students-with-class', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('students')
            .select(`
        id,
        profile_id,
        class_id,
        class:classes(id, name)
      `)
            .order('class_id');
        if (error)
            throw new error_middleware_1.AppError('Failed to fetch students', 500);
        // Fetch profiles pour avoir les noms
        const profileIds = (data || []).map((s) => s.profile_id).filter(Boolean);
        const { data: profiles } = profileIds.length
            ? await supabase_1.supabaseAdmin.from('profiles').select('id, first_name, last_name').in('id', profileIds)
            : { data: [] };
        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        const result = (data || []).map((s) => ({
            id: s.id,
            first_name: profileMap.get(s.profile_id)?.first_name || '',
            last_name: profileMap.get(s.profile_id)?.last_name || '',
            class_name: s.class?.name || '',
        }));
        return res.json((0, pagination_1.successResponse)(result));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map