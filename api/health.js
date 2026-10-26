/**
 * /api/health — controllo di salute per i monitor esterni (UptimeRobot, Better Stack, GitHub):
 * 200 se la Function di Appwrite risponde, 503 se no. Include lo stato del servizio deciso dagli
 * amministratori (ok, rallentamenti, manutenzione). Nessuna chiave: usa l'azione pubblica "health".
 */
import { callPublic } from './_public.js';

export async function checkHealth(call = callPublic, now = () => Date.now()) {
    const started = now();
    try {
        const data = await call('health');
        return {
            ok: true,
            appwrite: 'ok',
            latencyMs: now() - started,
            version: data?.version || '',
            mode: data?.status?.mode || 'ok',
            message: data?.status?.message || '',
        };
    } catch (e) {
        return { ok: false, appwrite: 'down', latencyMs: now() - started, error: String(e?.message || e).slice(0, 200) };
    }
}

export default async function handler(req, res) {
    const result = await checkHealth();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.ok ? 200 : 503).json({ site: 'ok', checkedAt: new Date().toISOString(), ...result });
}
