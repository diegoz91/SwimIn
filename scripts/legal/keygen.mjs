#!/usr/bin/env node
/**
 * Coppia di chiavi per la conservazione su ordine dell'autorità (una volta sola, su un computer fidato).
 *
 *   node scripts/legal/keygen.mjs [cartella]
 *
 * - escrow-public.pem  → va nel secret GitHub ESCROW_PUBLIC_KEY (o nella variabile della Function):
 *                        serve solo a CIFRARE, non permette di leggere nulla.
 * - escrow-private.pem → cifrata con una frase segreta (AES-256). NON va mai su GitHub, Appwrite o
 *                        Vercel: conservarla fuori linea (chiavetta in cassaforte + copia presso il
 *                        legale). Senza questa chiave le copie sigillate non si possono aprire.
 */
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const dir = process.argv[2] || '.';
const pubPath = join(dir, 'escrow-public.pem');
const privPath = join(dir, 'escrow-private.pem');
if (existsSync(privPath)) {
  console.error(`Esiste già ${privPath}: non la sovrascrivo (perderesti l'accesso alle copie già sigillate).`);
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const passphrase = process.env.ESCROW_PASSPHRASE || (await rl.question('Frase segreta per proteggere la chiave privata (almeno 16 caratteri): '));
rl.close();
if (passphrase.length < 16) {
  console.error('Frase troppo corta: usa almeno 16 caratteri.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 4096,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase },
});
mkdirSync(dir, { recursive: true });
writeFileSync(pubPath, publicKey);
writeFileSync(privPath, privateKey, { mode: 0o600 });
console.log(`Chiave pubblica: ${pubPath}  → copiala nel secret GitHub ESCROW_PUBLIC_KEY`);
console.log(`Chiave privata:  ${privPath} → spostala fuori linea e cancellala da questo computer`);
