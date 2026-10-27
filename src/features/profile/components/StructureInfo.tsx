import React from 'react';
import { Link } from 'react-router-dom';
import type { Job, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { POOL_SETTINGS, jobRoleLabel } from '@/data/swimming';
import { DAYS, formatDay, hasHours, openStatus, weekdayIndex } from '@/utils/openingHours';
import { jobDisplayTitle } from '@/utils/jobs';
import { formatDate } from '@/utils/dates';

type AnyStructure = StructureProfile;
const isProfile = (f: AnyStructure): f is StructureProfile => !!f;

/** Indirizzo completo, per le indicazioni stradali. */
export const fullAddress = (f: AnyStructure) => {
    const p = isProfile(f) ? f : null;
    return [p?.address, [p?.postalCode, f.city].filter(Boolean).join(' '), f.province?.toUpperCase()].filter(Boolean).join(', ');
};

/** Stato "aperto ora" pronto da mostrare (null se gli orari non ci sono). */
export const openStatusOf = (f: AnyStructure) => (isProfile(f) ? openStatus(f.openingHours) : null);

interface Props {
    facility: AnyStructure;
    isAdmin: boolean;
    openJobs: Job[];
    onEdit: () => void;
    onShowJobs: () => void;
    reviews: React.ReactNode;
}

/**
 * Scheda Informazioni della pagina di una struttura: chi siamo, impianto e attività,
 * posizioni aperte, recensioni; a lato contatti, indicazioni, orari e staff.
 */
export const StructureInfo: React.FC<Props> = ({ facility, isAdmin, openJobs, onEdit, onShowJobs, reviews }) => {
    const p = isProfile(facility) ? facility : null;
    const address = fullAddress(facility);
    const status = openStatusOf(facility);
    const today = weekdayIndex(new Date());
    const facts = p
        ? ([
              p.poolLength ? { label: 'Vasca principale', value: `${p.poolLength} m` } : null,
              p.lanes ? { label: 'Corsie', value: String(p.lanes) } : null,
              p.poolSetting ? { label: 'Vasche', value: POOL_SETTINGS.find((x) => x.value === p.poolSetting)?.label || '' } : null,
          ].filter(Boolean) as { label: string; value: string }[])
        : [];
    const services = p?.services || [];
    const staffCount = (facility.staff || []).length;

    // Pagina da completare: cosa manca, per chi la gestisce.
    const missing = isAdmin
        ? [
              !facility.logo && 'il logo',
              !facility.cover && 'la copertina',
              !facility.bio && 'la presentazione',
              p && !hasHours(p.openingHours) && 'gli orari',
              p && !facts.length && 'i dati dell’impianto',
              p && !services.length && 'le attività',
              p && !p.address && 'l’indirizzo',
          ].filter(Boolean) as string[]
        : [];

    const editBtn = (label = 'Modifica') =>
        isAdmin ? (
            <button onClick={onEdit} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline inline-flex items-center gap-1">
                <Icon type="pencil" className="w-4 h-4" /> {label}
            </button>
        ) : null;

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
            <div className="space-y-4 min-w-0">
                {missing.length > 0 && (
                    <section className="rounded-3xl border border-corsia-200 bg-corsia-50 p-5" aria-labelledby="complete-title">
                        <h2 id="complete-title" className="text-xl font-bold text-abisso">Completa la pagina</h2>
                        <p className="text-sm text-slate-700 mt-1">Le pagine complete ricevono più candidature e più visite. Mancano: {missing.join(', ')}.</p>
                        <button onClick={onEdit} className="mt-3 px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Completa ora</button>
                    </section>
                )}

                <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6" aria-labelledby="about-title">
                    <div className="flex items-baseline justify-between gap-3">
                        <h2 id="about-title" className="text-2xl font-bold text-abisso">Chi siamo</h2>
                        {editBtn()}
                    </div>
                    <p className={`mt-2 leading-relaxed whitespace-pre-wrap ${facility.bio ? 'text-slate-700' : 'text-slate-500'}`}>
                        {facility.bio || (isAdmin ? 'Racconta la struttura: vasche, corsi, ambiente di lavoro, cosa offrite allo staff.' : 'La struttura non ha ancora scritto una presentazione.')}
                    </p>
                </section>

                {p && (facts.length > 0 || services.length > 0 || isAdmin) && (
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6" aria-labelledby="pool-title">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 id="pool-title" className="text-2xl font-bold text-abisso">L’impianto</h2>
                            {editBtn()}
                        </div>
                        {facts.length > 0 && (
                            <dl className="mt-4 grid grid-cols-3 gap-3">
                                {facts.map((f) => (
                                    <div key={f.label} className="rounded-2xl bg-piastrella px-3 sm:px-4 py-3 min-w-0">
                                        <dt className="text-xs text-slate-500">{f.label}</dt>
                                        <dd className="font-display text-2xl font-bold text-abisso leading-tight">{f.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                        {services.length > 0 && (
                            <>
                                <h3 className="mt-5 text-sm font-semibold text-abisso">Attività</h3>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {services.map((s) => <li key={s} className="text-sm font-semibold text-corsia-800 bg-corsia-50 border border-corsia-100 px-3 py-1 rounded-full">{s}</li>)}
                                </ul>
                            </>
                        )}
                        {!facts.length && !services.length && <p className="mt-2 text-slate-500 text-sm">Indica vasca, corsie e attività: chi si candida capisce subito dove andrà a lavorare.</p>}
                    </section>
                )}

                {openJobs.length > 0 && (
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6" aria-labelledby="open-jobs-title">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 id="open-jobs-title" className="text-2xl font-bold text-abisso">Cerchiamo</h2>
                            {openJobs.length > 3 && <button onClick={onShowJobs} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Tutte ({openJobs.length})</button>}
                        </div>
                        <ul className="mt-3 divide-y divide-slate-100">
                            {openJobs.slice(0, 3).map((j) => (
                                <li key={j.$id}>
                                    <Link to={`/jobs/${j.$id}`} className="flex items-center gap-3 py-3 group">
                                        <span className={`w-10 h-10 rounded-xl grid place-items-center flex-shrink-0 ${j.isSOS ? 'bg-red-50 text-galleggiante-700' : 'bg-corsia-50 text-corsia-700'}`} aria-hidden="true">
                                            <Icon type={j.isSOS ? 'alert-triangle' : 'briefcase'} className="w-5 h-5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-semibold text-abisso group-hover:underline truncate">{jobDisplayTitle(j)}</span>
                                            <span className="block text-sm text-slate-500 truncate">{j.isSOS ? `Sostituzione urgente · ${formatDate(j.sosDate, 'weekday')}` : [jobRoleLabel(j.role), j.city].filter(Boolean).join(' · ')}</span>
                                        </span>
                                        <Icon type="chevron-right" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {reviews}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 min-w-0">
                <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5" aria-labelledby="contacts-title">
                    <h2 id="contacts-title" className="text-xl font-bold text-abisso">Contatti</h2>
                    <ul className="mt-3 space-y-3 text-sm">
                        {address && (
                            <li className="flex gap-3">
                                <Icon type="location" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <span className="min-w-0">
                                    <span className="block text-slate-800">{address}</span>
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="py-1 -my-1 inline-block font-semibold text-corsia-700 hover:underline"
                                    >
                                        Indicazioni stradali
                                    </a>
                                </span>
                            </li>
                        )}
                        {facility.phone && (
                            <li className="flex gap-3">
                                <Icon type="phone" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <a href={`tel:${facility.phone.replace(/\s/g, '')}`} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">{facility.phone}</a>
                            </li>
                        )}
                        {facility.website && (
                            <li className="flex gap-3 min-w-0">
                                <Icon type="globe" className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <a href={facility.website} target="_blank" rel="noopener noreferrer nofollow" className="py-1 -my-1 font-semibold text-corsia-700 hover:underline break-all">
                                    {facility.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                                </a>
                            </li>
                        )}
                        {!address && !facility.phone && !facility.website && (
                            <li className="text-slate-500">{isAdmin ? 'Aggiungi indirizzo, telefono e sito.' : 'Contatti non indicati: scrivi un messaggio alla struttura.'}</li>
                        )}
                    </ul>
                    {isAdmin && <div className="mt-3">{editBtn('Modifica contatti')}</div>}
                </section>

                {p && (hasHours(p.openingHours) || isAdmin) && (
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5" aria-labelledby="hours-title">
                        <div className="flex items-baseline justify-between gap-3">
                            <h2 id="hours-title" className="text-xl font-bold text-abisso">Orari</h2>
                            {status && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.open ? 'bg-cloro-100 text-cloro-800' : 'bg-slate-100 text-slate-600'}`}>{status.open ? 'Aperto ora' : 'Chiuso ora'}</span>}
                        </div>
                        {status && <p className="mt-1 text-sm text-slate-600">{status.label.replace(/^(Aperto|Chiuso) · /, '').replace(/^./, (c) => c.toUpperCase())}</p>}
                        {hasHours(p.openingHours) ? (
                            <dl className="mt-3 space-y-1.5 text-sm">
                                {DAYS.map((d, i) => (
                                    <div key={d} className={`flex justify-between gap-3 ${i === today ? 'font-semibold text-abisso' : 'text-slate-700'}`}>
                                        <dt>{d}</dt>
                                        <dd className="text-right">{formatDay(p.openingHours![i]) || <span className="text-slate-400">—</span>}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : (
                            <p className="mt-2 text-sm text-slate-500">Aggiungi gli orari: sulla pagina compare se siete aperti adesso.</p>
                        )}
                        {isAdmin && <div className="mt-3">{editBtn('Modifica orari')}</div>}
                    </section>
                )}

                {staffCount > 0 && (
                    <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 flex items-center gap-3" aria-label="Staff">
                        <span className="w-10 h-10 rounded-full bg-cloro-50 text-cloro-800 grid place-items-center flex-shrink-0" aria-hidden="true"><Icon type="users" className="w-5 h-5" /></span>
                        <p className="text-sm text-slate-700"><span className="font-semibold text-abisso">{staffCount === 1 ? '1 persona' : `${staffCount} persone`}</span> nello staff su SwimIn</p>
                    </section>
                )}
            </aside>
        </div>
    );
};
