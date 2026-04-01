import { supabaseAdmin } from '../config/supabase';

type NotificationType =
  | 'grade' | 'assignment' | 'absence' | 'message'
  | 'announcement' | 'payment' | 'meeting' | 'general';

interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

export const createNotification = async (params: CreateNotificationParams) => {
  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: params.recipientId,  // ✅ user_id au lieu de recipient_id
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
    is_read: false,
  });
  if (error) console.error('Failed to create notification:', error);
};

export const createBulkNotifications = async (
  recipientIds: string[],
  params: Omit<CreateNotificationParams, 'recipientId'>
) => {
  if (!recipientIds.length) return;
  const notifications = recipientIds.map((id) => ({
    user_id: id,  // ✅ user_id au lieu de recipient_id
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data || {},
    is_read: false,
  }));
  const { error } = await supabaseAdmin.from('notifications').insert(notifications);
  if (error) console.error('Failed to create bulk notifications:', error);
};

export const getClassStudentProfileIds = async (classId: string): Promise<string[]> => {
  const { data } = await supabaseAdmin
    .from('students').select('profile_id').eq('class_id', classId);
  return (data || []).map((s) => s.profile_id).filter(Boolean);
};

// Récupère tous les profile_ids d'une classe (élèves + profs)
export const getClassAllProfileIds = async (classId: string): Promise<string[]> => {
  const [studentsRes, teachersRes] = await Promise.all([
    supabaseAdmin.from('students').select('profile_id').eq('class_id', classId),
    supabaseAdmin.from('teacher_assignments').select('teachers(profile_id)').eq('class_id', classId),
  ]);
  const studentIds = (studentsRes.data || []).map((s: any) => s.profile_id).filter(Boolean);
  const teacherIds = (teachersRes.data || []).map((t: any) => t.teachers?.profile_id).filter(Boolean);
  return [...new Set([...studentIds, ...teacherIds])];
};

export const getStudentParentProfileIds = async (studentId: string): Promise<string[]> => {
  const { data } = await supabaseAdmin
    .from('parent_student').select('parents(profile_id)').eq('student_id', studentId);
  return (data || []).map((ps: any) => ps.parents?.profile_id).filter(Boolean);
};
