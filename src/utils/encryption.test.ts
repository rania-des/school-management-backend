/**
 * Test simple du module de chiffrement AES-256-GCM
 * 
 * Exécution : npx ts-node src/utils/encryption.test.ts
 * (ou via node après compilation)
 */

// Simuler la variable d'environnement pour le test
process.env.AES_ENCRYPTION_KEY = 'a3f8b2c1d4e5f6071829304a5b6c7d8e9f0a1b2c3d4e5f6071829304a5b6c7d8';

import { encrypt, decrypt, hashSensitiveData, verifyHash, generateEncryptionKey, isEncrypted } from './encryption';

console.log('═══════════════════════════════════════════');
console.log('  Tests du module de chiffrement AES-256-GCM');
console.log('═══════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── Test 1 : Chiffrement/Déchiffrement round-trip ──
test('encrypt → decrypt : round-trip correct', () => {
  const original = 'mot_de_passe_super_secret_123!@#';
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);
  assert(decrypted === original, `Attendu "${original}", reçu "${decrypted}"`);
});

// ── Test 2 : Le chiffrement produit un résultat différent à chaque appel ──
test('encrypt : IV aléatoire (résultats différents)', () => {
  const data = 'même données';
  const enc1 = encrypt(data);
  const enc2 = encrypt(data);
  assert(enc1 !== enc2, 'Les deux chiffrements devraient être différents (IV aléatoire)');
});

// ── Test 3 : Format de sortie correct ──
test('encrypt : format iv:authTag:ciphertext', () => {
  const encrypted = encrypt('test');
  const parts = encrypted.split(':');
  assert(parts.length === 3, `Attendu 3 parties, reçu ${parts.length}`);
});

// ── Test 4 : Données corrompues → erreur ──
test('decrypt : rejette les données corrompues', () => {
  try {
    decrypt('données:invalides:corrompues');
    throw new Error('Devrait avoir échoué');
  } catch (err: any) {
    assert(!err.message.includes('Devrait avoir échoué'), 'Le déchiffrement aurait dû échouer');
  }
});

// ── Test 5 : Chaînes unicode (arabe, émojis) ──
test('encrypt/decrypt : supporte Unicode (arabe, émojis)', () => {
  const arabic = 'مرحبا بالعالم 🌍 données تونس';
  const encrypted = encrypt(arabic);
  const decrypted = decrypt(encrypted);
  assert(decrypted === arabic, 'Les caractères Unicode ne sont pas préservés');
});

// ── Test 6 : Chaîne vide ──
test('encrypt/decrypt : chaîne vide', () => {
  const encrypted = encrypt('');
  const decrypted = decrypt(encrypted);
  assert(decrypted === '', `Attendu chaîne vide, reçu "${decrypted}"`);
});

// ── Test 7 : Hachage ──
test('hashSensitiveData/verifyHash : round-trip correct', () => {
  const data = 'token_secret_12345';
  const hash = hashSensitiveData(data);
  assert(verifyHash(data, hash), 'La vérification du hash devrait réussir');
  assert(!verifyHash('mauvais_data', hash), 'La vérification avec de mauvaises données devrait échouer');
});

// ── Test 8 : Génération de clé ──
test('generateEncryptionKey : longueur correcte (64 hex)', () => {
  const key = generateEncryptionKey();
  assert(key.length === 64, `Attendu 64 caractères, reçu ${key.length}`);
  assert(/^[0-9a-f]+$/.test(key), 'La clé doit être en hexadécimal');
});

// ── Test 9 : isEncrypted ──
test('isEncrypted : détecte le format chiffré', () => {
  const encrypted = encrypt('test');
  assert(isEncrypted(encrypted), 'Devrait détecter comme chiffré');
  assert(!isEncrypted('texte normal'), 'Texte normal ne devrait pas être détecté');
  assert(!isEncrypted('a:b'), 'Format incomplet ne devrait pas être détecté');
});

// ── Résumé ──
console.log('\n═══════════════════════════════════════════');
console.log(`  Résultats: ${passed} passés, ${failed} échoués`);
console.log('═══════════════════════════════════════════');

if (failed > 0) process.exit(1);
