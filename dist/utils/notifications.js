"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentParentProfileIds = exports.getClassStudentProfileIds = exports.createBulkNotifications = exports.createNotification = void 0;
const supabase_1 = require("../config/supabase");
const createNotification = async (params) => {
    const { error } = await supabase_1.supabaseAdmin.from('notifications').insert({
        recipient_id: params.recipientId,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data || {},
    });
    if (error) {
        console.error('Failed to create notification:', error);
    }
};
exports.createNotification = createNotification;
const createBulkNotifications = async (recipientIds, params) => {
    const notifications = recipientIds.map((id) => ({
        recipient_id: id,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data || {},
    }));
    const { error } = await supabase_1.supabaseAdmin.from('notifications').insert(notifications);
    if (error) {
        console.error('Failed to create bulk notifications:', error);
    }
};
exports.createBulkNotifications = createBulkNotifications;
// Get profile IDs for all students in a class
const getClassStudentProfileIds = async (classId) => {
    const { data } = await supabase_1.supabaseAdmin
        .from('students')
        .select('profile_id')
        .eq('class_id', classId);
    return (data || []).map((s) => s.profile_id).filter(Boolean);
};
exports.getClassStudentProfileIds = getClassStudentProfileIds;
// Get parent profile IDs for a student
const getStudentParentProfileIds = async (studentId) => {
    const { data } = await supabase_1.supabaseAdmin
        .from('parent_student')
        .select('parents(profile_id)')
        .eq('student_id', studentId);
    return (data || [])
        .map((ps) => ps.parents?.profile_id)
        .filter(Boolean);
};
exports.getStudentParentProfileIds = getStudentParentProfileIds;
//# sourceMappingURL=notifications.js.map