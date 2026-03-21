import { supabaseAdmin } from '../config/supabase';

type NotificationType =
  | 'grade'
  | 'assignment'
  | 'absence'
  | 'message'
  | 'announcement'
  | 'payment'
  | 'meeting'
  | 'general';

interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export const createNotification = async (params: CreateNotificationParams) => {
  const { error } = await supabaseAdmin.from('notifications').insert({
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

export const createBulkNotifications = async (
  recipientIds: string[],
  params: Omit<CreateNotificationParams, 'recipientId'>
) => {
  const notifications = recipientIds.map((id) => ({
    recipient_id: id,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
  }));

  const { error } = await supabaseAdmin.from('notifications').insert(notifications);
  if (error) {
    console.error('Failed to create bulk notifications:', error);
  }
};

// Get profile IDs for all students in a class
export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  const { data } = await supabaseAdmin
    .from('students')
    .select('profile_id')
    .eq('class_id', classId);

  return (data || []).map((s) => s.profile_id).filter(Boolean);
};

// Get parent profile IDs for a student
export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  const { data } = await supabaseAdmin
    .from('parent_student')
    .select('parents(profile_id)')
    .eq('student_id', studentId);

  return (data || [])
    .map((ps: any) => ps.parents?.profile_id)
    .filter(Boolean);
};
