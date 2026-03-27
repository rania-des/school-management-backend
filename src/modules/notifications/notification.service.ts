// src/services/notification.service.ts
import { supabase } from '../config/supabase';

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  type?: 'grade' | 'attendance' | 'payment' | 'meeting' | 'announcement' | 'assignment' | 'general';
  data?: Record<string, any>;
}

export class NotificationService {

  // ── Créer une notification ─────────────────────────────────────────────
  static async create(payload: NotificationPayload) {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: payload.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type || 'general',
        data: payload.data || {},
        is_read: false,
      });

    if (error) console.error('[Notification] Error:', error);
    return !error;
  }

  // ── Créer plusieurs notifications ──────────────────────────────────────
  static async createMany(payloads: NotificationPayload[]) {
    if (payloads.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .insert(payloads.map(p => ({
        user_id: p.userId,
        title: p.title,
        body: p.body,
        type: p.type || 'general',
        data: p.data || {},
        is_read: false,
      })));

    if (error) console.error('[Notification] Error:', error);
  }

  // ── ABSENCE marquée → notifier le parent ──────────────────────────────
  static async onAttendanceMarked(params: {
    studentId: string;
    studentName: string;
    status: 'absent' | 'late';
    date: string;
    subjectName?: string;
    className?: string;
  }) {
    // Trouver les parents de l'élève
    const { data: parentLinks } = await supabase
      .from('parent_student')
      .select('parents(user_id), profiles:parents(profiles(first_name, last_name))')
      .eq('student_id', params.studentId);

    if (!parentLinks || parentLinks.length === 0) return;

    const statusLabel = params.status === 'absent' ? 'absent(e)' : 'en retard';
    const title = params.status === 'absent'
      ? `⚠️ Absence signalée`
      : `⏰ Retard signalé`;
    const body = `${params.studentName} a été marqué(e) ${statusLabel} le ${params.date}${params.subjectName ? ` en ${params.subjectName}` : ''}.`;

    const notifications = parentLinks
      .map((link: any) => link.parents?.user_id)
      .filter(Boolean)
      .map((userId: string) => ({
        userId,
        title,
        body,
        type: 'attendance' as const,
        data: { studentId: params.studentId, status: params.status, date: params.date },
      }));

    await this.createMany(notifications);

    // Notifier aussi l'élève lui-même
    const { data: student } = await supabase
      .from('students')
      .select('user_id')
      .eq('id', params.studentId)
      .single();

    if (student?.user_id) {
      await this.create({
        userId: student.user_id,
        title,
        body,
        type: 'attendance',
        data: { status: params.status, date: params.date },
      });
    }
  }

  // ── NOTE ajoutée → notifier l'élève + parent ──────────────────────────
  static async onGradeAdded(params: {
    studentId: string;
    studentName: string;
    subjectName: string;
    score: number;
    maxScore: number;
    title: string;
  }) {
    const emoji = params.score >= params.maxScore * 0.75 ? '🌟' : params.score >= params.maxScore * 0.5 ? '📊' : '📉';
    const notifTitle = `${emoji} Nouvelle note en ${params.subjectName}`;
    const body = `${params.studentName} a obtenu ${params.score}/${params.maxScore} pour "${params.title}".`;

    // Élève
    const { data: student } = await supabase
      .from('students')
      .select('user_id')
      .eq('id', params.studentId)
      .single();

    if (student?.user_id) {
      await this.create({
        userId: student.user_id,
        title: notifTitle,
        body,
        type: 'grade',
        data: { subjectName: params.subjectName, score: params.score, maxScore: params.maxScore },
      });
    }

    // Parents
    const { data: parentLinks } = await supabase
      .from('parent_student')
      .select('parents(user_id)')
      .eq('student_id', params.studentId);

    if (parentLinks?.length) {
      const parentNotifs = parentLinks
        .map((l: any) => l.parents?.user_id)
        .filter(Boolean)
        .map((userId: string) => ({
          userId,
          title: notifTitle,
          body,
          type: 'grade' as const,
          data: { studentId: params.studentId, subjectName: params.subjectName, score: params.score },
        }));
      await this.createMany(parentNotifs);
    }
  }

  // ── DEVOIR publié → notifier toute la classe ──────────────────────────
  static async onAssignmentCreated(params: {
    classId: string;
    title: string;
    subjectName: string;
    dueDate?: string;
    type: string;
  }) {
    const typeLabel: Record<string, string> = {
      homework: 'Devoir maison', exam: 'Examen', quiz: 'Quiz', project: 'Projet',
    };
    const notifTitle = `📝 ${typeLabel[params.type] || 'Devoir'} : ${params.title}`;
    const body = `Nouveau travail en ${params.subjectName}${params.dueDate ? `. À rendre le ${params.dueDate}` : ''}.`;

    // Tous les élèves de la classe
    const { data: students } = await supabase
      .from('students')
      .select('user_id')
      .eq('class_id', params.classId)
      .not('user_id', 'is', null);

    if (!students?.length) return;

    const notifs = students.map((s: any) => ({
      userId: s.user_id,
      title: notifTitle,
      body,
      type: 'assignment' as const,
      data: { classId: params.classId, subjectName: params.subjectName },
    }));
    await this.createMany(notifs);
  }

  // ── PAIEMENT en retard → notifier le parent ───────────────────────────
  static async onPaymentOverdue(params: {
    studentId: string;
    studentName: string;
    amount: number;
    description: string;
    dueDate: string;
  }) {
    const title = `💳 Paiement en retard`;
    const body = `Le paiement de ${params.amount} TND (${params.description}) pour ${params.studentName} est en retard depuis le ${params.dueDate}.`;

    const { data: parentLinks } = await supabase
      .from('parent_student')
      .select('parents(user_id)')
      .eq('student_id', params.studentId);

    if (!parentLinks?.length) return;

    const notifs = parentLinks
      .map((l: any) => l.parents?.user_id)
      .filter(Boolean)
      .map((userId: string) => ({
        userId,
        title,
        body,
        type: 'payment' as const,
        data: { studentId: params.studentId, amount: params.amount },
      }));
    await this.createMany(notifs);
  }

  // ── REUNION confirmée → notifier le parent ────────────────────────────
  static async onMeetingConfirmed(params: {
    parentUserId: string;
    teacherName: string;
    scheduledAt: string;
    location?: string;
  }) {
    await this.create({
      userId: params.parentUserId,
      title: '👥 Réunion confirmée',
      body: `Votre réunion avec ${params.teacherName} est confirmée pour le ${params.scheduledAt}${params.location ? ` — ${params.location}` : ''}.`,
      type: 'meeting',
      data: { scheduledAt: params.scheduledAt },
    });
  }

  // ── ANNONCE publiée → notifier selon la cible ─────────────────────────
  static async onAnnouncementCreated(params: {
    title: string;
    classId?: string;
    targetRole?: string;
  }) {
    let userIds: string[] = [];

    if (params.classId) {
      // Élèves d'une classe spécifique
      const { data } = await supabase
        .from('students')
        .select('user_id')
        .eq('class_id', params.classId)
        .not('user_id', 'is', null);
      userIds = (data || []).map((s: any) => s.user_id);
    } else if (params.targetRole) {
      // Tous les utilisateurs d'un rôle
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('role', params.targetRole);
      userIds = (data || []).map((u: any) => u.id);
    } else {
      // Tout le monde
      const { data } = await supabase
        .from('users')
        .select('id')
        .in('role', ['student', 'parent', 'teacher']);
      userIds = (data || []).map((u: any) => u.id);
    }

    if (!userIds.length) return;

    const notifs = userIds.map(userId => ({
      userId,
      title: `📢 ${params.title}`,
      body: 'Cliquez pour voir l\'annonce complète.',
      type: 'announcement' as const,
    }));
    await this.createMany(notifs);
  }
}
