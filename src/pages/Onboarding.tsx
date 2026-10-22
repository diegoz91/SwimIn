import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService } from '@/services/database';
import { Brand } from '@/components/ui/Brand';
import { Icon } from '@/components/ui/Icon';
import { ImageUploadButton } from '@/components/ui/ImageUploadButton';
import { SUGGESTED_SKILLS } from '@/features/profile/components/SkillsSection';
import { avatarOf } from '@/utils/profile';
import type { Certification, StructureProfile, UserProfile } from '@/types/types';

const ROLES = ['Istruttore di nuoto', 'Assistente bagnanti', 'Allenatore', 'Istruttore di acquafitness', 'Coordinatore scuola nuoto', 'Direttore tecnico', 'Studente / in formazione'];
const STRUCTURE_TYPES = ['Piscina comunale', 'Centro sportivo', 'Società sportiva', 'Stabilimento balneare', 'Parco acquatico', 'Hotel / Spa'];

/** Brevetti più diffusi, per l'inserimento rapido. */
const COMMON_CERTS: Omit<Certification, 'expiry'>[] = [
    { name: 'Brevetto Assistente Bagnanti', issuer: 'Società Nazionale di Salvamento', category: 'salvamento' },
    { name: 'Brevetto Assistente Bagnanti', issuer: 'FIN – Sezione Salvamento', category: 'salvamento' },
    { name: 'Istruttore di nuoto 1° livello', issuer: 'FIN – Federazione Italiana Nuoto', category: 'istruzione' },
    { name: 'Istruttore di nuoto 2° livello', issuer: 'FIN – Federazione Italiana Nuoto', category: 'istruzione' },
    { name: 'BLSD esecutore', issuer: 'IRC / American Heart Association', category: 'primo_soccorso' },
    { name: 'Allenatore di nuoto', issuer: 'FIN – Federazione Italiana Nuoto', category: 'allenamento' },
];

const inputClass =
    'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-corsia-200 focus:border-corsia-400 outline-none';

/**
 * Configurazione guidata del profilo dopo la registrazione: pochi passi per
 * avere subito un profilo utile (e visibile alle strutture).
 */
const Onboarding: React.FC = () => {
    usePageTitle('Benvenuto');
    const { user, refreshProfile } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const isProfessional = user?.userType === 'professional';
    const u = user as (UserProfile & StructureProfile) | null;

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState(u?.title || u?.structureType || '');
    const [city, setCity] = useState(u?.city || '');
    const [province, setProvince] = useState(u?.province || '');
    const [bio, setBio] = useState(u?.bio || '');
    const [certs, setCerts] = useState<Certification[]>([]);
    const [skills, setSkills] = useState<string[]>(u?.skills || []);
    const [sos, setSos] = useState(!!u?.availableForEmergencies);

    const steps = useMemo(
        () => (isProfessional ? ['Chi sei', 'Brevetti', 'Competenze', 'Disponibilità'] : ['La struttura', 'Presentazione']),
        [isProfessional]
    );

    if (!user || !u) return null;
    const isLast = step === steps.length - 1;

    const toggleCert = (c: Omit<Certification, 'expiry'>) => {
        const key = `${c.name}|${c.issuer}`;
        setCerts((prev) => (prev.some((x) => `${x.name}|${x.issuer}` === key) ? prev.filter((x) => `${x.name}|${x.issuer}` !== key) : [...prev, { ...c, expiry: '' }]));
    };

    const save = async () => {
        setSaving(true);
        try {
            const base = { city: city.trim(), province: province.trim().toUpperCase().slice(0, 2), bio: bio.trim() };
            const existing = (u.certificationsList || []) as string[];
            const data = isProfessional
                ? {
                    ...base,
                    title: title.trim(),
                    skills: skills.slice(0, 20),
                    availableForEmergencies: sos,
                    certificationsList: [...existing, ...certs.map((c) => JSON.stringify(c))],
                }
                : { ...base, structureType: title.trim() };
            await databaseService.updateProfile(user.$id, data);
            await refreshProfile();
            return true;
        } catch (error) {
            console.error('Onboarding:', error);
            showToast('Salvataggio non riuscito. Riprova.', 'error');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const next = async () => {
        if (!isLast) return setStep((s) => s + 1);
        if (await save()) {
            showToast('Profilo pronto. Benvenuto in SwimIn!', 'success');
            navigate('/', { replace: true });
        }
    };

    const skip = async () => {
        await save();
        navigate('/', { replace: true });
    };

    return (
        <div className="min-h-screen w-full bg-piastrella">
            <header className="max-w-2xl mx-auto px-4 h-20 flex items-center justify-between">
                <Brand size="sm" />
                <button onClick={skip} disabled={saving} className="text-sm font-semibold text-slate-500 hover:text-abisso">
                    Completa più tardi
                </button>
            </header>

            <div className="max-w-2xl mx-auto px-4 pb-16">
                {/* avanzamento come corsie da percorrere */}
                <ol className="flex gap-2 mb-8" aria-label="Avanzamento">
                    {steps.map((label, i) => (
                        <li key={label} className="flex-1">
                            <div className={`h-1.5 rounded-full ${i <= step ? 'bg-corsia-600' : 'bg-slate-200'}`} />
                            <span className={`block mt-2 text-xs font-semibold ${i === step ? 'text-abisso' : 'text-slate-400'}`}>{label}</span>
                        </li>
                    ))}
                </ol>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 sm:p-8">
                    {step === 0 && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">
                                {isProfessional ? `Ciao ${u.firstName || ''}, presentati alla rete.` : 'Presenta la tua struttura.'}
                            </h1>
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img src={avatarOf(u)} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
                                    <ImageUploadButton
                                        kind="avatar"
                                        currentUrl={isProfessional ? u.avatar : u.logo}
                                        onUploaded={async (url) => {
                                            await databaseService.updateProfile(user.$id, isProfessional ? { avatar: url } : { logo: url });
                                            await refreshProfile();
                                        }}
                                        label={isProfessional ? 'Carica la tua foto' : 'Carica il logo'}
                                        className="absolute -bottom-1 -right-1 w-9 h-9"
                                    />
                                </div>
                                <p className="text-sm text-slate-600">
                                    {isProfessional ? 'Una foto riconoscibile aiuta colleghi e strutture a fidarsi di te.' : 'Il logo rende riconoscibili i tuoi annunci.'}
                                </p>
                            </div>
                            <div>
                                <label htmlFor="ob-title" className="block text-sm font-semibold text-slate-700 mb-1.5">
                                    {isProfessional ? 'Che cosa fai?' : 'Tipo di struttura'}
                                </label>
                                <input id="ob-title" list="ob-title-options" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={isProfessional ? 'Es. Istruttore di nuoto' : 'Es. Piscina comunale'} maxLength={120} />
                                <datalist id="ob-title-options">
                                    {(isProfessional ? ROLES : STRUCTURE_TYPES).map((r) => <option key={r} value={r} />)}
                                </datalist>
                            </div>
                            <div className="grid grid-cols-[1fr_6rem] gap-3">
                                <div>
                                    <label htmlFor="ob-city" className="block text-sm font-semibold text-slate-700 mb-1.5">Città</label>
                                    <input id="ob-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} placeholder="Es. Milano" autoComplete="address-level2" />
                                </div>
                                <div>
                                    <label htmlFor="ob-prov" className="block text-sm font-semibold text-slate-700 mb-1.5">Provincia</label>
                                    <input id="ob-prov" value={province} onChange={(e) => setProvince(e.target.value.toUpperCase())} className={`${inputClass} uppercase`} placeholder="MI" maxLength={2} />
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 1 && isProfessional && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">Quali brevetti hai?</h1>
                            <p className="text-slate-600">Selezionali qui: le scadenze le aggiungi dal profilo, così ti avvisiamo prima che scadano.</p>
                            <div className="grid sm:grid-cols-2 gap-3">
                                {COMMON_CERTS.map((c) => {
                                    const selected = certs.some((x) => x.name === c.name && x.issuer === c.issuer);
                                    return (
                                        <button
                                            key={`${c.name}${c.issuer}`}
                                            type="button"
                                            onClick={() => toggleCert(c)}
                                            aria-pressed={selected}
                                            className={`text-left p-4 rounded-2xl border-2 transition ${selected ? 'border-corsia-600 bg-corsia-50' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <span className="flex items-start justify-between gap-2">
                                                <span className="font-semibold text-abisso text-sm">{c.name}</span>
                                                {selected && <Icon type="check-circle" className="w-5 h-5 text-corsia-600 flex-shrink-0" />}
                                            </span>
                                            <span className="block text-xs text-slate-500 mt-1">{c.issuer}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 2 && isProfessional && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">In cosa sei bravo?</h1>
                            <p className="text-slate-600">Scegli le tue specialità. I tuoi collegamenti potranno confermarle.</p>
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTED_SKILLS.map((s) => {
                                    const selected = skills.includes(s);
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setSkills((prev) => (selected ? prev.filter((x) => x !== s) : [...prev, s]))}
                                            aria-pressed={selected}
                                            className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition ${selected ? 'bg-abisso text-white border-abisso' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
                                        >
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 3 && isProfessional && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">Disponibile per sostituzioni?</h1>
                            <p className="text-slate-600">
                                Le piscine della tua zona possono lanciare richieste urgenti quando manca un bagnino o un istruttore. Puoi cambiare idea in qualsiasi momento.
                            </p>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={sos}
                                onClick={() => setSos((v) => !v)}
                                className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition ${sos ? 'border-galleggiante bg-red-50' : 'border-slate-200'}`}
                            >
                                <span className="text-left">
                                    <span className="block font-semibold text-abisso">SOS Vasca</span>
                                    <span className="block text-sm text-slate-500">{sos ? 'Riceverai le richieste urgenti' : 'Non riceverai richieste urgenti'}</span>
                                </span>
                                <span className={`relative inline-flex h-7 w-12 rounded-full transition ${sos ? 'bg-galleggiante' : 'bg-slate-300'}`}>
                                    <span className={`inline-block h-6 w-6 mt-0.5 rounded-full bg-white shadow transform transition ${sos ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </span>
                            </button>
                        </div>
                    )}

                    {step === 1 && !isProfessional && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">Racconta la tua piscina.</h1>
                            <label htmlFor="ob-bio" className="block text-sm font-semibold text-slate-700">Vasche, corsi, servizi</label>
                            <textarea id="ob-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={6} maxLength={2500} className={inputClass} placeholder="Es. Vasca da 25 m con 6 corsie, vasca didattica, corsi dai 3 anni, squadra master…" />
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100">
                        <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving} className="px-4 py-2.5 font-semibold text-slate-600 disabled:invisible">
                            Indietro
                        </button>
                        <button type="button" onClick={next} disabled={saving} className="px-6 py-3 font-semibold text-white bg-corsia-600 hover:bg-corsia-700 rounded-full disabled:opacity-60">
                            {saving ? 'Salvataggio…' : isLast ? 'Vai al feed' : 'Continua'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Onboarding;
