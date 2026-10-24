import React, { useState, useMemo } from 'react';
import type { UserProfile, Job } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { jobDisplayTitle } from '@/utils/jobs';
import { useContactInfo } from '@/hooks/useContactInfo';

export type View = 'lavoro' | 'myApplications';
export type CustomApplicationSteps = 'custom_analysis' | 'custom_letter' | 'custom_docs' | 'custom_availability' | 'custom_final' | 'custom_preview';

export type ApplicationFlowState = {
    step: 'idle' | 'requirements' | 'type' | 'rapid' | CustomApplicationSteps | 'confirmation';
    job: Job | null;
};

export interface CustomApplicationData {
    coverLetter_interest: string;
    coverLetter_specialization: string;
    useProfileCv: boolean;
    additionalDocs: File[];
    availability: Record<string, string>;
    salaryRange: [number, number];
    finalMessage: string;
}

interface ApplicationFlowModalProps {
    user: UserProfile;
    job: Job | null;
    flowState: ApplicationFlowState;
    setFlowState: React.Dispatch<React.SetStateAction<ApplicationFlowState>>;
    onSubmit: (applicationType: 'rapida' | 'personalizzata', data?: CustomApplicationData) => void;
    onNavigate: (view: View, id?: string | number) => void;
}

const initialCustomData: CustomApplicationData = {
    coverLetter_interest: '',
    coverLetter_specialization: '',
    useProfileCv: true,
    additionalDocs: [],
    availability: {},
    salaryRange: [1200, 1500],
    finalMessage: '',
};

// --- FUNZIONE AI SWIMMATCH PREDITTIVA ---
const getSwimMatchAnalysis = (user: UserProfile, job: Job) => {
    const reqs = job.requirements || [];
    const quals = job.qualificationsRequired || [];
    const totalReqs = [...reqs, ...quals];

    if (totalReqs.length === 0) return { score: 100, met: ['Requisiti non specificati'], missing: [] };

    const userCerts = (user.certificationsList || []).map(c => {
        try { const p = JSON.parse(c as string); return `${p.name} ${p.category} ${p.issuer}`.toLowerCase(); } 
        catch { return String(c).toLowerCase(); }
    });
    const userExp = (user.experienceList || []).map(e => {
        try { const p = JSON.parse(e as string); return `${p.role} ${p.description || ""}`.toLowerCase(); } 
        catch { return String(e).toLowerCase(); }
    }).join(" ");

    const met: string[] = [];
    const missing: string[] = [];

    totalReqs.forEach(req => {
        const reqLower = req.toLowerCase();
        let isMet = false;
        if (userCerts.some(cert => cert.includes(reqLower) || reqLower.includes(cert))) isMet = true;
        if (!isMet && (userExp.includes(reqLower) || reqLower.includes(userExp))) isMet = true;
        if (!isMet && reqLower.includes('esperienz') && userExp.length > 5) isMet = true;

        if (isMet) met.push(req);
        else missing.push(req);
    });

    const score = Math.round((met.length / totalReqs.length) * 100);
    return { score, met, missing };
};

// --- WRAPPER PRINCIPALE ---
const ModalWrapper: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({ title, subtitle, onClose, children }) => (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                <div>
                    <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
                    {subtitle && <p className="text-sm font-medium text-slate-500 mt-1">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-2 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    <Icon type="x" className="w-6 h-6" />
                </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar">
                {children}
            </div>
        </div>
    </div>
);

// --- COMPONENTI DEGLI STEP ---

const ApplicationTypeStep: React.FC<{ onSelect: (type: 'rapid' | CustomApplicationSteps) => void }> = ({ onSelect }) => (
    <div className="space-y-4">
        <button 
            className="w-full text-left border-2 border-slate-200 rounded-xl p-5 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group outline-none focus-visible:ring-2 focus-visible:ring-blue-500" 
            onClick={() => onSelect('rapid')}
        >
            <div className="flex items-center gap-3 mb-2">
                <Icon type="sparkles" className="w-6 h-6 text-blue-500 group-hover:text-blue-600" />
                <h3 className="font-bold text-lg text-slate-800">Candidatura rapida</h3>
            </div>
            <p className="text-slate-600 ml-9">Usa il tuo profilo SwimIn e il CV esistente. Veloce e immediata.</p>
            <p className="text-xs font-semibold text-slate-500 mt-3 ml-9">Tempo stimato: 30 secondi</p>
        </button>
        <button 
            className="w-full text-left border-2 border-slate-200 rounded-xl p-5 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group outline-none focus-visible:ring-2 focus-visible:ring-blue-500" 
            onClick={() => onSelect('custom_analysis')}
        >
            <div className="flex items-center gap-3 mb-2">
                <Icon type="pencil" className="w-6 h-6 text-blue-500 group-hover:text-blue-600" />
                <h3 className="font-bold text-lg text-slate-800">Candidatura personalizzata</h3>
            </div>
            <p className="text-slate-600 ml-9">Aggiungi una lettera di presentazione, documenti aggiuntivi o orari per distinguerti.</p>
             <p className="text-xs font-semibold text-slate-500 mt-3 ml-9">Tempo stimato: 2-3 minuti</p>
        </button>
    </div>
);

const RapidApplicationStep: React.FC<{ user: UserProfile; onSubmit: () => void; onBack: () => void; }> = ({ user, onSubmit, onBack }) => {
    // Recapiti privati: arrivano dal server (sono i tuoi, li vedrà solo la struttura a cui ti candidi).
    const contact = useContactInfo(user.userId || user.$id);
    return (
     <div>
        <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <h4 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Icon type="check-double" className="w-5 h-5 text-green-500" />
                Dati pronti per l'invio:
            </h4>
            <ul className="list-disc list-inside text-slate-600 text-sm space-y-2 ml-1">
                <li>Profilo SwimIn completo</li>
                <li>CV generato automaticamente</li>
                <li>Brevetti e certificazioni: <strong>{(user.certificationsList || []).length}</strong></li>
            </ul>
        </div>
         <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Email di contatto</label>
            <input type="email" value={contact?.email || ''} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-600 cursor-not-allowed outline-none" />
        </div>
         <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-700 mb-1">Numero di telefono</label>
            <input type="tel" value={contact?.phone || 'Non indicato: aggiungilo dal profilo'} readOnly className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-600 cursor-not-allowed outline-none" />
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
             <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Indietro</button>
            <button onClick={onSubmit} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 shadow-md hover:shadow-lg transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Icon type="send" className="w-4 h-4" />
                Invia candidatura
            </button>
        </div>
    </div>
    );
};

// LO STEP INNOVATIVO: DASHBOARD PREDITTIVA
const CompatibilityAnalysisStep: React.FC<{ user: UserProfile, job: Job, onProceed: () => void, onBack: () => void }> = ({ user, job, onProceed, onBack }) => {
    const { met, missing, score } = useMemo(() => getSwimMatchAnalysis(user, job), [user, job]);

    return (
        <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="mb-6">
                <h3 className="font-bold text-lg text-slate-800 mb-3 flex items-center justify-between">
                    Analisi Compatibilità (AI)
                    <span className={`text-sm px-3 py-1 rounded-full ${score > 70 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {score}% Match
                    </span>
                </h3>
                <div className="w-full bg-slate-100 rounded-full h-3 mb-1 overflow-hidden">
                    <div className={`h-full transition-all duration-1000 ${score > 70 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${score}%` }}></div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
                    <h4 className="font-bold text-green-700 mb-3 flex items-center gap-2">
                        <Icon type="check-double" className="w-4 h-4" /> Punti di Forza
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5">
                        {met.length > 0 ? met.map((m, i) => <li key={i}>{m}</li>) : <li>Nessun match diretto rilevato</li>}
                    </ul>
                </div>
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                    <h4 className="font-bold text-amber-700 mb-3 flex items-center gap-2">
                        <Icon type="info" className="w-4 h-4" /> Aree da compensare
                    </h4>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5">
                        {missing.length > 0 ? missing.map((m, i) => <li key={i}>{m}</li>) : <li>Soddisfi tutti i requisiti!</li>}
                    </ul>
                </div>
            </div>
            
            {missing.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-sm mb-6 flex items-start gap-3">
                    <Icon type="sparkles" className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
                    <div>
                        <p className="font-bold mb-1">Consiglio per la lettera:</p>
                        <p>Dato che ti manca "{missing[0]}", ti suggeriamo di spiegare come la tua motivazione e le altre tue competenze possano compensare questa mancanza nello step successivo.</p>
                    </div>
                </div>
            )}

             <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Annulla</button>
                <button onClick={onProceed} className="bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Scrivi la lettera &rarr;</button>
            </div>
        </div>
    );
};

const CoverLetterStep: React.FC<{ data: CustomApplicationData, setData: React.Dispatch<React.SetStateAction<CustomApplicationData>>, onNext: () => void, onBack: () => void }> = ({ data, setData, onNext, onBack}) => (
    <div className="animate-in slide-in-from-right-4 duration-300">
        <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">1. Perché questa posizione ti interessa?</label>
            <textarea 
                value={data.coverLetter_interest}
                onChange={(e) => setData(prev => ({...prev, coverLetter_interest: e.target.value}))}
                placeholder="Es. Seguo la vostra struttura da tempo e ammiro il vostro metodo di insegnamento..." 
                rows={4} 
                maxLength={500}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-none" 
            />
            <p className="text-xs text-right text-slate-400 mt-1">{data.coverLetter_interest.length}/500</p>
        </div>
        <div className="mb-8">
            <label className="block text-sm font-bold text-slate-700 mb-2">2. Cosa ti rende il candidato ideale?</label>
            <textarea 
                value={data.coverLetter_specialization}
                onChange={(e) => setData(prev => ({...prev, coverLetter_specialization: e.target.value}))}
                placeholder="Es. Nei miei 3 anni di esperienza ho sviluppato un'ottima propensione alla didattica per bambini..." 
                rows={4} 
                maxLength={600}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow resize-none" 
            />
            <p className="text-xs text-right text-slate-400 mt-1">{data.coverLetter_specialization.length}/600</p>
        </div>
         <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Indietro</button>
            <button 
                onClick={onNext} 
                disabled={!data.coverLetter_interest.trim() || !data.coverLetter_specialization.trim()}
                className="bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
                Continua
            </button>
        </div>
    </div>
);

// I TUOI STEP ORIGINALI INTEGRATI ALLA PERFEZIONE

const DocsStep: React.FC<{ onNext: () => void, onBack: () => void }> = ({ onNext, onBack }) => (
    <div className="animate-in slide-in-from-right-4 duration-300">
        <h3 className="font-bold text-lg text-slate-800 mb-4">Documenti aggiuntivi (facoltativi)</h3>
        <p className="text-sm text-slate-600 mb-4">Carica eventuali file aggiuntivi come un CV in PDF o scansioni di brevetti non inseriti nel profilo.</p>
        <div className="border-2 border-dashed border-slate-300 p-8 rounded-xl text-center hover:bg-slate-50 transition-colors cursor-pointer mb-6">
            <Icon type="document" className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <span className="text-sm font-semibold text-blue-600">Clicca per caricare</span> o trascina qui i file
        </div>
        <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Indietro</button>
            <button onClick={onNext} className="bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Salta / Continua</button>
        </div>
    </div>
);

const AvailabilityStep: React.FC<{ data: CustomApplicationData, setData: React.Dispatch<React.SetStateAction<CustomApplicationData>>, onNext: () => void, onBack: () => void }> = ({ data, setData, onNext, onBack }) => (
    <div className="animate-in slide-in-from-right-4 duration-300">
        <h3 className="font-bold text-lg text-slate-800 mb-4">Disponibilità e orari</h3>
        <p className="text-sm text-slate-600 mb-4">Indica alla struttura i tuoi orari di disponibilità per facilitare il processo di selezione.</p>
        <textarea 
            value={data.availability?.notes || ''}
            onChange={(e) => setData(prev => ({...prev, availability: { notes: e.target.value }}))}
            placeholder="Es. Disponibile tutti i pomeriggi dalle 15:00 e i weekend completi..." 
            className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none mb-6" 
            rows={4}
        />
        <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Indietro</button>
            <button onClick={onNext} className="bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Continua</button>
        </div>
    </div>
);

const FinalMessageStep: React.FC<{ data: CustomApplicationData, setData: React.Dispatch<React.SetStateAction<CustomApplicationData>>, onNext: () => void, onBack: () => void }> = ({ data, setData, onNext, onBack }) => (
    <div className="animate-in slide-in-from-right-4 duration-300">
        <h3 className="font-bold text-lg text-slate-800 mb-4">Note finali</h3>
        <p className="text-sm text-slate-600 mb-4">Vuoi aggiungere un ultimo dettaglio o una richiesta speciale prima di inviare?</p>
        <textarea 
            value={data.finalMessage}
            onChange={(e) => setData(prev => ({...prev, finalMessage: e.target.value}))}
            placeholder="Un ultimo messaggio per il selezionatore..." 
            className="w-full bg-white border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none mb-6" 
            rows={4}
        />
        <div className="flex justify-between items-center pt-6 border-t border-slate-100">
            <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Indietro</button>
            <button onClick={onNext} className="bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Vai all'anteprima</button>
        </div>
    </div>
);

const PreviewStep: React.FC<{ job: Job, data: CustomApplicationData, onSubmit: () => void, onBack: () => void }> = ({ job, data, onSubmit, onBack }) => (
    <div className="animate-in slide-in-from-right-4 duration-300">
        <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-500 mb-1">Riepilogo della posizione</h4>
            <p className="font-bold text-lg text-slate-800">{jobDisplayTitle(job)}</p>
            <p className="text-slate-600">{job.structureName || 'Struttura privata'}</p>
        </div>
        <div className="mb-6">
            <h4 className="font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">La tua lettera finale</h4>
            <div className="text-sm text-slate-600 italic bg-white p-4 border border-slate-200 rounded-xl whitespace-pre-wrap shadow-sm">
                "{data.coverLetter_interest} {data.coverLetter_specialization}
                {data.availability?.notes && `\n\nDisponibilità: ${data.availability.notes}`}
                {data.finalMessage && `\nNote: ${data.finalMessage}`}"
            </div>
        </div>
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3">
            <Icon type="info" className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
                <p className="font-bold mb-1">Ultimo controllo</p>
                <p>Cliccando su Invia candidatura, trasmetterai il tuo profilo e la tua lettera alla struttura. L'azione non è annullabile.</p>
            </div>
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <button onClick={onBack} className="font-semibold text-slate-600 px-4 py-2.5 rounded-full hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">Modifica</button>
            <button onClick={onSubmit} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2.5 px-6 rounded-full hover:bg-blue-700 shadow-md hover:shadow-lg transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Icon type="send" className="w-4 h-4" /> INVIA CANDIDATURA
            </button>
        </div>
    </div>
);

const ConfirmationStep: React.FC<{ job: Job; onClose: () => void; onNavigate: (view: View) => void }> = ({ job, onClose, onNavigate }) => (
    <div className="text-center py-6 animate-in zoom-in-95 duration-500">
        <div className="mx-auto bg-green-100 rounded-full h-20 w-20 flex items-center justify-center mb-6 shadow-inner">
            <Icon type="check-double" className="w-10 h-10 text-green-600"/>
        </div>
        <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Candidatura inviata</h3>
        <p className="text-slate-600 mt-2 text-lg">
            Ti sei candidato con successo per <strong>{jobDisplayTitle(job)}</strong> presso <strong>{job.structureName || 'la struttura'}</strong>.
        </p>
        <p className="text-sm text-slate-500 mt-4 bg-slate-50 p-3 rounded-lg inline-block border border-slate-100">
            Tieni d'occhio le notifiche e la sezione "Lavoro".
        </p>
        <div className="mt-8 pt-6 border-t border-slate-100 space-y-3">
            <button onClick={() => { onClose(); onNavigate('myApplications'); }} className="w-full text-center bg-blue-600 text-white font-bold px-4 py-3 rounded-xl hover:bg-blue-700 shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                Vedi le mie candidature
            </button>
            <button onClick={onClose} className="w-full text-center font-bold text-slate-600 px-4 py-3 rounded-xl hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                Torna alla bacheca
            </button>
        </div>
    </div>
);

export const ApplicationFlowModal: React.FC<ApplicationFlowModalProps> = ({ user, job, flowState, setFlowState, onSubmit, onNavigate }) => {
    
    const [customApplicationData, setCustomApplicationData] = useState<CustomApplicationData>(initialCustomData);
    
    if (!job || flowState.step === 'idle') return null;

    const closeModal = () => {
        setFlowState({ step: 'idle', job: null });
        setCustomApplicationData(initialCustomData);
    };

    const titles: { [key in ApplicationFlowState['step']]: string | string[] } = {
        idle: '',
        requirements: `Candidatura per ${jobDisplayTitle(job)}`,
        type: 'Come vuoi candidarti?',
        rapid: 'Candidatura rapida',
        custom_analysis: `Candidatura per ${jobDisplayTitle(job)}`,
        custom_letter: ['Lettera motivazionale', 'Passo 1 di 4'],
        custom_docs: ['Documentazione', 'Passo 2 di 4'],
        custom_availability: ['Disponibilità', 'Passo 3 di 4'],
        custom_final: ['Messaggio finale', 'Passo 4 di 4'],
        custom_preview: 'Anteprima della candidatura',
        confirmation: 'Inviata!',
    };
    
    const getTitle = () => {
        const titleInfo = titles[flowState.step];
        return Array.isArray(titleInfo) ? titleInfo[0] : titleInfo;
    };
    
    const getSubtitle = () => {
        const titleInfo = titles[flowState.step];
        return Array.isArray(titleInfo) ? titleInfo[1] : undefined;
    };

    const renderStep = () => {
        switch (flowState.step) {
            case 'requirements':
            case 'type':
                return <ApplicationTypeStep onSelect={(type) => setFlowState(prev => ({ ...prev, step: type }))} />;
            case 'rapid':
                return <RapidApplicationStep user={user} onSubmit={() => onSubmit('rapida')} onBack={() => setFlowState(prev => ({...prev, step: 'type'}))}/>;
            case 'custom_analysis':
                 return <CompatibilityAnalysisStep 
                    user={user} 
                    job={job} 
                    onProceed={() => setFlowState(prev => ({ ...prev, step: 'custom_letter' }))}
                    onBack={() => setFlowState(prev => ({ ...prev, step: 'type' }))}
                 />;
            case 'custom_letter':
                return <CoverLetterStep 
                    data={customApplicationData} 
                    setData={setCustomApplicationData}
                    onNext={() => setFlowState(prev => ({...prev, step: 'custom_docs'}))}
                    onBack={() => setFlowState(prev => ({...prev, step: 'custom_analysis'}))}
                />;
            case 'custom_docs':
                return <DocsStep 
                    onNext={() => setFlowState(prev => ({...prev, step: 'custom_availability'}))}
                    onBack={() => setFlowState(prev => ({...prev, step: 'custom_letter'}))}
                />;
            case 'custom_availability':
                return <AvailabilityStep 
                    data={customApplicationData} 
                    setData={setCustomApplicationData}
                    onNext={() => setFlowState(prev => ({...prev, step: 'custom_final'}))}
                    onBack={() => setFlowState(prev => ({...prev, step: 'custom_docs'}))}
                />;
            case 'custom_final':
                return <FinalMessageStep 
                    data={customApplicationData} 
                    setData={setCustomApplicationData}
                    onNext={() => setFlowState(prev => ({...prev, step: 'custom_preview'}))}
                    onBack={() => setFlowState(prev => ({...prev, step: 'custom_availability'}))}
                />;
            case 'custom_preview':
                return <PreviewStep 
                    job={job}
                    data={customApplicationData}
                    onSubmit={() => onSubmit('personalizzata', customApplicationData)}
                    onBack={() => setFlowState(prev => ({...prev, step: 'custom_final'}))}
                />
            case 'confirmation':
                return <ConfirmationStep job={job} onClose={closeModal} onNavigate={onNavigate} />;
            default:
                return null;
        }
    }

    return (
        <ModalWrapper title={getTitle()} subtitle={getSubtitle()} onClose={closeModal}>
           {renderStep()}
        </ModalWrapper>
    );
};