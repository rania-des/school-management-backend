"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentParentProfileIds = exports.getClassStudentProfileIds = exports.createBulkNotifications = exports.createNotification = void 0;
const supabase_1 = require("../config/supabase");
const createNotification = async (params) => {
    try {
        const { error } = await supabase_1.supabaseAdmin.from('notifications').insert({
            user_id: params.recipientId,
            type: params.type,
            title: params.title,
            body: params.body || '',
            data: params.data || {},
            is_read: false,
            created_at: new Date().toISOString(),
        });
        if (error) {
            console.error('Failed to create notification:', error);
            return null;
        }
        return { success: true };
    }
    catch (error) {
        console.error('Notification error:', error);
        return null;
    }
};
exports.createNotification = createNotification;
const createBulkNotifications = async (recipientIds, params) => {
    if (!recipientIds.length)
        return { success: true, count: 0 };
    try {
        const notifications = recipientIds.map((id) => ({
            user_id: id,
            type: params.type,
            title: params.title,
            body: params.body || '',
            data: params.data || {},
            is_read: false,
            created_at: new Date().toISOString(),
        }));
        const { error } = await supabase_1.supabaseAdmin.from('notifications').insert(notifications);
        if (error) {
            console.error('Failed to create bulk notifications:', error);
            return { success: false, error, count: 0 };
        }
        return { success: true, count: recipientIds.length };
    }
    catch (error) {
        console.error('Bulk notification error:', error);
        return { success: false, error, count: 0 };
    }
};
exports.createBulkNotifications = createBulkNotifications;
const getClassStudentProfileIds = async (classId) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('students')
            .select('profile_id')
            .eq('class_id', classId);
        return (data || []).map((s) => s.profile_id).filter(Boolean);
    }
    catch (error) {
        console.error('Error getting class student profile IDs:', error);
        return [];
    }
};
exports.getClassStudentProfileIds = getClassStudentProfileIds;
const getStudentParentProfileIds = async (studentId) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('parent_student')
            .select('parents(profile_id)')
            .eq('student_id', studentId);
        return (data || []).map((ps) => ps.parents?.profile_id).filter(Boolean);
    }
    catch (error) {
        console.error('Error getting student parent profile IDs:', error);
        return [];
    }
};
exports.getStudentParentProfileIds = getStudentParentProfileIds;
//# sourceMappingURL=notification.service.js.map