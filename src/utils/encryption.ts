/**
 * ══════════════════════════════════════════════════════════════
 * Module de chiffrement AES-256-GCM — OMNIA Platform
 * ══════════════════════════════════════════════════════════════
 *
 * Implémentation conforme aux exigences de sécurité du projet :
 * - Algorithme : AES-256-GCM (chiffrement authentifié)
 * - IV : 16 octets aléatoires générés à chaque chiffrement
 * - AuthTag : 16 octets pour l'intégrité des données
 * - Format de sortie : iv:authTag:ciphertext (base64)
 *
 * Usage :
 *   import { encrypt, decrypt, hashSensitiveData } from '../utils/encryption';
 *   const encrypted = encrypt('données sensibles');
 *   const decrypted = decrypt(encrypted);
 */

import crypto from 'crypto';

// ─── Configuration ────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 16 octets pour l'IV
const AUTH_TAG_LENGTH = 16;  // 16 octets pour le tag d'authentification
const KEY_LENGTH = 32;       // 256 bits = 32 octets

/**
 * Récupère la clé de chiffrement depuis les variables d'environnement.
 * La clé doit être une chaîne hexadécimale de 64 caractères (32 octets).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.AES_ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      'AES_ENCRYPTION_KEY manquante dans les variables d\'environnement. ' +
      'Générez une clé avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  if (keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(
      `AES_ENCRYPTION_KEY invalide : attendu ${KEY_LENGTH * 2} caractères hex, reçu ${keyHex.length}`
    );
  }

  return Buffer.from(keyHex, 'hex');
}

// ─── Chiffrement AES-256-GCM ─────────────────────────────────

/**
 * Chiffre une chaîne de caractères avec AES-256-GCM.
 *
 * @param plaintext - Texte en clair à chiffrer
 * @returns Chaîne chiffrée au format "iv:authTag:ciphertext" (base64)
 *
 * @example
 * const encrypted = encrypt('mot_de_passe_sensible');
 * // → "a1b2c3...:d4e5f6...:g7h8i9..."
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format : iv:authTag:ciphertext (tout en base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':');
}

/**
 * Déchiffre une chaîne chiffrée avec AES-256-GCM.
 *
 * @param encryptedData - Chaîne chiffrée au format "iv:authTag:ciphertext"
 * @returns Texte en clair déchiffré
 * @throws Error si les données sont corrompues ou la clé incorrecte
 *
 * @example
 * const decrypted = decrypt(encryptedString);
 * // → "mot_de_passe_sensible"
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Format de données chiffrées invalide (attendu iv:authTag:ciphertext)');
  }

  const [ivB64, authTagB64, ciphertext] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ─── Hachage sécurisé (pour données non réversibles) ──────────

/**
 * Hash sécurisé avec SHA-256 + sel aléatoire.
 * Utilisé pour les données qui n'ont pas besoin d'être déchiffrées
 * (ex: comparaison de tokens, empreintes).
 *
 * @param data - Données à hacher
 * @returns Chaîne "salt:hash" en hex
 */
export function hashSensitiveData(data: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHmac('sha256', salt)
    .update(data)
    .digest('hex');

  return `${salt}:${hash}`;
}

/**
 * Vérifie un hash créé par hashSensitiveData.
 *
 * @param data - Données à vérifier
 * @param storedHash - Hash stocké au format "salt:hash"
 * @returns true si les données correspondent
 */
export function verifyHash(data: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;

  const hash = crypto
    .createHmac('sha256', salt)
    .update(data)
    .digest('hex');

  // Comparaison en temps constant pour éviter les timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(originalHash, 'hex')
  );
}

// ─── Utilitaires ──────────────────────────────────────────────

/**
 * Génère une clé AES-256 aléatoire (pour initialisation).
 * @returns Clé en hexadécimal (64 caractères)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Vérifie si une chaîne est un texte chiffré valide (format iv:authTag:ciphertext).
 */
export function isEncrypted(data: string): boolean {
  const parts = data.split(':');
  if (parts.length !== 3) return false;

  try {
    // Vérifier que les parties sont du base64 valide
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
}
