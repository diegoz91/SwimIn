import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { ProvinceSelect, Select } from '@/components/form/Pickers';
import { Checkbox } from '@/components/form/Field';
import { Icon } from '@/components/ui/Icon';
import { ConnectButton } from '@/components/common/ConnectButton';
import { useBlocks } from '@/context/BlocksContext';
import { CERT_CATEGORIES, certCategoryKey, certCategoryLabel } from '@/data/swimming';
import { provinceName } from '@/data/italy';
import { DAYS, PARTS, slotKey, summarizeAvailability } from '@/utils/availability';
import { certificationStatus, parseCertifications } from '@/utils/certifications';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import type { UserProfile } from '@/types/types';
import { isPremium } from '@/utils/premium';
import { requestPremium } from '@/services/premiumPrompt';
import { PremiumBadge } from '@/features/premium/PremiumBadge';

type Candidate = {
    profile: UserProfile;
    /** Categorie di brevetti validi (non scaduti). */
    validCategories: string[];
    verified: number;
    expiredOnly: boolean;
    score: number;
};

const SLOT_OPTIONS = DAYS.flatMap((d) => PARTS.map((p) => ({ value: slotKey(d.key, p.key), label: `${d.label} ${p.label.toLowerCase()}`, hint: p.hours })));

const toCandidate = (p: UserProfile): Candidate => {
    const certs = parseCertifications(p.certificationsList).map((c) => certificationStatus(c));
    const valid = certs.filter((c) => c.state !== 'expired');
    const validCategories = [...new Set(valid.map((c) => certCategoryKey(c.category)).filter(Boolean))];
    const verified = valid.filter((c) => c.verified).length;
    const filled = [p.title, p.bio, p.city, (p.availability || []).length, (p.experienceList || []).length, valid.length].filter(Boolean).length;
    return {
        profile: p,
        validCategories,
        verified,
        expiredOnly: certs.length > 0 && valid.length === 0,
        // Prima chi ha brevetti verificati, poi profili più completi, poi chi è online.
        score: verified * 10 + valid.length * 3 + filled + (p.isOnline ? 2 : 0) + (p.availableForEmergencies ? 2 : 0) + (isPremium(p) ? 5 : 0),
    };
};

/** Ricerca di personale per strutture e responsabili: brevetti validi, zona, disponibilità. */
const Talent: React.FC = () => {
    usePageTitle('Cerca personale');
    const { user } = useAuth();
    const navigate = useNavigate();
    const blocks = useBlocks();
    const [province, setProvince] = useState((user?.province || '').toUpperCase());
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [slot, setSlot] = useState('');
    const [emergencies, setEmergencies] = useState(false);
    const [verifiedOnly, setVerifiedOnly] = useState(false);
    const [rows, setRows] = useState<Candidate[] | null>(null);
    // Filtri avanzati (disponibilità, sostituzioni, verificati): inclusi in Premium.
    const premium = isPremium(user);
    const gated = <T,>(setter: (v: T) => void) => (v: T) => {
        if (premium) return setter(v);
        requestPremium('La ricerca per disponibilità, sostituzioni urgenti e brevetti verificati è inclusa in SwimIn Premium.');
    };

    useEffect(() => {
        let cancelled = false;
        setRows(null);
        const t = window.setTimeout(() => {
            databaseService
                .searchTalent({ province, search, slot, emergencies })
                .then((list) => !cancelled && setRows(list.filter((p) => (p.userId || p.$id) !== user?.$id).map(toCandidate)))
                .catch((err) => {
                    console.error('Ricerca personale:', err);
                    if (!cancelled) setRows([]);
                });
        }, search ? 350 : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [province, search, slot, emergencies, user?.$id]);

    const shown = useMemo(
        () =>
            (rows || [])
                .filter((c) => !blocks.isHidden(c.profile.userId || c.profile.$id))
                .filter((c) => !category || c.validCategories.includes(category))
                .filter((c) => !verifiedOnly || c.verified > 0)
                .sort((a, b) => b.score - a.score),
        [rows, category, verifiedOnly, blocks]
    );

    const message = (id: string) => navigate('/messages', { state: { startChatWithUserId: id } });

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <h1 className="text-4xl font-bold text-abisso leading-none">Cerca personale</h1>
            <p className="text-slate-500 mt-2 mb-5">Istruttori, assistenti bagnanti e allenatori della tua zona, con brevetti validi e disponibilità.</p>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 space-y-3 mb-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative">
                        <Icon type="search" className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Qualifica, nome o comune"
                            aria-label="Cerca per qualifica, nome o comune"
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-none"
                        />
                    </div>
                    <ProvinceSelect value={province} onChange={setProvince} />
                    <Select label="Brevetto" value={category} onChange={setCategory} placeholder="Qualsiasi brevetto" clearLabel="Qualsiasi brevetto" options={CERT_CATEGORIES.filter((c) => c.value !== 'altro').map((c) => ({ value: c.value, label: c.label }))} />
                    <Select label="Disponibile" value={slot} onChange={gated(setSlot)} placeholder="Qualsiasi momento" clearLabel="Qualsiasi momento" options={SLOT_OPTIONS} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Checkbox id="t-emergencies" checked={emergencies} onChange={gated(setEmergencies)} label="Disponibile per sostituzioni urgenti" />
                    <Checkbox id="t-verified" checked={verifiedOnly} onChange={gated(setVerifiedOnly)} label="Solo con brevetti verificati" />
                    {!premium && <span className="inline-flex items-center gap-1.5 text-xs text-oro-700 font-semibold"><PremiumBadge /> Filtri avanzati con Premium</span>}
                </div>
            </div>
            {province && (
                <button onClick={() => setProvince('')} className="mb-4 text-sm font-semibold text-corsia-700 hover:underline">
                    Cerca in tutta Italia invece che in provincia di {provinceName(province) || province}
                </button>
            )}

            {rows === null ? (
                <div className="space-y-3" aria-hidden="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />)}
                </div>
            ) : shown.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300 px-4">
                    <Icon type="users" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Nessun professionista con questi filtri.</p>
                    <p className="text-sm text-slate-500 mt-1">Allarga la zona o togli un filtro. Per un turno scoperto puoi anche lanciare un SOS dalla bacheca lavoro.</p>
                    <Link to="/jobs" className="inline-block mt-4 text-sm font-semibold text-corsia-700 hover:underline">Vai alla bacheca lavoro</Link>
                </div>
            ) : (
                <>
                    <p className="text-sm text-slate-500 mb-3" aria-live="polite">{shown.length === 1 ? '1 professionista' : `${shown.length} professionisti`}</p>
                    <ul className="space-y-3">
                        {shown.map(({ profile: p, validCategories, verified, expiredOnly }) => {
                            const id = p.userId || p.$id;
                            const availability = summarizeAvailability(p.availability);
                            return (
                                <li key={id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-4 flex flex-col sm:flex-row gap-4">
                                    <Link to={`/profile/${id}`} className="flex gap-4 min-w-0 flex-1 group">
                                        <span className="relative flex-shrink-0">
                                            <img src={avatarOf(p)} alt="" className="w-16 h-16 rounded-full object-cover border border-slate-100" />
                                            {p.isOnline && <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" aria-label="Online" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 font-semibold text-abisso group-hover:text-corsia-700">
                                                <span className="truncate">{displayNameOf(p)}</span>
                                                {isPremium(p) && <PremiumBadge />}
                                                {verified > 0 && (
                                                    <span title={verified === 1 ? '1 brevetto verificato' : `${verified} brevetti verificati`} className="inline-flex text-corsia-600 flex-shrink-0">
                                                        <Icon type="shield" className="w-4 h-4" />
                                                        <span className="sr-only">Brevetti verificati</span>
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block text-sm text-slate-600 truncate">{headlineOf(p)}</span>
                                            {p.city && <span className="block text-xs text-slate-500 mt-0.5">{p.city}{p.province ? ` (${p.province})` : ''}</span>}
                                            {availability && <span className="block text-xs text-slate-500 mt-0.5"><Icon type="calendar" className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{availability}</span>}
                                            <span className="flex flex-wrap gap-1.5 mt-2">
                                                {validCategories.map((c) => (
                                                    <span key={c} className="text-xs font-semibold text-corsia-800 bg-corsia-50 px-2 py-0.5 rounded-md">{certCategoryLabel(c)}</span>
                                                ))}
                                                {expiredOnly && <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">Brevetti scaduti</span>}
                                                {p.availableForEmergencies && <span className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">Sostituzioni urgenti</span>}
                                            </span>
                                        </span>
                                    </Link>
                                    <div className="flex sm:flex-col gap-2 sm:w-40 flex-shrink-0">
                                        <ConnectButton profileId={id} className="flex-1 sm:flex-none" />
                                        <button type="button" onClick={() => message(id)} className="flex-1 sm:flex-none px-4 py-2 rounded-full text-sm font-semibold border border-corsia-200 text-corsia-700 hover:border-corsia-400">
                                            Messaggio
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
};

export default Talent;
