import { supabaseAdmin } from '../config/supabase';

export type NotificationType =
  | 'grade'
  | 'assignment'
  | 'absence'
  | 'message'
  | 'announcement'
  | 'payment'
  | 'meeting'
  | 'general';

export interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export const createNotification = async (params: CreateNotificationParams) => {
  try {
    const { error } = await supabaseAdmin.from('notifications').insert({
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
  } catch (error) {
    console.error('Notification error:', error);
    return null;
  }
};

export const createBulkNotifications = async (
  recipientIds: string[],
  params: Omit<CreateNotificationParams, 'recipientId'>
) => {
  if (!recipientIds.length) return { success: true, count: 0 };
  
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
    
    const { error } = await supabaseAdmin.from('notifications').insert(notifications);
    
    if (error) {
      console.error('Failed to create bulk notifications:', error);
      return { success: false, error, count: 0 };
    }
    
    return { success: true, count: recipientIds.length };
  } catch (error) {
    console.error('Bulk notification error:', error);
    return { success: false, error, count: 0 };
  }
};

export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  try {
    const { data } = await supabaseAdmin
      .from('students')
      .select('profile_id')
      .eq('class_id', classId);
    
    return (data || []).map((s: any) => s.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting class student profile IDs:', error);
    return [];
  }
};

// Récupère tous les profile_ids d'une classe (élèves uniquement, version améliorée)
export const getClassAllProfileIds = async (classId: string): Promise<string[]> => {
  try {
    // Récupérer les élèves
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('profile_id')
      .eq('class_id', classId);
    
    const studentIds = (students || []).map((s: any) => s.profile_id).filter(Boolean);
    
    // Récupérer les enseignants de cette classe via schedule_slots
    const { data: slots } = await supabaseAdmin
      .from('schedule_slots')
      .select('teacher_id')
      .eq('class_id', classId)
      .eq('is_active', true);
    
    const teacherIds: string[] = [];
    for (const slot of (slots || [])) {
      if (slot.teacher_id) {
        const { data: teacher } = await supabaseAdmin
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
  } catch (error) {
    console.error('Error getting class all profile IDs:', error);
    return [];
  }
};

export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  try {
    const { data } = await supabaseAdmin
      .from('parent_student')
      .select('parents(profile_id)')
      .eq('student_id', studentId);
    
    return (data || [])
      .map((ps: any) => ps.parents?.profile_id)
      .filter(Boolean);
  } catch (error) {
    console.error('Error getting student parent profile IDs:', error);
    return [];
  }
};

// Marquer une notification comme lue
export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Mark read error:', error);
    return false;
  }
};

// Marquer toutes les notifications d'un utilisateur comme lues
export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    
    if (error) {
      console.error('Failed to mark all notifications as read:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Mark all read error:', error);
    return false;
  }
};