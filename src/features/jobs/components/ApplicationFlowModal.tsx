import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile, Job } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { FormModal } from '@/components/form/FormModal';
import { Checkbox, Field, fieldClass } from '@/components/form/Field';
import { useToast } from '@/context/ToastContext';
import { useContactInfo } from '@/hooks/useContactInfo';
import { useMyResume } from '@/hooks/useMyResume';
import { openResume, resumeFileError } from '@/services/resume';
import { formatFileSize } from '@/services/chatFiles';
import { UploadProgress } from '@/components/common/UploadProgress';
import { jobDisplayTitle } from '@/utils/jobs';
import { requirementsStatus } from '@/utils/swimMatch';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { parseCertifications } from '@/utils/certifications';
import { SensitiveDataNotice } from '@/components/common/SensitiveDataNotice';

export type View = 'lavoro' | 'myApplications';

export type ApplicationFlowState = { step: 'idle' | 'compose' | 'confirmation'; job: Job | null };

export interface ApplyData {
    coverLetter: string;
    availability: string;
    attachResume: boolean;
}

interface ApplicationFlowModalProps {
    user: UserProfile;
    job: Job | null;
    flowState: ApplicationFlowState;
    setFlowState: React.Dispatch<React.SetStateAction<ApplicationFlowState>>;
    onSubmit: (data: ApplyData) => Promise<void>;
    onNavigate: (view: View) => void;
}

const LETTER_MAX = 2500;
const AVAILABILITY_MAX = 300;

/**
 * Candidatura in una schermata: si vede cosa riceve la struttura (profilo, brevetti, recapiti, CV),
 * si allega il CV del profilo (o lo si carica qui) e, se si vuole, si aggiungono due righe e la
 * disponibilità. Con il CV caricato basta un tocco su "Invia candidatura".
 */
export const ApplicationFlowModal: React.FC<ApplicationFlowModalProps> = ({ user, job, flowState, setFlowState, onSubmit, onNavigate }) => {
    const { showToast } = useToast();
    const open = !!job && flowState.step !== 'idle';
    const contact = useContactInfo(user.userId || user.$id, open);
    const { resume, busy: uploading, progress, upload } = useMyResume(open);
    const [attach, setAttach] = useState(true);
    const [letter, setLetter] = useState('');
    const [availability, setAvailability] = useState('');
    const [sending, setSending] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // Nuova candidatura: si riparte da zero (il CV resta selezionato se c'è).
    useEffect(() => {
        if (flowState.step === 'compose') { setLetter(''); setAvailability(''); setAttach(true); }
    }, [flowState.step, job?.$id]);

    const requirements = useMemo(() => (job ? requirementsStatus(user, job) : []), [user, job]);
    const certs = useMemo(() => parseCertifications(user.certificationsList).length, [user.certificationsList]);
    const experiences = (user.experienceList || []).length;

    if (!job || flowState.step === 'idle') return null;
    const close = () => setFlowState({ step: 'idle', job: null });
    const attachResume = !!resume && attach;

    const handleFile = async (file?: File | null) => {
        if (!file) return;
        const error = resumeFileError(file);
        if (error) return showToast(error, 'error');
        try {
            await upload(file);
            setAttach(true);
            showToast('CV caricato: lo trovi anche nel tuo profilo.', 'success');
        } catch (err) {
            showToast(err instanceof Error && err.message ? err.message : 'Il CV non è stato caricato. Riprova.', 'error');
        }
    };

    if (flowState.step === 'confirmation') {
        return (
            <FormModal
                open
                title="Candidatura inviata"
                icon="check-double"
                description={`${job.structureName || 'La struttura'} ha ricevuto la tua candidatura per ${jobDisplayTitle(job)} e ti avviserà a ogni passaggio.`}
                submitLabel="Vedi le mie candidature"
                cancelLabel="Chiudi"
                onClose={close}
                onSubmit={(e) => { e.preventDefault(); close(); onNavigate('myApplications'); }}
            >
                <ul className="text-sm text-slate-600 space-y-2">
                    <li className="flex gap-2"><Icon type="check-circle" className="w-5 h-5 text-cloro-700 shrink-0" /> Profilo, brevetti ed esperienze</li>
                    {attachResume && <li className="flex gap-2"><Icon type="check-circle" className="w-5 h-5 text-cloro-700 shrink-0" /> CV: {resume?.name}</li>}
                    <li className="flex gap-2"><Icon type="bell" className="w-5 h-5 text-corsia-600 shrink-0" /> Quando la struttura apre o seleziona la candidatura ricevi una notifica.</li>
                </ul>
            </FormModal>
        );
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            await onSubmit({ coverLetter: letter.trim(), availability: availability.trim(), attachResume });
        } finally {
            setSending(false);
        }
    };

    return (
        <FormModal
            open
            size="lg"
            title={`Candidati: ${jobDisplayTitle(job)}`}
            description={job.structureName || undefined}
            dirty={!!letter.trim() || !!availability.trim()}
            busy={sending || uploading}
            busyLabel={uploading ? 'Caricamento del CV…' : 'Invio…'}
            submitLabel="Invia candidatura"
            onClose={close}
            onSubmit={submit}
        >
            <div className="space-y-5">
                <section aria-labelledby="apply-sent" className="rounded-2xl border border-slate-200 p-4">
                    <h3 id="apply-sent" className="text-sm font-semibold text-slate-500 mb-3">La struttura riceve</h3>
                    <div className="flex items-center gap-3">
                        <img src={avatarOf(user)} alt="" className="w-11 h-11 rounded-full object-cover bg-white shrink-0" />
                        <div className="min-w-0">
                            <p className="font-semibold text-abisso">{displayNameOf(user)}</p>
                            <p className="text-sm text-slate-500">{headlineOf(user)}</p>
                        </div>
                    </div>
                    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-600">
                        <li className="flex items-center gap-2"><Icon type="shield" className="w-4 h-4 text-corsia-600 shrink-0" /> {certs === 1 ? '1 brevetto' : `${certs} brevetti`}</li>
                        <li className="flex items-center gap-2"><Icon type="briefcase" className="w-4 h-4 text-corsia-600 shrink-0" /> {experiences === 1 ? '1 esperienza' : `${experiences} esperienze`}</li>
                        <li className="flex items-center gap-2 min-w-0"><Icon type="mail" className="w-4 h-4 text-corsia-600 shrink-0" /> <span className="truncate">{contact?.email || 'Email dell’account'}</span></li>
                        <li className="flex items-center gap-2"><Icon type="phone" className="w-4 h-4 text-corsia-600 shrink-0" /> {contact?.phone || 'Telefono non indicato'}</li>
                    </ul>
                </section>

                <section aria-labelledby="apply-cv">
                    <h3 id="apply-cv" className="text-sm font-semibold text-abisso mb-2">Curriculum vitae</h3>
                    {progress !== null && <UploadProgress value={progress} label="Caricamento del CV" className="mb-3" />}
                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                    {resume === undefined ? (
                        <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                    ) : resume ? (
                        <div className="rounded-2xl border border-slate-200 p-3 sm:p-4 space-y-3">
                            <Checkbox
                                id="apply-attach-cv"
                                checked={attach}
                                onChange={setAttach}
                                label={<span className="break-all">Allega {resume.name}</span>}
                                description={`PDF · ${formatFileSize(resume.size)}. La struttura riceve una copia: se poi cambi CV, questa candidatura non cambia.`}
                            />
                            <div className="flex flex-wrap gap-2 pl-8">
                                <button type="button" onClick={() => openResume(resume.fileId).catch((err) => showToast(err instanceof Error ? err.message : 'CV non disponibile.', 'error'))} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Apri</button>
                                <span className="text-slate-300" aria-hidden="true">·</span>
                                <button type="button" onClick={() => fileRef.current?.click()} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Usa un altro PDF</button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                            <p className="text-sm text-slate-600 flex-1">Facoltativo, ma aiuta: aggiungi il CV in PDF (fino a 5 MB). Resterà nel tuo profilo per le prossime candidature.</p>
                            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-abisso hover:bg-slate-50 shrink-0">
                                <Icon type="plus" className="w-4 h-4" /> Aggiungi il CV
                            </button>
                        </div>
                    )}
                    <SensitiveDataNotice className="mt-3" />
                </section>

                {requirements.length > 0 && (
                    <section aria-labelledby="apply-reqs">
                        <h3 id="apply-reqs" className="text-sm font-semibold text-abisso mb-2">
                            Requisiti dell’annuncio · {requirements.filter((r) => r.met).length} su {requirements.length} nel tuo profilo
                        </h3>
                        <ul className="flex flex-wrap gap-2">
                            {requirements.map((r) => (
                                <li key={r.requirement} className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full border ${r.met ? 'bg-cloro-50 border-cloro-200 text-cloro-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                                    <Icon type={r.met ? 'check' : 'info'} className="w-3.5 h-3.5" />
                                    {r.requirement}
                                    <span className="sr-only">{r.met ? ' (nel profilo)' : ' (non trovato nel profilo)'}</span>
                                </li>
                            ))}
                        </ul>
                        {requirements.some((r) => !r.met) && <p className="text-xs text-slate-500 mt-2">Se li hai, spiegalo nel messaggio o aggiungili al profilo: la struttura li vedrà.</p>}
                    </section>
                )}

                <Field id="apply-letter" label="Messaggio alla struttura" optional count={{ value: letter, max: LETTER_MAX }} hint="Due righe su perché ti interessa e cosa porti: bastano per distinguerti. Niente dati sulla salute o su altre persone.">
                    <textarea
                        value={letter}
                        onChange={(e) => setLetter(e.target.value)}
                        rows={4}
                        maxLength={LETTER_MAX}
                        placeholder="Es. Insegno ai bambini da tre anni e ho il brevetto di salvamento aggiornato…"
                        className={fieldClass(undefined, 'resize-y min-h-[6rem]')}
                    />
                </Field>

                <Field id="apply-availability" label="Disponibilità" optional>
                    <input value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={AVAILABILITY_MAX} placeholder="Es. pomeriggi dal lunedì al venerdì, weekend su richiesta" />
                </Field>
            </div>
        </FormModal>
    );
};
