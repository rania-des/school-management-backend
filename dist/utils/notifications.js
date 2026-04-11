"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getStudentParentProfileIds = exports.getClassAllProfileIds = exports.getClassStudentProfileIds = exports.createBulkNotifications = exports.createNotification = void 0;
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
// Récupère tous les profile_ids d'une classe (élèves uniquement, version améliorée)
const getClassAllProfileIds = async (classId) => {
    try {
        // Récupérer les élèves
        const { data: students } = await supabase_1.supabaseAdmin
            .from('students')
            .select('profile_id')
            .eq('class_id', classId);
        const studentIds = (students || []).map((s) => s.profile_id).filter(Boolean);
        // Récupérer les enseignants de cette classe via schedule_slots
        const { data: slots } = await supabase_1.supabaseAdmin
            .from('schedule_slots')
            .select('teacher_id')
            .eq('class_id', classId)
            .eq('is_active', true);
        const teacherIds = [];
        for (const slot of (slots || [])) {
            if (slot.teacher_id) {
                const { data: teacher } = await supabase_1.supabaseAdmin
                    .from('teachers')
                    .select('profile_id')
                    .eq('id', slot.teacher_id)
                    .single();
                if (teacher?.profile_id) {
                    teacherIds.push(teacher.profile_id);
                }
            }
        }
        return [...new Set([...studentIds, ...teacherIds])];
    }
    catch (error) {
        console.error('Error getting class all profile IDs:', error);
        return [];
    }
};
exports.getClassAllProfileIds = getClassAllProfileIds;
const getStudentParentProfileIds = async (studentId) => {
    try {
        const { data } = await supabase_1.supabaseAdmin
            .from('parent_student')
            .select('parents(profile_id)')
            .eq('student_id', studentId);
        return (data || [])
            .map((ps) => ps.parents?.profile_id)
            .filter(Boolean);
    }
    catch (error) {
        console.error('Error getting student parent profile IDs:', error);
        return [];
    }
};
exports.getStudentParentProfileIds = getStudentParentProfileIds;
// Marquer une notification comme lue
const markNotificationAsRead = async (notificationId, userId) => {
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('user_id', userId);
        if (error) {
            console.error('Failed to mark notification as read:', error);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Mark read error:', error);
        return false;
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
// Marquer toutes les notifications d'un utilisateur comme lues
const markAllNotificationsAsRead = async (userId) => {
    try {
        const { error } = await supabase_1.supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        if (error) {
            console.error('Failed to mark all notifications as read:', error);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Mark all read error:', error);
        return false;
    }
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
//# sourceMappingURL=notifications.js.map