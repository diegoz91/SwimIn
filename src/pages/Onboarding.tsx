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
import { COMMON_CERTS, POOL_SERVICES, PROFESSIONAL_ROLES as ROLES, STRUCTURE_TYPES, SWIM_ACTIVITIES } from '@/data/swimming';
import { Field, ChoiceChips } from '@/components/form/Field';
import { DatePicker, SuggestInput } from '@/components/form/Pickers';
import { LocationFields } from '@/components/form/LocationFields';
import { useComuni } from '@/data/comuni';
import { provinceName } from '@/data/italy';
import { check, comuneOf, isoDate, maxLength, minLength, province as provinceRule, required, notBefore, notAfter } from '@/utils/validation';
import { addDaysISO, todayISO } from '@/utils/dates';
import { takePendingJobPath } from '@/utils/pendingJob';
import { useMyResume } from '@/hooks/useMyResume';
import { UploadProgress } from '@/components/common/UploadProgress';
import { resumeFileError } from '@/services/resume';

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
    /** Chi nuota per passione: niente brevetti, competenze e disponibilità al lavoro. */
    const isFan = isProfessional && (user as Partial<UserProfile> | null)?.personType === 'enthusiast';
    // Campi di entrambi i tipi di profilo, letti in modo tollerante.
    const u = user as (Partial<Omit<UserProfile, 'userType'>> & Partial<Omit<StructureProfile, 'userType'>> & { userType?: string }) | null;

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [title, setTitle] = useState(u?.title || u?.structureType || '');
    const [city, setCity] = useState(u?.city || '');
    const [province, setProvince] = useState(u?.province || '');
    const [bio, setBio] = useState(u?.bio || '');
    const [certs, setCerts] = useState<Certification[]>([]);
    const [skills, setSkills] = useState<string[]>(u?.skills || []);
    const [sos, setSos] = useState(!!u?.availableForEmergencies);
    const [services, setServices] = useState<string[]>(u?.services || []);
    const [sports, setSports] = useState<string[]>(u?.sports || []);
    const [showErrors, setShowErrors] = useState(false);

    const { comuni } = useComuni(province);
    const step0Errors = {
        title: isProfessional && !isFan ? check(title, required('Indica cosa fai: compare sotto il tuo nome.'), minLength(2), maxLength(100)) : check(title, maxLength(80)),
        city: check(city, required(isFan ? 'Indica il comune: serve per trovare piscine e persone vicine.' : 'Indica il comune: serve per le offerte vicine.'), minLength(2), maxLength(80), comuneOf(comuni, provinceName(province))),
        province: check(province, required('Scegli la provincia.'), provinceRule),
    };
    const certErrors = certs.map((c) => check(c.expiry || '', isoDate, notBefore(todayISO(), 'Questa data è già passata: il brevetto risulterebbe scaduto.'), notAfter(addDaysISO(todayISO(), 365 * 10), 'Controlla l’anno.')));
    const stepErrors = step === 0 ? Object.values(step0Errors).filter(Boolean) : step === 1 && isProfessional && !isFan ? certErrors.filter(Boolean) : [];

    const steps = useMemo(
        () => (isFan ? ['Chi sei', 'Cosa pratichi'] : isProfessional ? ['Chi sei', 'Brevetti', 'Competenze', 'CV', 'Disponibilità'] : ['La struttura', 'Presentazione']),
        [isProfessional, isFan]
    );

    if (!user || !u) return null;
    const isLast = step === steps.length - 1;

    const toggleCert = (c: (typeof COMMON_CERTS)[number]) => {
        const key = `${c.name}|${c.issuer}`;
        const { years: _years, ...cert } = c;
        setCerts((prev) => (prev.some((x) => `${x.name}|${x.issuer}` === key) ? prev.filter((x) => `${x.name}|${x.issuer}` !== key) : [...prev, { ...cert, expiry: '' }]));
    };
    const setCertExpiry = (name: string, issuer: string, expiry: string) =>
        setCerts((prev) => prev.map((x) => (x.name === name && x.issuer === issuer ? { ...x, expiry } : x)));

    const save = async () => {
        setSaving(true);
        try {
            const base = { city: city.trim().replace(/\s+/g, ' '), province: province.trim().toUpperCase(), bio: bio.trim() };
            const existing = (u.certificationsList || []) as string[];
            const data = isFan
                ? { ...base, title: title.trim(), sports: sports.slice(0, 15) }
                : isProfessional
                ? {
                    ...base,
                    title: title.trim(),
                    skills: skills.slice(0, 20),
                    availableForEmergencies: sos,
                    certificationsList: [...existing, ...certs.map(({ expiry, ...c }) => JSON.stringify(expiry ? { ...c, expiry } : c))],
                }
                : { ...base, structureType: title.trim(), services };
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
        if (stepErrors.length) return setShowErrors(true);
        setShowErrors(false);
        if (!isLast) return setStep((s) => s + 1);
        if (await save()) {
            showToast('Profilo pronto. Benvenuto in SwimIn!', 'success');
            navigate(takePendingJobPath(), { replace: true });
        }
    };

    const skip = async () => {
        // Salva solo ciò che è valido: i campi incompleti si sistemano dal profilo.
        if (!Object.values(step0Errors).some(Boolean)) await save();
        navigate(takePendingJobPath(), { replace: true });
    };

    return (
        <div className="min-h-screen w-full bg-piastrella">
            <header className="max-w-2xl mx-auto px-4 h-20 flex items-center justify-between">
                <Brand size="sm" />
                <button onClick={skip} disabled={saving} className="py-1 -my-1 text-sm font-semibold text-slate-500 hover:text-abisso">
                    Completa più tardi
                </button>
            </header>

            <div className="max-w-2xl mx-auto px-4 pb-16">
                {/* avanzamento come corsie da percorrere */}
                <p className="text-sm text-slate-600 mb-2" aria-live="polite">
                    Passo <span className="font-semibold text-abisso">{step + 1} di {steps.length}</span> · {steps[step]}
                    <span className="float-right font-semibold text-corsia-700">{Math.round((step / steps.length) * 100)}%</span>
                </p>
                <ol className="flex gap-2 mb-8" aria-label="Avanzamento">
                    {steps.map((label, i) => (
                        <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
                            <div className={`h-1.5 rounded-full transition-colors duration-300 ${i < step ? 'bg-corsia-600' : i === step ? 'bg-gradient-to-r from-corsia-600 to-cloro-500' : 'bg-slate-200'}`} />
                            <span className={`hidden sm:flex items-center gap-1 mt-2 text-xs font-semibold ${i === step ? 'text-abisso' : i < step ? 'text-corsia-700' : 'text-slate-500'}`}>
                                {i < step && <Icon type="check" className="w-3 h-3" />}{label}
                            </span>
                            <span className="sr-only sm:hidden">{label}{i < step ? ', fatto' : ''}</span>
                        </li>
                    ))}
                </ol>

                <div className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 sm:p-8">
                    <div key={step} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
                    {step === 0 && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">
                                {isProfessional ? `Ciao ${u.firstName || ''}, presentati alla rete.` : 'Presenta la tua struttura.'}
                            </h1>
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img src={avatarOf(user)} alt="" className="w-20 h-20 rounded-full object-cover border border-slate-200" />
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
                            <Field id="ob-title" label={isFan ? 'Come ti descrivi' : isProfessional ? 'Che cosa fai?' : 'Tipo di struttura'} optional={!isProfessional || isFan} error={showErrors ? step0Errors.title : undefined}>
                                <SuggestInput value={title} onChange={setTitle} options={isFan ? ['Nuotatore master', 'Appassionato di nuoto', 'Triatleta', 'Genitore di un piccolo nuotatore', 'Ex agonista'] : isProfessional ? ROLES : STRUCTURE_TYPES} label={isProfessional ? 'Ruoli' : 'Tipi di struttura'} placeholder={isFan ? 'Es. Nuotatore master' : isProfessional ? 'Es. Istruttore di nuoto' : 'Es. Piscina comunale'} maxLength={110} />
                            </Field>
                            <LocationFields
                                idPrefix="ob"
                                province={province}
                                city={city}
                                onProvince={setProvince}
                                onCity={setCity}
                                onTouch={() => undefined}
                                errors={showErrors ? { province: step0Errors.province, city: step0Errors.city } : {}}
                            />
                        </div>
                    )}

                    {step === 1 && isFan && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">Come vivi il nuoto?</h1>
                            <p className="text-slate-600">Scegli cosa pratichi: ti mostreremo persone, piscine e post vicini ai tuoi interessi.</p>
                            <ChoiceChips label="Attività praticate" multiple max={15} options={SWIM_ACTIVITIES.map((x) => ({ value: x, label: x }))} value={sports} onChange={setSports} />
                            <Field id="ob-fan-bio" label="Qualcosa su di te" optional count={{ value: bio, max: 2500 }} hint="Es. dove nuoti, da quanto, cosa ti piacerebbe migliorare.">
                                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={2600} className={inputClass} />
                            </Field>
                        </div>
                    )}

                    {step === 1 && isProfessional && !isFan && (
                        <div className="space-y-5">
                            <h1 className="text-4xl font-bold text-abisso leading-none">Quali brevetti hai?</h1>
                            <p className="text-slate-600">Selezionali qui e, per quelli che scadono, indica la data: ti avviseremo due mesi prima.</p>
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
                            {certs.filter((c) => COMMON_CERTS.find((k) => k.name === c.name && k.issuer === c.issuer)?.years).map((c) => {
                                const idx = certs.indexOf(c);
                                return (
                                    <Field key={`${c.name}${c.issuer}-exp`} id={`ob-exp-${idx}`} label={`Scadenza: ${c.name}`} optional error={showErrors ? certErrors[idx] : undefined} className="animate-in fade-in slide-in-from-top-1 duration-200">
                                        <DatePicker label={`Scadenza: ${c.name}`} value={c.expiry || ''} min={todayISO()} max={addDaysISO(todayISO(), 365 * 10)} onChange={(v) => setCertExpiry(c.name, c.issuer, v)} />
                                    </Field>
                                );
                            })}
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

                    {step === 3 && isProfessional && !isFan && <OnboardingResume />}

                    {step === 4 && isProfessional && (
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
                                    <span className="block font-semibold text-abisso">Sostituzioni urgenti</span>
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
                            <div>
                                <p className="text-sm font-semibold text-abisso mb-2">Attività proposte</p>
                                <ChoiceChips label="Attività proposte" multiple options={POOL_SERVICES.map((x) => ({ value: x, label: x }))} value={services} onChange={setServices} />
                            </div>
                            <Field id="ob-bio" label="Presentazione" optional count={{ value: bio, max: 2500 }} hint="Vasche, orari, ambiente di lavoro: lunghezza e corsie le aggiungi poi dal profilo.">
                                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={6} maxLength={2600} className={inputClass} placeholder="Es. Vasca da 25 m con 6 corsie, vasca didattica, corsi dai 3 anni, squadra master…" />
                            </Field>
                        </div>
                    )}
                    </div>

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

/** Passo facoltativo: il CV in PDF, usato poi per le candidature rapide. */
const OnboardingResume: React.FC = () => {
    const { resume, busy, progress, upload } = useMyResume();
    const { showToast } = useToast();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const handle = async (file?: File | null) => {
        if (!file) return;
        const error = resumeFileError(file);
        if (error) return showToast(error, 'error');
        try {
            await upload(file);
            showToast('CV caricato: le candidature ora partono in un tocco.', 'success');
        } catch (err) {
            showToast(err instanceof Error && err.message ? err.message : 'Il CV non è stato caricato. Riprova.', 'error');
        }
    };
    return (
        <div className="space-y-5">
            <h1 className="text-4xl font-bold text-abisso leading-none">Hai un CV pronto?</h1>
            <p className="text-slate-600">Caricalo una volta: lo alleghi alle candidature con un tocco. Lo vedi solo tu e le strutture a cui ti candidi. Puoi saltare questo passo e aggiungerlo dal profilo.</p>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
            {progress !== null && <UploadProgress value={progress} label="Caricamento del CV" />}
            {resume ? (
                <div className="flex items-center gap-3 p-4 rounded-2xl border-2 border-cloro-300 bg-cloro-50">
                    <Icon type="check-circle" className="w-6 h-6 text-cloro-700 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-abisso break-all">{resume.name}</p>
                        <p className="text-sm text-slate-600">Pronto per le candidature</p>
                    </div>
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Cambia</button>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void handle(e.dataTransfer.files?.[0]); }}
                    className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-corsia-500 bg-corsia-50' : 'border-slate-300 bg-white'}`}
                >
                    <Icon type="document" className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-corsia-600 text-white font-semibold hover:bg-corsia-700 disabled:opacity-60">
                        {busy ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" /> : <Icon type="plus" className="w-4 h-4" />}
                        {busy ? 'Caricamento…' : 'Carica il CV in PDF'}
                    </button>
                    <p className="text-xs text-slate-500 mt-2">Fino a 5 MB<span className="hidden sm:inline"> · oppure trascinalo qui</span></p>
                </div>
            )}
        </div>
    );
};

export default Onboarding;
