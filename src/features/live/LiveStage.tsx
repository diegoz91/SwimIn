import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoTrack } from 'livekit-client';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/form/Pickers';
import { Checkbox } from '@/components/form/Field';
import { useToast } from '@/context/ToastContext';
import { detectDevice, permissionHelp } from '@/utils/device';
import type { LiveParticipant, LiveSession } from './useLiveSession';

/** Collega una traccia video a un elemento <video> (e la stacca quando cambia). */
const VideoView: React.FC<{ track: VideoTrack; mirror?: boolean; fit?: 'cover' | 'contain'; label: string }> = ({ track, mirror, fit = 'contain', label }) => {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        track.attach(el);
        return () => {
            track.detach(el);
        };
    }, [track]);
    return <video ref={ref} aria-label={label} autoPlay playsInline muted className={`w-full h-full bg-black ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${mirror ? '-scale-x-100' : ''}`} />;
};

/** Il video principale: lo schermo condiviso ha la precedenza, poi chi conduce (o OBS/Prism), poi chi parla. */
function pickMain(list: LiveParticipant[]) {
    const screen = list.find((p) => p.screen);
    if (screen) return { who: screen, track: screen.screen!, kind: 'screen' as const };
    const ordered = [...list.filter((p) => p.isIngress), ...list.filter((p) => p.isHost && !p.isIngress), ...list.filter((p) => p.isSpeaking), ...list];
    const cam = ordered.find((p) => p.camera);
    return cam ? { who: cam, track: cam.camera!, kind: 'camera' as const } : null;
}

interface Props {
    session: LiveSession;
    isHost: boolean;
    hostName: string;
    /** Fine della diretta (durata massima del piano). */
    endsAt?: string;
    onTimeUp?: () => void;
}

/**
 * Palco video della diretta: video principale (schermo condiviso o chi conduce), riquadri
 * di chi è sul palco e, per chi può trasmettere, i controlli di fotocamera, microfono e schermo.
 * Mostra solo ciò che il dispositivo sa fare (lo schermo si condivide solo da computer).
 */
export const LiveStage: React.FC<Props> = ({ session, isHost, hostName, endsAt, onTimeUp }) => {
    const { showToast } = useToast();
    const device = useMemo(() => detectDevice(), []);
    const stageRef = useRef<HTMLDivElement>(null);
    const [denied, setDenied] = useState(false);
    const [withAudio, setWithAudio] = useState(true);
    const [settings, setSettings] = useState(false);
    const main = pickMain(session.participants);
    const others = session.participants.filter((p) => p.camera && !(main?.kind === 'camera' && main.who.identity === p.identity));
    const remaining = useRemaining(endsAt, onTimeUp);

    const run = async (fn: () => Promise<{ message: string; denied: boolean } | null>) => {
        const err = await fn();
        if (err) {
            setDenied(err.denied);
            showToast(err.message, 'error');
        } else setDenied(false);
    };

    const fullscreen = () => {
        const el = stageRef.current;
        if (!el) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void el.requestFullscreen?.().catch((err: unknown) => console.warn('Schermo intero:', err));
    };

    const status = session.status;
    const btn = (on: boolean) => `w-12 h-12 rounded-full grid place-items-center transition-colors ${on ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-abisso hover:bg-slate-100'}`;

    return (
        <div className="space-y-3">
            <div ref={stageRef} className="relative aspect-video rounded-2xl overflow-hidden bg-black/60">
                {main ? (
                    <VideoView track={main.track} mirror={main.who.isLocal && main.kind === 'camera' && session.facing === 'user'} label={main.kind === 'screen' ? `Schermo condiviso da ${main.who.name}` : `Video di ${main.who.name}`} />
                ) : (
                    <div className="absolute inset-0 grid place-items-center text-center px-6">
                        <div>
                            <Icon type={status === 'connecting' ? 'signal' : 'video'} className="w-10 h-10 mx-auto text-white/60" />
                            <p className="mt-3 font-semibold text-white">
                                {status === 'connecting' ? 'Collegamento al video…' : status === 'reconnecting' ? 'Connessione persa, ci ricolleghiamo…' : status === 'error' ? 'Video non raggiungibile' : isHost ? 'Sei in diretta: scegli come trasmettere' : `${hostName} non sta ancora trasmettendo`}
                            </p>
                            <p className="mt-1 text-sm text-white/70">
                                {status === 'error' ? 'Controlla la connessione e riprova.' : isHost ? (device.canShareScreen ? 'Fotocamera, microfono, schermo, oppure OBS o Prism.' : 'Fotocamera e microfono, oppure Prism Live Studio.') : 'Resta qui: il video parte da solo.'}
                            </p>
                            {status === 'error' && (
                                <button onClick={session.retry} className="mt-4 px-4 py-2 rounded-full text-sm font-semibold bg-white text-abisso hover:bg-slate-100">Riprova</button>
                            )}
                        </div>
                    </div>
                )}

                {main && <span className="absolute left-3 bottom-3 max-w-[70%] truncate text-xs font-semibold text-white bg-black/60 rounded-full px-2.5 py-1">{main.kind === 'screen' ? `Schermo di ${main.who.name}` : main.who.name}</span>}
                {remaining && <span className={`absolute right-3 top-3 text-xs font-semibold rounded-full px-2.5 py-1 ${remaining.warn ? 'bg-galleggiante-700 text-white' : 'bg-black/60 text-white'}`}>{remaining.label}</span>}
                {session.audioBlocked && status === 'connected' && (
                    <button onClick={session.startAudio} className="absolute inset-x-0 mx-auto top-1/2 -translate-y-1/2 w-fit px-5 py-3 rounded-full font-semibold bg-white text-abisso shadow-lift inline-flex items-center gap-2">
                        <Icon type="speaker-wave" className="w-5 h-5" /> Attiva l’audio
                    </button>
                )}
                {main && (
                    <button onClick={fullscreen} className="absolute right-3 bottom-3 w-10 h-10 rounded-full grid place-items-center bg-black/60 text-white hover:bg-black/80" aria-label="Schermo intero">
                        <Icon type="arrows-expand" className="w-5 h-5" />
                    </button>
                )}
                <div ref={session.audioRef} className="hidden" aria-hidden="true" />
            </div>

            {others.length > 0 && (
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" aria-label="Sul palco">
                    {others.map((p) => (
                        <li key={p.identity} className={`relative aspect-video rounded-xl overflow-hidden bg-black/60 ${p.isSpeaking ? 'ring-2 ring-cloro-400' : ''}`}>
                            <VideoView track={p.camera!} mirror={p.isLocal && session.facing === 'user'} fit="cover" label={`Video di ${p.name}`} />
                            <span className="absolute left-1.5 bottom-1.5 max-w-[85%] truncate text-[11px] font-semibold text-white bg-black/60 rounded-full px-2 py-0.5">{p.isLocal ? 'Tu' : p.name}</span>
                        </li>
                    ))}
                </ul>
            )}

            {session.canPublish && status === 'connected' && (
                <div className="rounded-2xl bg-white/5 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => run(session.toggleMic)} aria-pressed={session.local.mic} className={btn(session.local.mic)} aria-label={session.local.mic ? 'Spegni il microfono' : 'Accendi il microfono'}>
                            <Icon type={session.local.mic ? 'microphone' : 'microphone-slash'} className="w-5 h-5" />
                        </button>
                        <button onClick={() => run(session.toggleCamera)} aria-pressed={session.local.camera} className={btn(session.local.camera)} aria-label={session.local.camera ? 'Spegni la fotocamera' : 'Accendi la fotocamera'}>
                            <Icon type={session.local.camera ? 'video' : 'video-slash'} className="w-5 h-5" />
                        </button>
                        {device.canShareScreen && (
                            <button onClick={() => run(() => session.toggleScreen(withAudio && device.canShareAudio))} aria-pressed={session.local.screen} className={btn(session.local.screen)} aria-label={session.local.screen ? 'Smetti di condividere lo schermo' : 'Condividi lo schermo'}>
                                <Icon type="computer" className="w-5 h-5" />
                            </button>
                        )}
                        {device.kind !== 'desktop' && session.local.camera && (
                            <button onClick={() => run(session.flipCamera)} className={btn(false)} aria-label={session.facing === 'user' ? 'Usa la fotocamera posteriore' : 'Usa la fotocamera anteriore'}>
                                <Icon type="arrow-path" className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={() => setSettings((v) => !v)} aria-expanded={settings} className="ml-auto px-3 py-2 rounded-full text-sm font-semibold text-white/90 hover:bg-white/10 inline-flex items-center gap-1.5">
                            <Icon type="settings" className="w-4 h-4" /> Dispositivi
                        </button>
                    </div>
                    <p className="text-xs text-white/70">
                        {session.local.camera || session.local.mic || session.local.screen
                            ? `In onda: ${[session.local.camera && 'fotocamera', session.local.mic && 'microfono', session.local.screen && 'schermo'].filter(Boolean).join(', ')}.`
                            : 'Niente in onda: accendi microfono e fotocamera quando sei pronto.'}
                    </p>
                    {settings && (
                        <div className="grid gap-3 sm:grid-cols-2 rounded-xl bg-white p-3">
                            <Select size="sm" label="Fotocamera" value={session.activeDevice.videoinput || ''} onChange={(id) => run(() => session.selectDevice('videoinput', id))} placeholder="Fotocamera predefinita" options={session.devices.videoinput.map((d, i) => ({ value: d.deviceId, label: d.label || `Fotocamera ${i + 1}` }))} />
                            <Select size="sm" label="Microfono" value={session.activeDevice.audioinput || ''} onChange={(id) => run(() => session.selectDevice('audioinput', id))} placeholder="Microfono predefinito" options={session.devices.audioinput.map((d, i) => ({ value: d.deviceId, label: d.label || `Microfono ${i + 1}` }))} />
                            {device.canShareAudio && (
                                <div className="sm:col-span-2">
                                    <Checkbox id="live-screen-audio" checked={withAudio} onChange={setWithAudio} label="Condividi anche l’audio dello schermo" description="Per video con suono o musica (es. acquagym). Scegli «Condividi audio» nella finestra del browser." />
                                </div>
                            )}
                        </div>
                    )}
                    {denied && <p className="text-sm text-white bg-galleggiante-700 rounded-xl px-3 py-2" role="alert">{permissionHelp(device)}</p>}
                </div>
            )}
        </div>
    );
};

/** Tempo rimasto alla fine della diretta (avviso negli ultimi 10 minuti). */
function useRemaining(endsAt?: string, onTimeUp?: () => void) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!endsAt) return;
        const t = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(t);
    }, [endsAt]);
    const left = endsAt ? new Date(endsAt).getTime() - now : null;
    const fired = useRef(false);
    useEffect(() => {
        if (left !== null && left <= 0 && !fired.current) {
            fired.current = true;
            onTimeUp?.();
        }
    }, [left, onTimeUp]);
    if (left === null) return null;
    const min = Math.max(0, Math.ceil(left / 60_000));
    if (min > 30) return null;
    return { warn: min <= 10, label: min === 0 ? 'Tempo scaduto' : `Ancora ${min} min` };
}
