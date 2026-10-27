/**
 * Copie sigillate per la conservazione su ordine dell'autorità.
 *
 * Ogni copia è cifrata con una chiave AES-256-GCM casuale, a sua volta cifrata con la chiave
 * pubblica RSA della società (RSA-OAEP, SHA-256). La chiave privata NON sta mai nel sistema:
 * la custodisce la società fuori linea e serve solo a decifrare un'esportazione da consegnare
 * all'autorità (scripts/legal/decrypt.mjs). Chi ha accesso al database o alla Function vede solo
 * testo cifrato.
 */
import { createCipheriv, createDecipheriv, createHash, createPublicKey, privateDecrypt, publicEncrypt, randomBytes, constants } from 'node:crypto';

export const SEAL_ALG = 'RSA-OAEP-256+A256GCM';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** null se la chiave non è configurata o non è una chiave pubblica RSA valida. */
export function makeSealer(publicKeyPem) {
  if (!publicKeyPem) return null;
  let key;
  try {
    key = createPublicKey(String(publicKeyPem).replace(/\\n/g, '\n'));
    if (key.asymmetricKeyType !== 'rsa') return null;
  } catch {
    return null;
  }
  return {
    /** Oggetto → stringa JSON cifrata (con la sua impronta SHA-256 per la catena di custodia). */
    seal(value) {
      const dataKey = randomBytes(32);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
      const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      const sealed = JSON.stringify({
        v: 1,
        alg: SEAL_ALG,
        ek: publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dataKey).toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ct: ct.toString('base64'),
      });
      return { sealed, hash: sha256(sealed) };
    },
  };
}

/** Solo fuori linea (script di decifratura): stringa sigillata + chiave privata → oggetto. */
export function openSealed(sealed, privateKey) {
  const box = JSON.parse(sealed);
  if (box.v !== 1 || box.alg !== SEAL_ALG) throw new Error('Formato della copia sigillata non riconosciuto.');
  const dataKey = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(box.ek, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(box.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.ct, 'base64')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}
