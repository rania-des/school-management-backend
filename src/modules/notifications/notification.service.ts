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
      user_id:    params.recipientId,
      type:       params.type,
      title:      params.title,
      body:       params.body || '',
      data:       params.data || {},
      is_read:    false,
      created_at: new Date().toISOString(),
    });
    if (error) { console.error('Failed to create notification:', error); return null; }
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
      user_id:    id,
      type:       params.type,
      title:      params.title,
      body:       params.body || '',
      data:       params.data || {},
      is_read:    false,
      created_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from('notifications').insert(notifications);
    if (error) { console.error('Failed to create bulk notifications:', error); return { success: false, error, count: 0 }; }
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

export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  try {
    const { data } = await supabaseAdmin
      .from('parent_student')
      .select('parents(profile_id)')
      .eq('student_id', studentId);
    return (data || []).map((ps: any) => ps.parents?.profile_id).filter(Boolean);
  } catch (error) {
    console.error('Error getting student parent profile IDs:', error);
    return [];
  }
};