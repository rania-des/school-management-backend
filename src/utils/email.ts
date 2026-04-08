import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@school.com';
const APP_NAME = process.env.APP_NAME || 'School Platform';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const sendPasswordResetEmail = async (email: string, resetLink: string) => {
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
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
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to: email,
    subject: `[${APP_NAME}] Bienvenue !`,
    html: `
      <h2>Bienvenue sur ${APP_NAME}, ${firstName} !</h2>
      <p>Votre compte a été créé avec le rôle : <strong>${role}</strong>.</p>
      <p>Connectez-vous dès maintenant pour accéder à votre espace.</p>
      <a href="${FRONTEND_URL}/login" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
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
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to: email,
    subject: `[${APP_NAME}] Réunion confirmée`,
    html: `
      <h2>Réunion confirmée</h2>
      <p>Bonjour ${firstName},</p>
      <p>Votre réunion avec ${teacherName} est confirmée pour le <strong>${meetingDate}</strong>.</p>
      <a href="${FRONTEND_URL}/meetings" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
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
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to: email,
    subject: `[${APP_NAME}] Absence de ${studentName}`,
    html: `
      <h2>Signalement d'absence</h2>
      <p>Bonjour ${parentName},</p>
      <p>Votre enfant <strong>${studentName}</strong> a été marqué(e) absent(e) le <strong>${date}</strong>.</p>
      <a href="${FRONTEND_URL}/attendance" style="background:#EF4444;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Voir les absences
      </a>
    `,
  });
};

export const sendAssignmentNotification = async (
  email: string,
  studentName: string,
  assignmentTitle: string,
  dueDate: string,
  teacherName: string
) => {
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to: email,
    subject: `[${APP_NAME}] Nouveau devoir : ${assignmentTitle}`,
    html: `
      <h2>Nouveau devoir publié</h2>
      <p>Bonjour ${studentName},</p>
      <p>${teacherName} a publié un nouveau devoir : <strong>${assignmentTitle}</strong></p>
      <p>Date limite : <strong>${dueDate}</strong></p>
      <a href="${FRONTEND_URL}/assignments" style="background:#3B82F6;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
        Voir le devoir
      </a>
    `,
  });
};

export const sendLoginVerificationEmail = async (email: string, code: string) => {
  await transporter.sendMail({
    from: `"${APP_NAME}" <${FROM}>`,
    to: email,
    subject: `[${APP_NAME}] Code de vérification`,
    html: `
      <h2>Code de vérification</h2>
      <p>Votre code de vérification est :</p>
      <div style="background:#F3F4F6;padding:16px;border-radius:8px;text-align:center;margin:16px 0;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1F2937;">${code}</span>
      </div>
      <p>Ce code expire dans 10 minutes.</p>
      <p>Si vous n'avez pas demandé ce code, ignorez cet email.</p>
    `,
  });
};
