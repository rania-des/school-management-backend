import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit faire au moins 6 caractères'),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Le mot de passe doit faire au moins 8 caractères')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Le mot de passe doit contenir majuscule, minuscule et chiffre'
    ),
  firstName:   z.string().min(2).max(100),
  lastName:    z.string().min(2).max(100),
  role:        z.enum(['student', 'parent', 'teacher', 'admin']),
  gender:      z.enum(['male', 'female']).optional(),
  phone:       z.string().optional(),
  dateOfBirth: z.string().optional(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
});

// Schéma pour la réinitialisation depuis le lien email (?token=xxx)
export const resetPasswordWithTokenSchema = z.object({
  token:    z.string().min(1, 'Token requis'),
  password: z
    .string()
    .min(8)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Le mot de passe doit contenir majuscule, minuscule et chiffre'
    ),
});

export const updatePasswordSchema = z.object({
  password: z
    .string()
    .min(8)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Le mot de passe doit contenir majuscule, minuscule et chiffre'
    ),
});