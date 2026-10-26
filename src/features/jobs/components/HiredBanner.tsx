import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { databaseService, type MyApplication } from '@/services/database';
import { getPrefs, patchPrefs } from '@/services/prefs';
import type { AuthenticatedUser } from '@/types/types';

const LOCAL_KEY = 'swimin:hired-seen';
const LEGACY_KEY = 'dismissed_hired_banners';
/** Oltre questo periodo un'assunzione non è più una novità da festeggiare. */
const FRESH_DAYS = 30;

const readLocal = (): string[] => {
    try {
        return [...JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'), ...JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')];
    } catch {
        return [];
    }
};
const writeLocal = (ids: string[]) => {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(ids.slice(-100)));
    } catch (err) {
        console.warn('Memoria locale non disponibile:', err);
    }
};

/**
 * "Sei stato assunto": compare una sola volta per ogni assunzione. Appena mostrato viene segnato
 * come visto nelle preferenze dell'account (vale su tutti i dispositivi), quindi alla visita
 * successiva non occupa più spazio nella home: le strutture restano raggiungibili da "Lavori presso".
 */
export const HiredBanner: React.FC<{ user: AuthenticatedUser; onVisibleChange?: (visible: boolean) => void }> = ({ user, onVisibleChange }) => {
    const [apps, setApps] = useState<MyApplication[]>([]);

    useEffect(() => {
        if (user.userType !== 'professional') return;
        let alive = true;
        void (async () => {
            try {
                const [mine, prefs] = await Promise.all([databaseService.getMyApplications(user.$id), getPrefs()]);
                const seen = new Set([...(prefs.hiredSeen || []), ...readLocal()]);
                const since = Date.now() - FRESH_DAYS * 86_400_000;
                const fresh = mine.filter((a) => a.status === 'hired' && !seen.has(a.$id) && new Date(a.$updatedAt).getTime() > since);
                if (!alive || !fresh.length) return;
                setApps(fresh);
                const all = [...seen, ...fresh.map((a) => a.$id)].slice(-100);
                writeLocal(all);
                patchPrefs({ hiredSeen: all }).catch((err) => console.warn('Assunzione vista:', err));
            } catch (err) {
                console.warn('Assunzioni:', err);
            }
        })();
        return () => { alive = false; };
    }, [user.$id, user.userType]);

    useEffect(() => { onVisibleChange?.(apps.length > 0); }, [apps.length]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!apps.length) return null;
    return (
        <div className="flex flex-col gap-3">
            {apps.map((app) => (
                <section key={app.$id} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-cloro-700 to-corsia-700 text-white p-5 shadow-card animate-in zoom-in-95 duration-300" aria-labelledby={`hired-${app.$id}`}>
                    <Icon type="sparkles" className="absolute -right-6 -top-6 w-32 h-32 opacity-10" />
                    <button type="button" onClick={() => setApps((list) => list.filter((a) => a.$id !== app.$id))} aria-label="Chiudi" className="absolute top-3 right-3 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/15 outline-none focus-visible:ring-2 focus-visible:ring-white">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                    <div className="relative flex items-start gap-4 pr-8">
                        <span className="hidden sm:grid w-11 h-11 rounded-xl bg-white/15 border border-white/25 place-items-center flex-shrink-0" aria-hidden="true">
                            <Icon type="check-double" className="w-6 h-6" />
                        </span>
                        <div className="min-w-0">
                            <h2 id={`hired-${app.$id}`} className="text-2xl font-bold leading-tight">Sei stato assunto</h2>
                            <p className="mt-1 text-white/90">
                                <strong>{app.job?.structureName || 'La struttura'}</strong> ti ha scelto{app.job?.title ? <> come <em>{app.job.title}</em></> : null}. Da ora la trovi in “Lavori presso” e nel calendario dei turni.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {app.job?.structureId && (
                                    <Link to={`/profile/${app.job.structureId}?area=staff`} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-abisso text-sm font-semibold hover:bg-piastrella">
                                        <Icon type="building" className="w-4 h-4" /> Entra nell’area staff
                                    </Link>
                                )}
                                <Link to="/turni" className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/50 text-white text-sm font-semibold hover:bg-white/10">
                                    <Icon type="calendar" className="w-4 h-4" /> I miei turni
                                </Link>
                            </div>
                        </div>
                    </div>
                </section>
            ))}
        </div>
    );
};
