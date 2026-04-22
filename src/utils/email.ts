import nodemailer from 'nodemailer';
import { createTransport } from 'nodemailer';

// Configuration du transporteur avec vérification
let transporter: nodemailer.Transporter | null = null;

// Initialiser le transporteur seulement si les credentials sont présents
const initTransporter = () => {
  if (transporter) return transporter;
  
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  
  if (!smtpUser || !smtpPass) {
    console.warn('⚠️ SMTP credentials not configured. Emails will not be sent.');
    return null;
  }
  
  transporter = createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
  
  return transporter;
};

const FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@school.com';
const APP_NAME = process.env.APP_NAME || 'School Platform';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Helper pour envoyer des emails avec gestion d'erreur
const sendEmail = async (to: string, subject: string, html: string) => {
  const mailTransport = initTransporter();
  if (!mailTransport) {
    console.log(`📧 Email not sent (no config): ${subject} to ${to}`);
    return { success: false, error: 'Email service not configured' };
  }
  
  try {
    const info = await mailTransport.sendMail({
      from: `"${APP_NAME}" <${FROM}>`,
      to,
      subject,
      html,
    });
    console.log(`📧 Email sent: ${subject} to ${to}`);
    return { success: true, info };
  } catch (error) {
    console.error(`❌ Email failed: ${subject} to ${to}`, error);
    return { success: false, error };
  }
};

export const sendPasswordResetEmail = async (email: string, resetLink: string) => {
  return sendEmail(
    email,
    `[${APP_NAME}] Réinitialisation de mot de passe`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Réinitialisation de votre mot de passe</h2>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
        <a href="${resetLink}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
          Réinitialiser le mot de passe
        </a>
        <p>Ce lien expire dans 24 heures.</p>
        <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
        <hr style="margin: 20px 0; border-color: #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">© ${new Date().getFullYear()} ${APP_NAME}. Tous droits réservés.</p>
      </div>
    `
  );
};

export const sendWelcomeEmail = async (email: string, firstName: string, role: string) => {
  const roleLabels: Record<string, string> = {
    student: 'élève',
    teacher: 'enseignant',
    parent: 'parent',
    admin: 'administrateur',
  };
  
  return sendEmail(
    email,
    `[${APP_NAME}] Bienvenue !`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Bienvenue sur ${APP_NAME}, ${firstName} !</h2>
        <p>Votre compte a été créé avec succès.</p>
        <p><strong>Rôle :</strong> ${roleLabels[role] || role}</p>
        <p>Connectez-vous dès maintenant pour accéder à votre espace personnel.</p>
        <a href="${FRONTEND_URL}/login" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
          Se connecter
        </a>
        <hr style="margin: 20px 0; border-color: #E5E7EB;">
        <p style="color: #6B7280; font-size: 12px;">© ${new Date().getFullYear()} ${APP_NAME}. Tous droits réservés.</p>
      </div>
    `
  );
};

export const sendMeetingNotification = async (
  email: string,
  firstName: string,
  meetingDate: string,
  teacherName: string
) => {
  return sendEmail(
    email,
    `[${APP_NAME}] Réunion confirmée`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Réunion confirmée</h2>
        <p>Bonjour ${firstName},</p>
        <p>Votre réunion avec <strong>${teacherName}</strong> est confirmée pour le <strong>${meetingDate}</strong>.</p>
        <a href="${FRONTEND_URL}/meetings" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
          Voir mes réunions
        </a>
      </div>
    `
  );
};

export const sendAbsenceNotification = async (
  email: string,
  parentName: string,
  studentName: string,
  date: string
) => {
  return sendEmail(
    email,
    `[${APP_NAME}] Absence de ${studentName}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #DC2626;">Signalement d'absence</h2>
        <p>Bonjour ${parentName},</p>
        <p>Votre enfant <strong>${studentName}</strong> a été marqué(e) absent(e) le <strong>${date}</strong>.</p>
        <a href="${FRONTEND_URL}/attendance" style="background:#EF4444;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
          Voir les absences
        </a>
      </div>
    `
  );
};

export const sendAssignmentNotification = async (
  email: string,
  studentName: string,
  assignmentTitle: string,
  dueDate: string,
  teacherName: string
) => {
  return sendEmail(
    email,
    `[${APP_NAME}] Nouveau devoir : ${assignmentTitle}`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Nouveau devoir publié</h2>
        <p>Bonjour ${studentName},</p>
        <p><strong>${teacherName}</strong> a publié un nouveau devoir : <strong>${assignmentTitle}</strong></p>
        <p>Date limite : <strong>${dueDate}</strong></p>
        <a href="${FRONTEND_URL}/assignments" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin:16px 0;">
          Voir le devoir
        </a>
      </div>
    `
  );
};

export const sendLoginVerificationEmail = async (email: string, code: string) => {
  return sendEmail(
    email,
    `[${APP_NAME}] Code de vérification`,
    `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1E3A5F;">Code de vérification</h2>
        <p>Votre code de vérification est :</p>
        <div style="background:#F3F4F6;padding:16px;border-radius:8px;text-align:center;margin:16px 0;">
          <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1F2937;">${code}</span>
        </div>
        <p>Ce code expire dans 10 minutes.</p>
        <p>Si vous n'avez pas demandé ce code, ignorez cet email.</p>
      </div>
    `
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NOUVEAU — Rapport hebdomadaire parent (généré par l'IA)
// ─────────────────────────────────────────────────────────────────────────────

interface ChildNarrative {
  studentName: string;
  narrative: string;
  data: {
    grades: Array<{ score: number; max_score: number; title: string; subjects: { name: string } | null }>;
    absences: Array<{ status: string; date: string }>;
    assignments: Array<{ title: string; due_date: string; submitted: boolean; subjects: { name: string } | null }>;
  };
}

const subjectLabels: Record<string, Record<string, string>> = {
  fr: { grades: 'Notes', absences: 'Absences / Retards', assignments: 'Devoirs', submitted: 'Rendu', pending: 'À rendre', absent: 'Absent', late: 'En retard' },
  en: { grades: 'Grades', absences: 'Absences / Late', assignments: 'Assignments', submitted: 'Submitted', pending: 'Pending', absent: 'Absent', late: 'Late' },
  ar: { grades: 'الدرجات', absences: 'الغياب / التأخر', assignments: 'الواجبات', submitted: 'مُسلَّم', pending: 'لم يُسلَّم', absent: 'غائب', late: 'متأخر' },
};

function buildChildSection(child: ChildNarrative, lang: 'fr' | 'ar' | 'en', i: number): string {
  const l = subjectLabels[lang] || subjectLabels.fr;
  const { grades, absences, assignments } = child.data;

  const gradesRows = grades.length
    ? grades
        .map(
          (g) =>
            `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;">${g.subjects?.name ?? '—'}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;">${g.title}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;text-align:center;font-weight:bold;color:${
                (g.score / (g.max_score || 20)) * 20 >= 10 ? '#16A34A' : '#DC2626'
              };">${g.score}/${g.max_score ?? 20}</td>
            </tr>`
        )
        .join('')
    : `<tr><td colspan="3" style="padding:8px 10px;color:#9CA3AF;font-style:italic;">—</td></tr>`;

  const absenceRows = absences.length
    ? absences
        .map(
          (a) =>
            `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;">${a.date}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;color:${a.status === 'absent' ? '#DC2626' : '#F59E0B'};">${
                l[a.status as 'absent' | 'late'] ?? a.status
              }</td>
            </tr>`
        )
        .join('')
    : `<tr><td colspan="2" style="padding:8px 10px;color:#9CA3AF;font-style:italic;">—</td></tr>`;

  const assignmentRows = assignments.length
    ? assignments
        .map(
          (a) =>
            `<tr>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;">${a.subjects?.name ?? '—'}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;">${a.title}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;text-align:center;">${
                a.submitted
                  ? `<span style="color:#16A34A;">✅ ${l.submitted}</span>`
                  : `<span style="color:#DC2626;">❌ ${l.pending}</span>`
              }</td>
              <td style="padding:6px 10px;border-bottom:1px solid #F3F4F6;color:#6B7280;">${a.due_date}</td>
            </tr>`
        )
        .join('')
    : `<tr><td colspan="4" style="padding:8px 10px;color:#9CA3AF;font-style:italic;">—</td></tr>`;

  // Narrative paragraphs (preserve line breaks)
  const narrativeHtml = child.narrative
    .split('\n')
    .filter((l) => l.trim())
    .map((p) => `<p style="margin:0 0 12px;line-height:1.65;">${p}</p>`)
    .join('');

  return `
    <div style="background:#F9FAFB;border-radius:12px;padding:20px 24px;margin-bottom:28px;${i > 0 ? 'margin-top:12px;' : ''}">
      <h3 style="margin:0 0 16px;font-size:18px;color:#1E3A5F;border-bottom:2px solid #3B82F6;padding-bottom:8px;">
        🎒 ${child.studentName}
      </h3>

      <!-- Narrative IA -->
      <div style="background:white;border-left:4px solid #3B82F6;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;color:#374151;font-size:14px;">
        ${narrativeHtml}
      </div>

      <!-- Notes -->
      <h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;">📊 ${l.grades}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <thead><tr style="background:#EFF6FF;">
          <th style="padding:8px 10px;text-align:left;color:#1E3A5F;">Matière</th>
          <th style="padding:8px 10px;text-align:left;color:#1E3A5F;">Titre</th>
          <th style="padding:8px 10px;text-align:center;color:#1E3A5F;">Note</th>
        </tr></thead>
        <tbody>${gradesRows}</tbody>
      </table>

      <!-- Absences -->
      <h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;">🔴 ${l.absences}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
        <thead><tr style="background:#FEF2F2;">
          <th style="padding:8px 10px;text-align:left;color:#991B1B;">Date</th>
          <th style="padding:8px 10px;text-align:left;color:#991B1B;">Statut</th>
        </tr></thead>
        <tbody>${absenceRows}</tbody>
      </table>

      <!-- Devoirs -->
      <h4 style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280;">📝 ${l.assignments}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#F0FDF4;">
          <th style="padding:8px 10px;text-align:left;color:#166534;">Matière</th>
          <th style="padding:8px 10px;text-align:left;color:#166534;">Titre</th>
          <th style="padding:8px 10px;text-align:center;color:#166534;">Rendu</th>
          <th style="padding:8px 10px;text-align:left;color:#166534;">Échéance</th>
        </tr></thead>
        <tbody>${assignmentRows}</tbody>
      </table>
    </div>
  `;
}

export const sendWeeklyParentReport = async (
  email: string,
  parentName: string,
  children: ChildNarrative[],
  weekStart: string,
  weekEnd: string,
  language: 'fr' | 'ar' | 'en' = 'fr'
) => {
  const subjects: Record<'fr' | 'ar' | 'en', { subject: string; greeting: string; footer: string; portal: string }> = {
    fr: {
      subject: `Rapport scolaire hebdomadaire — semaine du ${weekStart}`,
      greeting: `Bonjour ${parentName},`,
      footer: `Bonne semaine à vous et à votre famille !`,
      portal: 'Accéder au portail',
    },
    en: {
      subject: `Weekly School Report — week of ${weekStart}`,
      greeting: `Hello ${parentName},`,
      footer: `Have a great week!`,
      portal: 'Access Portal',
    },
    ar: {
      subject: `التقرير الأسبوعي المدرسي — أسبوع ${weekStart}`,
      greeting: `مرحباً ${parentName}،`,
      footer: `نتمنى لكم وعائلتكم أسبوعاً رائعاً!`,
      portal: 'الوصول إلى البوابة',
    },
  };

  const t = subjects[language] || subjects.fr;
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const childrenSections = children
    .map((c, i) => buildChildSection(c, language, i))
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1F2937;" dir="${dir}">
      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%);padding:32px 36px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">🏫 ${APP_NAME}</h1>
        <p style="margin:8px 0 0;color:#BFDBFE;font-size:14px;">${weekStart} → ${weekEnd}</p>
      </div>

      <!-- Body -->
      <div style="background:white;padding:28px 36px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px;">
        <p style="font-size:15px;margin:0 0 20px;">${t.greeting}</p>

        ${childrenSections}

        <!-- CTA -->
        <div style="text-align:center;margin-top:24px;">
          <a href="${FRONTEND_URL}/dashboard"
             style="background:#2563EB;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;display:inline-block;font-size:14px;font-weight:600;">
            ${t.portal}
          </a>
        </div>

        <p style="margin:24px 0 0;color:#6B7280;font-size:13px;text-align:center;">${t.footer}</p>
        <hr style="margin:20px 0;border-color:#E5E7EB;">
        <p style="color:#9CA3AF;font-size:11px;text-align:center;">© ${new Date().getFullYear()} ${APP_NAME}. Tous droits réservés.</p>
      </div>
    </div>
  `;

  return sendEmail(email, `[${APP_NAME}] ${t.subject}`, html);
};

// Export du transporteur pour utilisation avancée
export const getTransporter = () => initTransporter();