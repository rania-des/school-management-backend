import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.EMAIL_FROM || 'noreply@school.com';
const APP_NAME = process.env.APP_NAME || 'School Platform';

export const sendPasswordResetEmail = async (email: string, resetLink: string) => {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `[${APP_NAME}] Réinitialisation de mot de passe`,
    html: `
      <h2>Réinitialisation de votre mot de passe</h2>
      <p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
      <a href="${resetLink}" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Réinitialiser le mot de passe
      </a>
      <p>Ce lien expire dans 24 heures.</p>
      <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    `,
  });
};

export const sendWelcomeEmail = async (email: string, firstName: string, role: string) => {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `[${APP_NAME}] Bienvenue !`,
    html: `
      <h2>Bienvenue sur ${APP_NAME}, ${firstName} !</h2>
      <p>Votre compte a été créé avec le rôle : <strong>${role}</strong>.</p>
      <p>Connectez-vous dès maintenant pour accéder à votre espace.</p>
      <a href="${process.env.FRONTEND_URL}/login" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Se connecter
      </a>
    `,
  });
};

export const sendMeetingNotification = async (
  email: string,
  firstName: string,
  meetingDate: string,
  teacherName: string
) => {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `[${APP_NAME}] Réunion confirmée`,
    html: `
      <h2>Réunion confirmée</h2>
      <p>Bonjour ${firstName},</p>
      <p>Votre réunion avec ${teacherName} est confirmée pour le <strong>${meetingDate}</strong>.</p>
      <a href="${process.env.FRONTEND_URL}/meetings" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Voir mes réunions
      </a>
    `,
  });
};

export const sendAbsenceNotification = async (
  email: string,
  parentName: string,
  studentName: string,
  date: string
) => {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `[${APP_NAME}] Absence de ${studentName}`,
    html: `
      <h2>Signalement d'absence</h2>
      <p>Bonjour ${parentName},</p>
      <p>Votre enfant <strong>${studentName}</strong> a été marqué(e) absent(e) le <strong>${date}</strong>.</p>
      <a href="${process.env.FRONTEND_URL}/attendance" style="background:#EF4444;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Voir les absences
      </a>
    `,
  });
};
