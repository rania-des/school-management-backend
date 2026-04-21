"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const error_middleware_1 = require("../../middleware/error.middleware");
const pagination_1 = require("../../utils/pagination");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const SUPABASE_URL = 'https://wlgclriinxtyctaadiql.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Nscmlpbnh0eWN0YWFkaXFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjAzNzA2NywiZXhwIjoyMDg3NjEzMDY3fQ.Nkny8TqAH40_E8KoVQbBgtVg7L3fWnmP0eB208iLmp4';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    const data = await res.json();
    if (!res.ok)
        console.error(`❌ sbGet ${path.split('?')[0]} → ${res.status}:`, JSON.stringify(data).slice(0, 200));
    return { data, ok: res.ok };
}
async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'PATCH',
        headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data: Array.isArray(data) ? data[0] : data, ok: res.ok };
}
const updateProfileSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(1).max(100).optional(),
    lastName: zod_1.z.string().min(1).max(100).optional(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    gender: zod_1.z.enum(['male', 'female']).optional(),
    dateOfBirth: zod_1.z.string().optional(),
    specialization: zod_1.z.string().optional(),
});
// Helper pour récupérer les données spécifiques au rôle
async function getRoleData(profileId, role) {
    if (role === 'student') {
        const { data } = await sbGet(`students?profile_id=eq.${profileId}&select=*,classes:class_id(id,name)`);
        const student = Array.isArray(data) ? data[0] : null;
        if (student) {
            const classes = Array.isArray(student.classes) ? student.classes[0] : student.classes;
            return {
                id: student.id,
                student_number: student.student_number,
                class_id: student.class_id,
                enrollment_date: student.enrollment_date,
                classes: classes ? { id: classes.id, name: classes.name } : null
            };
        }
        return null;
    }
    if (role === 'teacher') {
        const { data } = await sbGet(`teachers?profile_id=eq.${profileId}&select=*`);
        const teacher = Array.isArray(data) ? data[0] : null;
        return teacher ? {
            id: teacher.id,
            specialization: teacher.specialization,
            employee_number: teacher.employee_number,
            hire_date: teacher.hire_date
        } : null;
    }
    if (role === 'parent') {
        const { data } = await sbGet(`parents?profile_id=eq.${profileId}&select=*`);
        const parent = Array.isArray(data) ? data[0] : null;
        return parent ? {
            id: parent.id,
            profession: parent.profession
        } : null;
    }
    return null;
}
// Helper pour récupérer les parents liés à un étudiant
async function getStudentParents(studentProfileId) {
    const { data: studentData } = await sbGet(`students?profile_id=eq.${studentProfileId}&select=id`);
    const student = Array.isArray(studentData) ? studentData[0] : null;
    if (!student)
        return [];
    const { data: links } = await sbGet(`parent_student?student_id=eq.${student.id}&select=*,parents:parent_id(*)`);
    if (!links || !Array.isArray(links))
        return [];
    const parents = await Promise.all(links.map(async (link) => {
        const parent = link.parents;
        if (!parent)
            return null;
        const { data: profileData } = await sbGet(`profiles?id=eq.${parent.profile_id}&select=first_name,last_name,email`);
        const profile = Array.isArray(profileData) ? profileData[0] : null;
        return {
            id: link.id,
            parent_id: parent.id,
            student_id: link.student_id,
            is_primary: link.is_primary,
            relationship: link.relationship,
            parents: {
                id: parent.id,
                profile_id: parent.profile_id,
                profession: parent.profession,
                profiles: profile
            }
        };
    }));
    return parents.filter(p => p !== null);
}
// Helper pour récupérer les enfants liés à un parent
async function getParentChildren(parentProfileId) {
    const { data: parentData } = await sbGet(`parents?profile_id=eq.${parentProfileId}&select=id`);
    const parent = Array.isArray(parentData) ? parentData[0] : null;
    if (!parent)
        return [];
    const { data: links } = await sbGet(`parent_student?parent_id=eq.${parent.id}&select=*,students:student_id(*)`);
    if (!links || !Array.isArray(links))
        return [];
    const children = await Promise.all(links.map(async (link) => {
        const student = link.students;
        if (!student)
            return null;
        const { data: profileData } = await sbGet(`profiles?id=eq.${student.profile_id}&select=first_name,last_name,email`);
        const profile = Array.isArray(profileData) ? profileData[0] : null;
        let className = null;
        if (student.class_id) {
            const { data: classData } = await sbGet(`classes?id=eq.${student.class_id}&select=name`);
            const classItem = Array.isArray(classData) ? classData[0] : null;
            className = classItem?.name;
        }
        return {
            id: link.id,
            parent_id: link.parent_id,
            student_id: student.id,
            is_primary: link.is_primary,
            relationship: link.relationship,
            students: {
                id: student.id,
                profile_id: student.profile_id,
                student_number: student.student_number,
                class_id: student.class_id,
                classes: className ? { name: className } : null,
                profiles: profile
            }
        };
    }));
    return children.filter(c => c !== null);
}
// GET /users/me/profile
router.get('/me/profile', async (req, res, next) => {
    try {
        const { data } = await sbGet(`profiles?id=eq.${req.user.id}&select=*`);
        const user = Array.isArray(data) ? data[0] : null;
        if (!user)
            throw new error_middleware_1.AppError('Profile not found', 404);
        const roleData = await getRoleData(req.user.id, user.role);
        let relations = [];
        if (user.role === 'student') {
            relations = await getStudentParents(req.user.id);
        }
        else if (user.role === 'parent') {
            relations = await getParentChildren(req.user.id);
        }
        return res.json((0, pagination_1.successResponse)({ ...user, roleData, relations }));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/me/profile
router.patch('/me/profile', async (req, res, next) => {
    try {
        const body = updateProfileSchema.parse(req.body);
        const upd = {};
        if (body.firstName)
            upd.first_name = body.firstName;
        if (body.lastName)
            upd.last_name = body.lastName;
        if (body.phone !== undefined)
            upd.phone = body.phone;
        if (body.address !== undefined)
            upd.address = body.address;
        if (body.gender)
            upd.gender = body.gender;
        if (body.dateOfBirth)
            upd.date_of_birth = body.dateOfBirth;
        const { data, ok } = await sbPatch(`profiles?id=eq.${req.user.id}`, upd);
        if (!ok)
            throw new error_middleware_1.AppError('Failed to update profile', 500);
        const roleData = await getRoleData(req.user.id, data.role);
        return res.json((0, pagination_1.successResponse)({ ...data, roleData }, 'Profile updated successfully'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/:id/profile (admin)
router.patch('/:id/profile', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const body = updateProfileSchema.parse(req.body);
        const upd = {};
        if (body.firstName)
            upd.first_name = body.firstName;
        if (body.lastName)
            upd.last_name = body.lastName;
        if (body.phone !== undefined)
            upd.phone = body.phone;
        if (body.address !== undefined)
            upd.address = body.address;
        if (body.gender)
            upd.gender = body.gender;
        if (body.dateOfBirth)
            upd.date_of_birth = body.dateOfBirth;
        const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, upd);
        if (!ok || !data)
            throw new error_middleware_1.AppError('User not found', 404);
        const roleData = await getRoleData(req.params.id, data.role);
        return res.json((0, pagination_1.successResponse)({ ...data, roleData }, 'Profile updated'));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/:id/role
router.patch('/:id/role', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { role } = zod_1.z.object({
            role: zod_1.z.enum(['student', 'teacher', 'parent', 'admin'])
        }).parse(req.body);
        const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { role });
        if (!ok || !data)
            throw new error_middleware_1.AppError('User not found', 404);
        const roleData = await getRoleData(req.params.id, role);
        return res.json((0, pagination_1.successResponse)({ ...data, roleData }, 'Role updated'));
    }
    catch (err) {
        return next(err);
    }
});
// ✅ CORRIGÉ: GET /users avec pagination inline (sans getPagination)
router.get('/', (0, auth_middleware_1.authorize)('admin', 'teacher'), async (req, res, next) => {
    try {
        // Fix: s'assurer que req.query existe toujours
        const query = req.query || {};
        const page = Math.max(1, parseInt(query.page) || 1);
        const limit = Math.min(100, parseInt(query.limit) || 20);
        const offset = (page - 1) * limit;
        const role = query.role;
        const search = query.search;
        // Cas teacher : requête directe sur la table teachers (optimisé)
        if (role === 'teacher') {
            let teachersUrl = `teachers?select=id,profile_id,specialization,employee_number,hire_date,profiles(id,first_name,last_name,email,avatar_url,role,is_active)&order=profile_id.desc&offset=${offset}&limit=${limit}`;
            if (search) {
                teachersUrl += `&or=(profiles.first_name.ilike.*${search}*,profiles.last_name.ilike.*${search}*,profiles.email.ilike.*${search}*)`;
            }
            const { data: teachers } = await sbGet(teachersUrl);
            const arr = Array.isArray(teachers) ? teachers : [];
            // Compter le total
            let countUrl = `teachers?select=id&profile_id=not.is.null`;
            if (search) {
                countUrl += `&or=(profiles.first_name.ilike.*${search}*,profiles.last_name.ilike.*${search}*,profiles.email.ilike.*${search}*)`;
            }
            const { data: countData } = await sbGet(countUrl);
            const total = Array.isArray(countData) ? countData.length : arr.length;
            // Formater les données pour correspondre à l'interface attendue
            const formatted = arr.map((t) => ({
                id: t.profile_id,
                first_name: t.profiles?.first_name || '',
                last_name: t.profiles?.last_name || '',
                email: t.profiles?.email || '',
                avatar_url: t.profiles?.avatar_url || null,
                role: 'teacher',
                is_active: t.profiles?.is_active ?? true,
                roleData: {
                    id: t.id,
                    specialization: t.specialization,
                    employee_number: t.employee_number,
                    hire_date: t.hire_date,
                },
                relations: [],
            }));
            return res.json({
                data: formatted,
                meta: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNext: page * limit < total,
                    hasPrev: page > 1
                }
            });
        }
        // Autres rôles (students, parents, admin)
        let url = `profiles?select=*&order=created_at.desc&offset=${offset}&limit=${limit}`;
        if (role) {
            url += `&role=eq.${role}`;
        }
        else if (req.user.role === 'teacher') {
            url += `&role=eq.student`;
        }
        if (search) {
            url += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
        }
        const { data } = await sbGet(url);
        const arr = Array.isArray(data) ? data : [];
        // Compter le total
        let countUrl = `profiles?select=id`;
        if (role) {
            countUrl += `&role=eq.${role}`;
        }
        else if (req.user.role === 'teacher') {
            countUrl += `&role=eq.student`;
        }
        if (search) {
            countUrl += `&or=(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`;
        }
        const { data: countData } = await sbGet(countUrl);
        const total = Array.isArray(countData) ? countData.length : arr.length;
        // Enrichissement léger pour les non-teachers
        const enriched = await Promise.all(arr.map(async (user) => {
            const roleData = await getRoleData(user.id, user.role);
            return { ...user, roleData, relations: [] };
        }));
        return res.json({
            data: enriched,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    }
    catch (err) {
        return next(err);
    }
});
// ✅ CORRIGÉ: GET /users/:id avec les données de classe et relations
router.get('/:id', (0, auth_middleware_1.authorize)('admin', 'teacher'), async (req, res, next) => {
    try {
        const { data } = await sbGet(`profiles?id=eq.${req.params.id}&select=*`);
        const user = Array.isArray(data) ? data[0] : null;
        if (!user)
            throw new error_middleware_1.AppError('User not found', 404);
        if (req.user.role === 'teacher' && user.role !== 'student')
            throw new error_middleware_1.AppError('Forbidden', 403);
        const roleData = await getRoleData(req.params.id, user.role);
        let relations = [];
        if (user.role === 'student') {
            relations = await getStudentParents(req.params.id);
        }
        else if (user.role === 'parent') {
            relations = await getParentChildren(req.params.id);
        }
        console.log(`📘 ${user.role} ${user.first_name} ${user.last_name} - Classe:`, roleData?.classes?.name);
        return res.json((0, pagination_1.successResponse)({ ...user, roleData, relations }));
    }
    catch (err) {
        return next(err);
    }
});
// PATCH /users/:id/status
router.patch('/:id/status', (0, auth_middleware_1.authorize)('admin'), async (req, res, next) => {
    try {
        const { isActive } = zod_1.z.object({ isActive: zod_1.z.boolean() }).parse(req.body);
        const { data, ok } = await sbPatch(`profiles?id=eq.${req.params.id}`, { is_active: isActive });
        if (!ok || !data)
            throw new error_middleware_1.AppError('User not found', 404);
        const roleData = await getRoleData(req.params.id, data.role);
        return res.json((0, pagination_1.successResponse)({ ...data, roleData }, `User ${isActive ? 'activated' : 'deactivated'}`));
    }
    catch (err) {
        return next(err);
    }
});
exports.default = router;
//# sourceMappingURL=users.routes.js.map