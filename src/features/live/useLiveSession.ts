import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalVideoTrack, Participant, Room, Track, VideoTrack } from 'livekit-client';
import { databaseService } from '@/services/database';

/** Una persona (o OBS/Prism) collegata alla stanza video. */
export interface LiveParticipant {
    identity: string;
    name: string;
    isLocal: boolean;
    isSpeaking: boolean;
    /** Trasmissione da OBS Studio o Prism Live Studio. */
    isIngress: boolean;
    isHost: boolean;
    camera?: VideoTrack;
    screen?: VideoTrack;
    micOn: boolean;
}

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type MediaKind = 'videoinput' | 'audioinput';

export interface LiveDevices {
    videoinput: MediaDeviceInfo[];
    audioinput: MediaDeviceInfo[];
}

/** Errore comprensibile per chi usa la diretta, dai nomi degli errori del browser. */
export function mediaErrorMessage(err: unknown): { message: string; denied: boolean } {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return { message: 'Hai negato il permesso: SwimIn non può usare fotocamera, microfono o schermo.', denied: true };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { message: 'Nessuna fotocamera o microfono trovato su questo dispositivo.', denied: false };
    if (name === 'NotReadableError' || name === 'AbortError') return { message: 'Fotocamera o microfono sono già usati da un’altra app (es. Zoom, Teams, OBS): chiudila e riprova.', denied: false };
    return { message: err instanceof Error && err.message ? err.message : 'Operazione non riuscita.', denied: false };
}

const metaOf = (p: Participant): { host?: boolean; ingress?: boolean } => {
    try {
        return p.metadata ? (JSON.parse(p.metadata) as { host?: boolean; ingress?: boolean }) : {};
    } catch (err) {
        console.warn('metadata:', err);
        return {};
    }
};

/**
 * Collegamento alla stanza video di LiveKit. La libreria si carica solo quando serve
 * (non pesa sulle altre pagine). Il token lo firma la Function secondo il ruolo nella stanza.
 */
export function useLiveSession(roomId: string, enabled: boolean) {
    const roomRef = useRef<Room | null>(null);
    const lkRef = useRef<typeof import('livekit-client') | null>(null);
    const audioRef = useRef<HTMLDivElement | null>(null);
    const [status, setStatus] = useState<LiveStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [participants, setParticipants] = useState<LiveParticipant[]>([]);
    const [canPublish, setCanPublish] = useState(false);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [local, setLocal] = useState({ camera: false, mic: false, screen: false });
    const [devices, setDevices] = useState<LiveDevices>({ videoinput: [], audioinput: [] });
    const [activeDevice, setActiveDevice] = useState<Partial<Record<MediaKind, string>>>({});
    const [facing, setFacing] = useState<'user' | 'environment'>('user');
    const [attempt, setAttempt] = useState(0);

    /** Fotografia dello stato della stanza, ricalcolata a ogni evento. */
    const refresh = useCallback(() => {
        const room = roomRef.current;
        const lk = lkRef.current;
        if (!room || !lk) return;
        const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
        const video = (p: Participant, source: Track.Source) => {
            const pub = p.getTrackPublication(source);
            return pub && !pub.isMuted && pub.track ? (pub.track as VideoTrack) : undefined;
        };
        setParticipants(
            all.map((p) => {
                const meta = metaOf(p);
                return {
                    identity: p.identity,
                    name: p.name || 'Partecipante',
                    isLocal: p === room.localParticipant,
                    isSpeaking: p.isSpeaking,
                    isIngress: !!meta.ingress || p.identity.startsWith('ingress-'),
                    isHost: !!meta.host,
                    camera: video(p, lk.Track.Source.Camera),
                    screen: video(p, lk.Track.Source.ScreenShare),
                    micOn: !!p.getTrackPublication(lk.Track.Source.Microphone) && !p.getTrackPublication(lk.Track.Source.Microphone)?.isMuted,
                };
            })
        );
        const lp = room.localParticipant;
        setLocal({ camera: lp.isCameraEnabled, mic: lp.isMicrophoneEnabled, screen: lp.isScreenShareEnabled });
        setCanPublish(!!lp.permissions?.canPublish);
        setAudioBlocked(!room.canPlaybackAudio);
    }, []);

    const loadDevices = useCallback(async () => {
        const lk = lkRef.current;
        if (!lk) return;
        try {
            const [videoinput, audioinput] = await Promise.all([lk.Room.getLocalDevices('videoinput', false), lk.Room.getLocalDevices('audioinput', false)]);
            setDevices({ videoinput, audioinput });
        } catch (err) {
            console.warn('Dispositivi:', err);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let room: Room | null = null;
        setStatus('connecting');
        setError(null);
        (async () => {
            try {
                const [lk, access] = await Promise.all([import('livekit-client'), databaseService.getLiveAccess(roomId)]);
                if (cancelled) return;
                lkRef.current = lk;
                const { RoomEvent, Track } = lk;
                room = new lk.Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: lk.VideoPresets.h720.resolution } });
                roomRef.current = room;
                const update = () => refresh();
                room
                    .on(RoomEvent.ParticipantConnected, update)
                    .on(RoomEvent.ParticipantDisconnected, update)
                    .on(RoomEvent.TrackPublished, update)
                    .on(RoomEvent.TrackUnpublished, update)
                    .on(RoomEvent.TrackMuted, update)
                    .on(RoomEvent.TrackUnmuted, update)
                    .on(RoomEvent.LocalTrackPublished, update)
                    .on(RoomEvent.LocalTrackUnpublished, update)
                    .on(RoomEvent.ActiveSpeakersChanged, update)
                    .on(RoomEvent.ParticipantPermissionsChanged, update)
                    .on(RoomEvent.AudioPlaybackStatusChanged, update)
                    .on(RoomEvent.MediaDevicesChanged, () => void loadDevices())
                    .on(RoomEvent.TrackSubscribed, (track) => {
                        // L'audio di chi parla va riprodotto in elementi nascosti.
                        if (track.kind === Track.Kind.Audio && audioRef.current) audioRef.current.appendChild(track.attach());
                        update();
                    })
                    .on(RoomEvent.TrackUnsubscribed, (track) => {
                        track.detach().forEach((el) => el.remove());
                        update();
                    })
                    .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
                    .on(RoomEvent.Reconnected, () => {
                        setStatus('connected');
                        update();
                    })
                    .on(RoomEvent.Disconnected, () => {
                        if (!cancelled) setStatus('idle');
                    });
                await room.connect(access.url, access.token);
                if (cancelled) {
                    await room.disconnect();
                    return;
                }
                setStatus('connected');
                refresh();
                void loadDevices();
            } catch (err) {
                if (cancelled) return;
                console.error('Diretta video:', err);
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Collegamento al video non riuscito.');
            }
        })();
        return () => {
            cancelled = true;
            roomRef.current = null;
            void room?.disconnect();
            audioRef.current?.replaceChildren();
        };
    }, [roomId, enabled, attempt, refresh, loadDevices]);

    /** Esegue un'azione sui media locali e restituisce l'errore leggibile, se c'è. */
    const run = useCallback(
        async (fn: (room: Room) => Promise<unknown>) => {
            const room = roomRef.current;
            if (!room) return { message: 'Il video non è ancora collegato.', denied: false };
            try {
                await fn(room);
                refresh();
                void loadDevices();
                return null;
            } catch (err) {
                console.warn('Media:', err);
                refresh();
                return mediaErrorMessage(err);
            }
        },
        [refresh, loadDevices]
    );

    const toggleCamera = useCallback(() => run((r) => r.localParticipant.setCameraEnabled(!r.localParticipant.isCameraEnabled, { facingMode: facing, deviceId: activeDevice.videoinput })), [run, facing, activeDevice.videoinput]);
    const toggleMic = useCallback(() => run((r) => r.localParticipant.setMicrophoneEnabled(!r.localParticipant.isMicrophoneEnabled, { deviceId: activeDevice.audioinput, echoCancellation: true, noiseSuppression: true })), [run, activeDevice.audioinput]);
    /** Condivisione dello schermo, con l'audio della scheda o del sistema dove il browser lo permette. */
    const toggleScreen = useCallback((withAudio: boolean) => run((r) => r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled, { audio: withAudio, selfBrowserSurface: 'exclude', systemAudio: withAudio ? 'include' : 'exclude' })), [run]);

    /** Su smartphone e tablet: fotocamera anteriore o posteriore (utile per mostrare la vasca). */
    const flipCamera = useCallback(
        () =>
            run(async (r) => {
                const next = facing === 'user' ? 'environment' : 'user';
                const lk = lkRef.current;
                const track = lk ? (r.localParticipant.getTrackPublication(lk.Track.Source.Camera)?.track as LocalVideoTrack | undefined) : undefined;
                if (track) await track.restartTrack({ facingMode: next });
                setFacing(next);
            }),
        [run, facing]
    );

    const selectDevice = useCallback(
        (kind: MediaKind, deviceId: string) =>
            run(async (r) => {
                await r.switchActiveDevice(kind, deviceId);
                setActiveDevice((d) => ({ ...d, [kind]: deviceId }));
            }),
        [run],
    );

    /** I browser bloccano l'audio finché la persona non tocca la pagina. */
    const startAudio = useCallback(async () => {
        try {
            await roomRef.current?.startAudio();
        } catch (err) {
            console.warn('Audio:', err);
        }
        refresh();
    }, [refresh]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    return { status, error, participants, canPublish, audioBlocked, local, devices, activeDevice, facing, audioRef, toggleCamera, toggleMic, toggleScreen, flipCamera, selectDevice, startAudio, retry };
}

export type LiveSession = ReturnType<typeof useLiveSession>;
