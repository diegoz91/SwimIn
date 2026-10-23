/**
 * Web Push senza dipendenze esterne: cifratura aes128gcm (RFC 8291) e
 * autenticazione VAPID (RFC 8292) con il modulo crypto di Node.
 */
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

/** Nuova coppia di chiavi VAPID (pubblica 65 byte non compressa, privata 32 byte), in base64url. */
export function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

/** Header Authorization VAPID per l'endpoint indicato (JWT ES256 valido 12 ore). */
export function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const pub = fromB64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Chiave VAPID pubblica non valida');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${publicKey}`;
}

/** Cifra il payload per una sottoscrizione (chiavi p256dh e auth del browser). */
export function encryptPayload(payload, { p256dh, auth }, { salt = crypto.randomBytes(16), ecdh } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Chiavi della sottoscrizione non valide');
  const local = ecdh || crypto.createECDH('prime256v1');
  if (!ecdh) local.generateKeys();
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // Un solo record: payload seguito dal delimitatore di ultimo record (0x02).
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/**
 * Invia una notifica push. Restituisce lo status HTTP del servizio push del browser:
 * 201 consegnata, 404/410 sottoscrizione scaduta (da eliminare).
 */
export async function sendWebPush(subscription, payload, vapid, { ttl = 86400, urgency = 'normal', fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const body = encryptPayload(JSON.stringify(payload), subscription);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        TTL: String(ttl),
        Urgency: urgency,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        Authorization: vapidAuthorization(subscription.endpoint, vapid),
      },
      body,
      signal: controller.signal,
    });
    return res.status;
  } finally {
    clearTimeout(timer);
  }
}
