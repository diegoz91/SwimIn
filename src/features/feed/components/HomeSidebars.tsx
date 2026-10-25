import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { avatarOf, displayNameOf, headlineOf, isEnthusiast } from '@/utils/profile';
import { initialsAvatar } from '@/utils/avatar';
import { certificationsNeedingAttention, describeExpiry, parseCertifications } from '@/utils/certifications';
import type { AuthenticatedUser, Job, LiveRoom, StructureProfile, UserProfile } from '@/types/types';
import { jobDisplayTitle } from '@/utils/jobs';
import { emitNetworkChange, useNetworkChange } from '@/utils/networkEvents';
import { PARTS, currentPart, normalizeAvailability, remainingSlotsToday } from '@/utils/availability';
import { TrendsCard } from './TrendsCard';
import { UpcomingEventsCard } from '@/features/events/UpcomingEventsCard';
import { useBlocks } from '@/context/BlocksContext';

const Panel: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden ${className}`}>
        {title && <h2 className="px-4 pt-4 pb-1 text-lg font-bold text-abisso">{title}</h2>}
        {children}
    </section>
);

const RowLink: React.FC<{ to: string; label: string }> = ({ to, label }) => (
    <Link to={to} className="flex justify-between items-center px-4 py-2.5 hover:bg-piastrella">
        <span className="text-slate-500">{label}</span>
        <Icon type="chevron-right" className="w-4 h-4 text-corsia-700" />
    </Link>
);

/** Colonna sinistra: la tua scheda, con collegamenti e stato dei brevetti. */
export const HomeProfileCard: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
    const isProfessional = user.userType === 'professional';
    // Brevetti e competenze contano per chi lavora in vasca, non per gli appassionati.
    const isWorker = isProfessional && !isEnthusiast(user);
    const certs = isProfessional ? parseCertifications((user as UserProfile).certificationsList) : [];
    const attention = isProfessional ? certificationsNeedingAttention((user as UserProfile).certificationsList) : [];
    const skills = isProfessional ? (user as UserProfile).skills || [] : [];

    return (
        <Panel>
            <div className="h-16 bg-gradient-to-br from-corsia-700 to-cloro-500 relative">
                {user.cover && <img src={user.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
            <div className="relative px-4 pb-4 -mt-8">
                <Link to="/profile" tabIndex={-1} aria-hidden="true" className="block w-fit rounded-full">
                    <img src={avatarOf(user)} alt="" className="w-16 h-16 rounded-full object-cover ring-4 ring-white bg-white" />
                </Link>
                <Link to="/profile" className="py-1 block mt-2 font-semibold text-abisso hover:underline leading-tight">{displayNameOf(user)}</Link>
                <p className="text-sm text-slate-500 mt-0.5 leading-snug">{headlineOf(user)}</p>
                {user.city && (
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Icon type="location" className="w-3.5 h-3.5" /> {user.city}
                    </p>
                )}
            </div>
            <div className="border-t border-slate-100 text-sm">
                <Link to="/network" className="flex justify-between px-4 py-2.5 hover:bg-piastrella">
                    <span className="text-slate-500">Collegamenti</span>
                    <span className="font-semibold text-corsia-700">{user.connections?.length || 0}</span>
                </Link>
                <Link to="/gruppi" className="flex justify-between px-4 py-2.5 hover:bg-piastrella">
                    <span className="text-slate-500">Gruppi</span>
                    <span className="font-semibold text-corsia-700 flex items-center"><Icon type="chevron-right" className="w-4 h-4" /></span>
                </Link>
                {isWorker ? (
                    <>
                        <Link to="/profile" className="flex justify-between px-4 py-2.5 hover:bg-piastrella">
                            <span className="text-slate-500">Brevetti</span>
                            <span className={`font-semibold ${attention.length ? 'text-galleggiante-700' : 'text-corsia-700'}`}>
                                {certs.length}{attention.length ? ` · ${attention.length} da rinnovare` : ''}
                            </span>
                        </Link>
                        <Link to="/profile" className="flex justify-between px-4 py-2.5 hover:bg-piastrella">
                            <span className="text-slate-500">Competenze</span>
                            <span className="font-semibold text-corsia-700">{skills.length}</span>
                        </Link>
                    </>
                ) : isProfessional ? (
                    <>
                        <RowLink to="/eventi" label="Eventi e corsi" />
                        <RowLink to="/strutture" label="Piscine vicino a te" />
                    </>
                ) : (
                    <>
                        <RowLink to="/jobs" label="Le tue offerte" />
                        <RowLink to="/talenti" label="Cerca personale" />
                    </>
                )}
                <RowLink to="/salvati" label="Elementi salvati" />
            </div>
            {isProfessional && (user as UserProfile).availableForEmergencies && (
                <p className="border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-galleggiante-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-galleggiante" aria-hidden="true" /> Disponibile per sostituzioni urgenti
                </p>
            )}
        </Panel>
    );
};

/** Avviso in cima al feed per brevetti scaduti o in scadenza. */
export const CertificationAlert: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
    if (user.userType !== 'professional') return null;
    const [first, ...rest] = certificationsNeedingAttention((user as UserProfile).certificationsList);
    if (!first) return null;
    const expired = first.state === 'expired';
    return (
        <Link
            to="/profile"
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${expired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
        >
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${expired ? 'bg-red-100 text-galleggiante-700' : 'bg-amber-100 text-amber-700'}`}>
                <Icon type="certificate" className="w-5 h-5" />
            </span>
            <span className="flex-1 min-w-0">
                <span className="block font-semibold text-abisso truncate">{first.name}: {describeExpiry(first).toLowerCase()}</span>
                <span className="block text-sm text-slate-600">
                    {expired ? 'Rinnovalo prima di accettare nuovi turni.' : 'Prenota il corso di rinnovo per tempo.'}
                    {rest.length > 0 && ` Altri ${rest.length} da controllare.`}
                </span>
            </span>
            <Icon type="chevron-right" className="w-5 h-5 text-slate-400 flex-shrink-0" />
        </Link>
    );
};

/**
 * Per chi gestisce una struttura: professionisti liberi nelle prossime ore di oggi,
 * dalla stessa provincia quando possibile. Pensato per coprire un turno all'ultimo.
 */
const AvailableTodayPanel: React.FC<{ province?: string }> = ({ province }) => {
    const [people, setPeople] = useState<UserProfile[] | null>(null);
    const slots = remainingSlotsToday();
    const part = PARTS.find((p) => p.key === currentPart())!;

    useEffect(() => {
        databaseService
            .getAvailableProfessionals(slots, province)
            .then(setPeople)
            .catch((e) => {
                console.warn('Disponibili oggi:', e);
                setPeople([]);
            });
    }, [province]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!people || people.length === 0) return null;
    return (
        <Panel title="Liberi oggi">
            <p className="px-4 text-xs text-slate-500 -mt-0.5 mb-1">Hanno indicato disponibilità da {part.label.toLowerCase()} in poi.</p>
            <ul className="pb-2">
                {people.map((p) => {
                    const id = p.userId || p.$id;
                    const todayParts = normalizeAvailability(p.availability).filter((s) => slots.includes(s)).map((s) => s.split('-')[1]);
                    return (
                        <li key={id}>
                            <Link to={`/profile/${id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-piastrella">
                                <span className="relative flex-shrink-0">
                                    <img src={avatarOf(p)} alt="" className="w-10 h-10 rounded-full object-cover" />
                                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-cloro-500 ring-2 ring-white" aria-hidden="true" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-abisso truncate">{displayNameOf(p)}</span>
                                    <span className="block text-xs text-slate-500 truncate">
                                        {[headlineOf(p), todayParts.join(', ')].filter(Boolean).join(' · ')}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
};

/** Colonna destra: offerte recenti, persone da conoscere, dirette attive. */
export const HomeRightRail: React.FC<{ user: AuthenticatedUser; jobs: Job[]; isLoadingJobs: boolean }> = ({ user, jobs, isLoadingJobs }) => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [suggestions, setSuggestions] = useState<(UserProfile | StructureProfile)[]>([]);
    const blocks = useBlocks();
    const [requested, setRequested] = useState<string[]>([]);
    const [rooms, setRooms] = useState<LiveRoom[]>([]);

    const loadSuggestions = () =>
        databaseService
            .getNetworkSuggestions(user.$id, user.connections || [])
            .then((list) => setSuggestions(list.slice(0, 3)))
            .catch((e) => console.warn('Suggerimenti non disponibili:', e));

    useEffect(() => {
        loadSuggestions();
    }, [user.$id, (user.connections || []).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        databaseService.getActiveLiveRooms().then((r) => setRooms(r.slice(0, 2))).catch((e) => console.warn('Live non disponibili:', e));
    }, []);

    // Collegamenti cambiati altrove: chi è appena diventato un collegamento esce subito dai suggerimenti.
    useNetworkChange((change) => {
        if (change.userId) setSuggestions((prev) => prev.filter((p) => (p.userId || p.$id) !== change.userId));
        if (change.type !== 'sent') loadSuggestions();
    });

    const connect = async (id: string) => {
        setRequested((r) => [...r, id]);
        try {
            await databaseService.sendConnectionRequest(user.$id, id);
            showToast('Richiesta di collegamento inviata.', 'success');
            emitNetworkChange({ type: 'sent', userId: id });
        } catch (error) {
            setRequested((r) => r.filter((x) => x !== id));
            showToast(error instanceof Error ? error.message : 'Richiesta non inviata.', 'error');
        }
    };

    return (
        <div className="space-y-4">
            {(user.userType === 'structure' || ((user as UserProfile).managedFacilities || []).length > 0) && <AvailableTodayPanel province={user.province} />}
            <UpcomingEventsCard province={user.province} userId={user.$id} />
            <TrendsCard />
            {rooms.length > 0 && (
                <Panel title="In diretta ora">
                    <ul className="pb-2">
                        {rooms.map((r) => (
                            <li key={r.$id}>
                                <Link to="/live" className="flex items-start gap-3 px-4 py-2.5 hover:bg-piastrella">
                                    <span className="mt-1.5 w-2.5 h-2.5 rounded-full bg-galleggiante flex-shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-abisso line-clamp-2">{r.title}</span>
                                        <span className="block text-xs text-slate-500">{(r.speakers?.length || 0) + (r.listeners?.length || 0)} partecipanti</span>
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}

            <Panel title="Offerte per te">
                {isLoadingJobs ? (
                    <div className="px-4 py-6 space-y-3" aria-hidden="true">
                        {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse" />)}
                    </div>
                ) : jobs.length === 0 ? (
                    <p className="px-4 pb-4 pt-1 text-sm text-slate-500">Nessuna offerta attiva al momento.</p>
                ) : (
                    <ul className="pb-1">
                        {jobs.map((job) => (
                            <li key={job.$id}>
                                <button
                                    onClick={() => navigate('/jobs', { state: { selectedJobId: job.$id } })}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-piastrella"
                                >
                                    <img src={job.facilityLogo || initialsAvatar(job.structureName)} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-100 flex-shrink-0" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold text-abisso truncate">
                                            {job.isSOS && <span className="text-galleggiante-700">SOS </span>}
                                            {jobDisplayTitle(job)}
                                        </span>
                                        <span className="block text-xs text-slate-500 truncate">{[job.structureName, job.city].filter(Boolean).join(', ')}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <Link to="/jobs" className="block text-center text-sm font-semibold text-corsia-700 hover:bg-piastrella py-3 border-t border-slate-100">
                    Vai alla bacheca lavoro
                </Link>
            </Panel>

            {suggestions.length > 0 && (
                <Panel title="Potresti conoscere">
                    <ul className="pb-2">
                        {suggestions.filter((p) => !blocks.isHidden(p.userId || p.$id)).map((p) => {
                            const id = p.userId || p.$id;
                            const sent = requested.includes(id);
                            return (
                                <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                                    <Link to={`/profile/${id}`} tabIndex={-1} aria-hidden="true" className="flex-shrink-0">
                                        <img src={avatarOf(p)} alt="" className="w-10 h-10 rounded-full object-cover" />
                                    </Link>
                                    <Link to={`/profile/${id}`} className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-abisso truncate">{displayNameOf(p)}</span>
                                        <span className="block text-xs text-slate-500 truncate">{headlineOf(p)}</span>
                                    </Link>
                                    <button
                                        onClick={() => connect(id)}
                                        disabled={sent}
                                        aria-label={sent ? 'Richiesta inviata' : `Collegati con ${displayNameOf(p)}`}
                                        className="flex-shrink-0 w-9 h-9 rounded-full border border-corsia-200 text-corsia-700 hover:bg-corsia-50 flex items-center justify-center disabled:border-slate-200 disabled:text-slate-400"
                                    >
                                        <Icon type={sent ? 'check' : 'plus'} className="w-4 h-4" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <Link to="/network" className="block text-center text-sm font-semibold text-corsia-700 hover:bg-piastrella py-3 border-t border-slate-100">
                        Espandi la tua rete
                    </Link>
                </Panel>
            )}

        </div>
    );
};
