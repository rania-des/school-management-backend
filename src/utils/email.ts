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

// Export du transporteur pour utilisation avancée
export const getTransporter = () => initTransporter();