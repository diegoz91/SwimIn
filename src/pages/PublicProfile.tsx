import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService, type PublicProfile as PublicData } from '@/services/database';
import { Brand } from '@/components/ui/Brand';
import { Icon } from '@/components/ui/Icon';
import { Stars } from '@/features/reviews/Stars';
import { PageLoader } from '@/components/common/PageLoader';
import { certCategoryLabel } from '@/data/swimming';
import { formatMonth } from '@/utils/dates';
import { initialsAvatar } from '@/utils/avatar';

/**
 * Scheda pubblica di un profilo (/u/:id): si apre anche senza account, da un link
 * condiviso o da un motore di ricerca. Mostra solo ciò che il server rende pubblico.
 */
const PublicProfile: React.FC = () => {
    const { id = '' } = useParams();
    const { authenticated } = useAuth();
    const [data, setData] = useState<PublicData | null>(null);
    const [error, setError] = useState<string | null>(null);
    usePageTitle(data?.name || (error ? 'Profilo non disponibile' : null));

    useEffect(() => {
        let alive = true;
        setData(null);
        setError(null);
        databaseService
            .getPublicProfile(id)
            .then((d) => alive && setData(d))
            .catch((err) => alive && setError(err instanceof Error ? err.message : 'Profilo non disponibile.'));
        return () => { alive = false; };
    }, [id]);

    const place = data ? [data.city, data.province && `(${data.province})`].filter(Boolean).join(' ') : '';

    return (
        <div className="min-h-screen bg-piastrella">
            {!authenticated && (
                <header className="bg-white border-b border-slate-200">
                    <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                        <Link to="/" aria-label="SwimIn, pagina iniziale"><Brand size="sm" /></Link>
                        <nav className="flex items-center gap-2">
                            <Link to="/login" className="px-4 py-2 rounded-full text-sm font-semibold text-abisso hover:bg-piastrella">Accedi</Link>
                            <Link to="/register" className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Iscriviti</Link>
                        </nav>
                    </div>
                </header>
            )}

            <div className={`max-w-4xl mx-auto px-4 ${authenticated ? 'pt-4' : 'py-8'}`}>
                {error ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                        <Icon type="lock-closed" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <h1 className="text-3xl font-bold text-abisso">Profilo non disponibile</h1>
                        <p className="text-slate-600 mt-2 max-w-md mx-auto">{error}</p>
                        <Link to={authenticated ? `/profile/${id}` : '/register'} className="inline-block mt-6 px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">
                            {authenticated ? 'Apri su SwimIn' : 'Iscriviti per vederlo'}
                        </Link>
                    </div>
                ) : !data ? (
                    <PageLoader />
                ) : (
                    <article className="space-y-4">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden">
                            <div className="h-36 sm:h-48 bg-gradient-to-br from-corsia-700 via-corsia-500 to-cloro-400 relative">
                                {data.cover && <img src={data.cover} alt="" className="w-full h-full object-cover" />}
                                <div className="lane-rope absolute bottom-0 inset-x-0" aria-hidden="true" />
                            </div>
                            <div className="px-6 pb-6">
                                <img
                                    src={data.avatar || initialsAvatar(data.name)}
                                    alt=""
                                    className={`-mt-12 w-24 h-24 object-cover border-4 border-white shadow-card bg-white ${data.kind === 'structure' ? 'rounded-2xl' : 'rounded-full'}`}
                                />
                                <h1 className="text-3xl sm:text-4xl font-bold text-abisso mt-3 flex items-center gap-2">
                                    {data.name}
                                    {(data.certifications || []).some((c) => c.verified) && (
                                        <span title="Brevetti verificati da SwimIn" className="inline-flex text-corsia-600"><Icon type="shield" className="w-6 h-6" /><span className="sr-only">Brevetti verificati</span></span>
                                    )}
                                </h1>
                                <p className="text-slate-700 mt-1">{data.headline}</p>
                                <p className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                    {place && <span className="inline-flex items-center gap-1.5"><Icon type="location" className="w-4 h-4" /> {place}</span>}
                                    {data.kind === 'person' && !!data.connections && <span>{data.connections === 1 ? '1 collegamento' : `${data.connections} collegamenti`}</span>}
                                    {data.kind === 'structure' && data.rating && (
                                        <span className="inline-flex items-center gap-1.5">
                                            <Stars value={data.rating.average} /> <strong className="text-abisso">{data.rating.average.toLocaleString('it-IT', { minimumFractionDigits: 1 })}</strong> ({data.rating.count})
                                        </span>
                                    )}
                                </p>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    {authenticated ? (
                                        <Link to={`/profile/${data.id}`} className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Apri il profilo completo</Link>
                                    ) : (
                                        <>
                                            <Link to="/register" className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">
                                                {data.kind === 'structure' ? 'Iscriviti per seguirla e recensirla' : `Iscriviti per collegarti con ${(data.name || '').split(' ')[0]}`}
                                            </Link>
                                            <Link to="/login" className="px-5 py-2.5 rounded-full font-semibold border border-corsia-200 text-corsia-700 hover:border-corsia-400">Ho già un account</Link>
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>

                        {data.bio && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-6">
                                <h2 className="text-2xl font-bold text-abisso mb-2">{data.kind === 'structure' ? 'La struttura' : 'Presentazione'}</h2>
                                <p className="text-slate-700 whitespace-pre-line leading-relaxed">{data.bio}</p>
                            </section>
                        )}

                        {data.kind === 'structure' && (data.poolLength || (data.services || []).length > 0 || data.address || data.website || data.phone) && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-6">
                                <h2 className="text-2xl font-bold text-abisso mb-3">In vasca</h2>
                                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                    {data.poolLength && <div><dt className="text-slate-500">Vasca</dt><dd className="font-semibold text-abisso">{data.poolLength} m{data.lanes ? `, ${data.lanes} corsie` : ''}{data.poolSetting ? `, ${data.poolSetting === 'entrambe' ? 'coperta e scoperta' : data.poolSetting}` : ''}</dd></div>}
                                    {data.address && <div><dt className="text-slate-500">Indirizzo</dt><dd className="font-semibold text-abisso">{data.address}{data.city ? `, ${data.city}` : ''}</dd></div>}
                                    {data.phone && <div><dt className="text-slate-500">Telefono</dt><dd><a href={`tel:${data.phone.replace(/\s/g, '')}`} className="font-semibold text-corsia-700 hover:underline">{data.phone}</a></dd></div>}
                                    {data.website && <div><dt className="text-slate-500">Sito</dt><dd><a href={data.website} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-corsia-700 hover:underline break-all">{data.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a></dd></div>}
                                </dl>
                                {(data.services || []).length > 0 && (
                                    <ul className="flex flex-wrap gap-2 mt-4">
                                        {(data.services || []).map((s) => <li key={s} className="text-sm bg-corsia-50 text-corsia-800 px-3 py-1 rounded-full">{s}</li>)}
                                    </ul>
                                )}
                            </section>
                        )}

                        {(data.experiences || []).length > 0 && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-6">
                                <h2 className="text-2xl font-bold text-abisso mb-3">Esperienza</h2>
                                <ul className="space-y-3">
                                    {(data.experiences || []).map((e, i) => (
                                        <li key={i} className="flex gap-3">
                                            <span className="mt-1 w-9 h-9 rounded-lg bg-corsia-50 text-corsia-700 grid place-items-center flex-shrink-0"><Icon type="briefcase" className="w-4 h-4" /></span>
                                            <span>
                                                <span className="block font-semibold text-abisso">{e.title}</span>
                                                <span className="block text-sm text-slate-600">{e.company}</span>
                                                {e.startDate && <span className="block text-xs text-slate-500">{formatMonth(e.startDate)} – {e.current || !e.endDate ? 'oggi' : formatMonth(e.endDate)}</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {(data.certifications || []).length > 0 && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-6">
                                <h2 className="text-2xl font-bold text-abisso mb-3">Brevetti validi</h2>
                                <ul className="grid sm:grid-cols-2 gap-3">
                                    {(data.certifications || []).map((c, i) => (
                                        <li key={i} className="p-4 rounded-xl border border-slate-200">
                                            <p className="font-semibold text-abisso flex items-center gap-1.5">
                                                {c.name}
                                                {c.verified && <span title="Verificato da SwimIn" className="inline-flex text-corsia-600"><Icon type="shield" className="w-4 h-4" /><span className="sr-only">Verificato</span></span>}
                                            </p>
                                            <p className="text-sm text-slate-600">{c.issuer}</p>
                                            {c.category && <span className="inline-block mt-2 text-xs font-semibold text-corsia-800 bg-corsia-50 px-2 py-0.5 rounded-md">{certCategoryLabel(c.category)}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {((data.skills || []).length > 0 || (data.languages || []).length > 0) && (
                            <section className="bg-white rounded-2xl border border-slate-200 p-6">
                                <h2 className="text-2xl font-bold text-abisso mb-3">Competenze</h2>
                                <ul className="flex flex-wrap gap-2">
                                    {(data.skills || []).map((s) => <li key={s} className="text-sm bg-piastrella text-abisso px-3 py-1 rounded-full border border-slate-200">{s}</li>)}
                                </ul>
                                {(data.languages || []).length > 0 && <p className="text-sm text-slate-600 mt-3">Lingue: {(data.languages || []).join(', ')}</p>}
                            </section>
                        )}

                        {!authenticated && (
                            <p className="text-center text-sm text-slate-500 pt-2">
                                SwimIn è il social del nuoto: istruttori, assistenti bagnanti, allenatori, piscine e chi nuota per passione.{' '}
                                <Link to="/" className="font-semibold text-corsia-700 hover:underline">Scopri di più</Link>
                            </p>
                        )}
                    </article>
                )}
            </div>
        </div>
    );
};

export default PublicProfile;
