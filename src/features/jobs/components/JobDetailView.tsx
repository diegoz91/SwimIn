import React, { useMemo, useState, useEffect } from 'react';
import type { Job, StructureProfile, UserProfile, Application } from '@/types/types';
import { useAuth } from '@/hooks/useAuth';
import { Icon } from '@/components/ui/Icon';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { isPremium } from '@/utils/premium';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { initialsAvatar } from '@/utils/avatar';
import { displayNameOf } from '@/utils/profile';
import { useSaved } from '@/context/SavedContext';
import { jobDisplayTitle } from '@/utils/jobs';

interface JobDetailViewProps {
  job: Job;
  structure?: StructureProfile | null;
  onBack: () => void;
  onApply: (job: Job) => void;
  isAdmin?: boolean;     
  hasApplied?: boolean;  
}

const getSwimMatchAnalysis = (user: UserProfile, job: Job) => {
    const reqs = job.requirements || [];
    const quals = job.qualificationsRequired || [];
    const totalReqs = [...reqs, ...quals];

    if (totalReqs.length === 0) return { score: 100, met: [], missing: [] };

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

export const JobDetailView: React.FC<JobDetailViewProps> = ({ 
    job, 
    structure, 
    onBack, 
    onApply,
    isAdmin = false,
    hasApplied = false
}) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { isSaved, toggle: toggleSaved } = useSaved();
    const navigate = useNavigate();
  
    const [localJob, setLocalJob] = useState<Job>(job);
    const [applicants, setApplicants] = useState<(Application & { applicantProfile?: UserProfile })[]>([]);
    const [isLoadingApps, setIsLoadingApps] = useState(false);

    // 💡 STATO PER LA MODALE CUSTOM DI ASSUNZIONE
    const [candidateToHire, setCandidateToHire] = useState<{ appId: string, applicantId: string, applicantName: string } | null>(null);

    useEffect(() => {
        if (isAdmin) {
            setIsLoadingApps(true);
            databaseService.getJobApplications(localJob.$id).then(async (apps) => {
                const enriched = await Promise.all(apps.map(async app => {
                    try {
                        const profile = await databaseService.getProfile(app.applicantId);
                        return { ...app, applicantProfile: profile as UserProfile };
                    } catch { return app; }
                }));
                setApplicants(enriched);
                setIsLoadingApps(false);
            });
        }
    }, [isAdmin, localJob.$id]);

    const handleUpdateStatus = async (appId: string, status: 'rejected') => {
        const success = await databaseService.updateApplicationStatus(appId, status);
        if (success) {
            setApplicants(prev => prev.map(a => a.$id === appId ? { ...a, status } : a));
            showToast('Candidato scartato.', 'info');
        } else {
            showToast('Errore durante l\'aggiornamento.', 'error');
        }
    };

    // 💡 FUNZIONE DI CONFERMA ASSUNZIONE DALLA MODALE
    const confirmHireCandidate = async () => {
        if (!candidateToHire) return;
        const { appId, applicantId, applicantName } = candidateToHire;
        
        const success = await databaseService.hireCandidate(appId, localJob.$id, localJob.structureId, applicantId);
        if (success) {
            setApplicants(prev => prev.map(a => a.$id === appId ? { ...a, status: 'hired' } : a));
            setLocalJob(prev => ({ ...prev, isActive: false }));
            showToast(`Hai assunto ${applicantName}! Benvenuto nel Team.`, 'success');
        } else {
            showToast('Errore durante l\'assunzione.', 'error');
        }
        setCandidateToHire(null);
    };

    /** Link pubblico dell'offerta (/offerte/:id): si apre anche senza account ed è indicizzato da Google Jobs. */
    const shareJob = async () => {
        const url = `${window.location.origin}/offerte/${localJob.$id}`;
        try {
            if (navigator.share) await navigator.share({ title: jobDisplayTitle(localJob), url });
            else { await navigator.clipboard.writeText(url); showToast('Link dell’offerta copiato.', 'info'); }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.warn('Condivisione:', err);
        }
    };
    const [isToggling, setIsToggling] = useState(false);
    const toggleOpen = async () => {
        if (localJob.isActive && !window.confirm('Chiudere l’annuncio? Non riceverà più candidature; potrai riaprirlo finché non scade.')) return;
        setIsToggling(true);
        try {
            const saved = localJob.isActive ? await databaseService.closeJob(localJob.$id) : await databaseService.reopenJob(localJob.$id);
            setLocalJob((prev) => ({ ...prev, isActive: saved.isActive }));
            showToast(saved.isActive ? 'Annuncio riaperto.' : 'Annuncio chiuso.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setIsToggling(false);
        }
    };

    const { structureName, structureLogo } = useMemo(() => {
        const name = structure?.structureName || localJob.structureName || 'Struttura non specificata';
        const logo = structure?.logo || localJob.facilityLogo || initialsAvatar(name);
        return { structureName: name, structureLogo: logo };
    }, [structure, localJob.structureName, localJob.facilityLogo]);

    const renderSalary = () => {
        if (!localJob.salaryMin && !localJob.salaryMax) return null;
        if (localJob.salaryMin && localJob.salaryMax) return `€${localJob.salaryMin} - €${localJob.salaryMax} / mese`;
        if (localJob.salaryMin) return `Da €${localJob.salaryMin} / mese`;
        return `Fino a €${localJob.salaryMax} / mese`;
    };

    const salaryString = renderSalary();
    const isProfessional = user?.userType === 'professional';
    const analysis = isProfessional && !isAdmin ? getSwimMatchAnalysis(user as UserProfile, localJob) : null;

    return (
        <div className="bg-white rounded-2xl shadow-xl max-w-4xl mx-auto overflow-hidden relative pb-24 md:pb-0 border border-slate-100 animate-in fade-in duration-500">
            
            {/* Header */}
            <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start mb-6">
                    <button onClick={onBack} className="flex items-center text-slate-500 hover:text-blue-600 font-semibold group transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1">
                        <Icon type="arrow-left" className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" /> Indietro
                    </button>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-full border border-blue-200 shadow-sm flex items-center gap-1">
                                <Icon type="star" className="w-3.5 h-3.5" /> Il tuo annuncio
                            </span>
                        )}
                        {localJob.isActive && (
                            <button onClick={shareJob} className="px-3 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-white border border-slate-200 flex items-center gap-1.5" aria-label="Condividi l’offerta">
                                <Icon type="share" className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Condividi</span>
                            </button>
                        )}
                    </div>
                </div>
                
                <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-800 leading-tight">{jobDisplayTitle(localJob)}</h1>
                
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5"><Icon type="location" className="w-4 h-4" />{localJob.city}{localJob.province ? ` (${localJob.province})` : ''}</div>
                    <div className="flex items-center gap-1.5 capitalize"><Icon type="briefcase" className="w-4 h-4" />{localJob.contractType || 'Non specificato'}</div>
                    {salaryString && <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-0.5 rounded-md border border-green-100"><Icon type="star" className="w-4 h-4" />{salaryString}</div>}
                </div>

                <div className="flex items-center mt-5 space-x-3 text-slate-700">
                    <img src={structureLogo} alt="Logo" className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-slate-200 shadow-sm bg-white" />
                    <span className="font-bold text-lg">{structureName}</span>
                </div>
            </div>

            {/* BADGE POSIZIONE CHIUSA */}
            {!localJob.isActive && (
                <div className="bg-slate-100 text-slate-700 border border-slate-200 p-4 font-semibold flex items-center gap-2 m-5 sm:m-8 rounded-xl mb-0">
                    <Icon type="lock-closed" className="w-5 h-5" />
                    Questa posizione è chiusa e non riceve più candidature.
                </div>
            )}

            {/* Chi gestisce l'annuncio lo chiude o lo riapre (verificato dalla Function). */}
            {isAdmin && !localJob.isSOS && (
                <div className="px-5 sm:px-8 pt-5 flex flex-wrap items-center gap-3">
                    <button
                        onClick={toggleOpen}
                        disabled={isToggling}
                        className="px-5 py-2.5 rounded-full font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
                    >
                        <Icon type={localJob.isActive ? 'lock-closed' : 'check'} className="w-4 h-4" />
                        {localJob.isActive ? 'Chiudi l’annuncio' : 'Riapri l’annuncio'}
                    </button>
                    <span className="text-sm text-slate-500">{localJob.isActive ? 'Chiudilo quando hai trovato chi cercavi: non riceverà più candidature.' : 'Torna visibile in bacheca, se non è scaduto.'}</span>
                </div>
            )}

            {/* CRM ADMIN: DASHBOARD CANDIDATI */}
            {isAdmin && (
                <div className="p-5 sm:p-8 bg-slate-800 border-b border-slate-700">
                    <h2 className="text-xl font-extrabold text-white mb-6 flex items-center gap-2">
                        <Icon type="users" className="w-6 h-6 text-blue-400" />
                        Candidature ricevute ({applicants.length})
                    </h2>
                    
                    {isLoadingApps ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-500 border-t-blue-400"></div>
                        </div>
                    ) : applicants.length === 0 ? (
                        <div className="bg-slate-700/50 rounded-2xl p-8 text-center border border-slate-600">
                            <Icon type="document" className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                            <p className="text-slate-300 font-bold">Nessuna candidatura ricevuta finora.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Candidati Premium in cima alla lista, come su LinkedIn. */}
                            {[...applicants].sort((a, b) => Number(isPremium(b.applicantProfile)) - Number(isPremium(a.applicantProfile))).map(app => {
                                const prof = app.applicantProfile;
                                if (!prof) return null;
                                const match = getSwimMatchAnalysis(prof, localJob);
                                
                                return (
                                    <div key={app.$id} className={`bg-white rounded-xl p-5 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center border-l-4 transition-all ${app.status === 'hired' || app.status === 'accepted' ? 'border-l-green-500 shadow-md' : app.status === 'rejected' ? 'border-l-red-500 opacity-70' : 'border-l-blue-500'}`}>
                                        <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto">
                                            <img src={prof.avatar || initialsAvatar(displayNameOf(prof))} className="w-14 h-14 rounded-full object-cover border border-slate-200" />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-slate-800 text-lg truncate flex items-center gap-1.5">{prof.firstName} {prof.lastName}{isPremium(prof) && <PremiumBadge label />}</p>
                                                <p className="text-xs text-slate-500 truncate mb-1.5">{prof.title || 'Professionista'}</p>
                                                <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${match.score >= 80 ? 'bg-green-100 text-green-700 border border-green-200' : match.score >= 50 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                                                    <Icon type="sparkles" className="w-3 h-3" /> {match.score}% SwimMatch
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-slate-100 sm:border-0 justify-end">
                                            <button 
                                                onClick={() => navigate(`/profile/${prof.userId || prof.$id}`)} 
                                                className="p-2.5 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-bold text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                title="Vedi passaporto"
                                            >
                                                Profilo
                                            </button>
                                            
                                            {(app.status === 'pending' || app.status === 'reviewed') && (
                                                <>
                                                    <button 
                                                        onClick={() => handleUpdateStatus(app.$id, 'rejected')} 
                                                        className="p-2.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                                        title="Scarta"
                                                    >
                                                        <Icon type="x" className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => setCandidateToHire({ appId: app.$id, applicantId: app.applicantId, applicantName: `${prof.firstName} ${prof.lastName}` })} 
                                                        className="p-2.5 px-4 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg transition-colors font-bold text-xs flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500 shadow-sm"
                                                    >
                                                        <Icon type="check-double" className="w-4 h-4" /> Assumi
                                                    </button>
                                                </>
                                            )}
                                            {(app.status === 'hired' || app.status === 'accepted') && <span className="text-green-700 text-xs font-extrabold flex items-center gap-1 bg-green-50 px-3 py-2 rounded-lg border border-green-200"><Icon type="check-double" className="w-4 h-4"/> Assunto nel Team!</span>}
                                            {app.status === 'rejected' && <span className="text-red-700 text-xs font-extrabold flex items-center gap-1 bg-red-50 px-3 py-2 rounded-lg border border-red-200"><Icon type="x" className="w-4 h-4"/> Scartato</span>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* DASHBOARD SWIMMATCH PREDITTIVO (Solo Utenti) */}
            {isProfessional && analysis && !isAdmin && (
                <div className="p-5 sm:p-8 bg-blue-50/30 border-b border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                                <Icon type="sparkles" className="w-6 h-6 text-blue-600" />
                                SwimMatch™ Analysis
                            </h2>
                            <p className="text-sm text-slate-500 font-medium">Abbiamo confrontato il tuo profilo con questo annuncio.</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl text-white font-extrabold text-lg shadow-sm ${analysis.score >= 80 ? 'bg-green-500' : analysis.score >= 50 ? 'bg-amber-500' : 'bg-slate-500'}`}>
                            {analysis.score}% Match
                        </div>
                    </div>
                    
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-6 overflow-hidden">
                        <div className={`h-full transition-all duration-1000 ${analysis.score >= 80 ? 'bg-green-500' : analysis.score >= 50 ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${analysis.score}%` }}></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white border border-green-200 p-4 rounded-xl shadow-sm">
                            <h4 className="font-bold text-green-700 mb-3 flex items-center gap-2"><Icon type="check-double" className="w-4 h-4" /> I tuoi punti di forza</h4>
                            <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5">
                                {analysis.met.length > 0 ? analysis.met.map((m, i) => <li key={i}>{m}</li>) : <li>Nessun match diretto rilevato</li>}
                            </ul>
                        </div>
                        <div className="bg-white border border-amber-200 p-4 rounded-xl shadow-sm">
                            <h4 className="font-bold text-amber-700 mb-3 flex items-center gap-2"><Icon type="info" className="w-4 h-4" /> Requisiti mancanti</h4>
                            <ul className="list-disc list-inside text-sm text-slate-700 space-y-1.5">
                                {analysis.missing.length > 0 ? analysis.missing.map((m, i) => <li key={i}>{m}</li>) : <li>Soddisfi tutti i requisiti richiesti!</li>}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Descrizione */}
            <div className="p-5 sm:p-8">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Icon type="info" className="w-5 h-5 text-blue-600" /> Descrizione del Lavoro
                </h2>
                <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-[15px]">{localJob.description}</div>
            </div>

            {/* Requisiti e Qualifiche */}
            <div className={`p-5 sm:p-8 border-t border-slate-100 bg-slate-50/50 grid grid-cols-1 ${(localJob.qualificationsRequired && localJob.qualificationsRequired.length > 0) ? 'md:grid-cols-2 gap-8' : ''}`}>
                {localJob.requirements && localJob.requirements.length > 0 && (
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Icon type="check-double" className="w-5 h-5 text-green-600" /> Requisiti</h2>
                        <ul className="space-y-3">
                            {localJob.requirements.map((req: string, i: number) => (
                                <li key={i} className="flex items-start text-slate-700 text-[15px]"><div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-2 mr-3 flex-shrink-0"></div><span>{req}</span></li>
                            ))}
                        </ul>
                    </div>
                )}
                {localJob.qualificationsRequired && localJob.qualificationsRequired.length > 0 && (
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><Icon type="certificate" className="w-5 h-5 text-amber-500" /> Brevetti richiesti</h2>
                        <ul className="space-y-3">
                            {localJob.qualificationsRequired.map((qual: string, i: number) => (
                                <li key={i} className="flex items-start text-slate-700 text-[15px]"><Icon type="star" className="w-4 h-4 text-amber-400 mt-0.5 mr-2 flex-shrink-0" /><span className="font-medium">{qual}</span></li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
            
            {/* Info Struttura */}
            {structure && !isAdmin && (
                <div className="p-5 sm:p-8 border-t border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <Icon type="building" className="w-5 h-5 text-blue-600" />
                        L'azienda
                    </h2>
                    <p className="text-slate-700 mb-6 leading-relaxed text-[15px]">
                        {structure.bio || 'La struttura non ha inserito una descrizione aziendale.'}
                    </p>
                </div>
            )}

            {/* BOTTONE AZIONE (Bottom Nav per Mobile) */}
            {!isAdmin && (
                <div className="fixed md:absolute bottom-16 md:bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 md:border-none md:bg-slate-50 md:p-6 z-30 flex gap-3">
                    <button
                        onClick={() => toggleSaved('job', localJob.$id)}
                        aria-pressed={isSaved('job', localJob.$id)}
                        aria-label={isSaved('job', localJob.$id) ? 'Rimuovi dai salvati' : 'Salva offerta'}
                        className="flex-shrink-0 w-14 rounded-2xl border border-slate-200 bg-white text-corsia-700 hover:bg-piastrella flex items-center justify-center"
                    >
                        <Icon type="bookmark" className={`w-6 h-6 ${isSaved('job', localJob.$id) ? 'fill-corsia-200' : ''}`} />
                    </button>
                    <div className="flex-1">
                    {!localJob.isActive && !hasApplied ? (
                        <button 
                            disabled
                            className="w-full text-center text-white font-bold text-lg py-3.5 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 bg-slate-400 cursor-not-allowed opacity-90"
                        >
                            <Icon type="lock-closed" className="w-5 h-5" /> Posizione chiusa
                        </button>
                    ) : hasApplied ? (
                        <button 
                            disabled
                            className="w-full text-center text-white font-bold text-lg py-3.5 px-6 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 bg-green-600 cursor-not-allowed opacity-90"
                        >
                            <Icon type="check-double" className="w-6 h-6" /> Candidatura inviata
                        </button>
                    ) : (
                        <button 
                            onClick={() => onApply(localJob)} 
                            className="w-full text-center text-white font-bold text-lg py-3.5 px-6 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/30 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        >
                            <Icon type="send" className="w-5 h-5" /> Candidati
                        </button>
                    )}
                    </div>
                </div>
            )}

            {/* 💡 MODALE CUSTOM CONFERMA ASSUNZIONE */}
            {candidateToHire && (
                <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Icon type="check-double" className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Assumi il candidato</h3>
                            <p className="text-slate-500 text-sm mb-6">
                                Sei sicuro di voler assumere ufficialmente <strong>{candidateToHire.applicantName}</strong> per questa posizione?
                                <br/><br/>
                                L'annuncio verrà chiuso e il candidato sarà aggiunto direttamente al tuo Team.
                            </p>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setCandidateToHire(null)} 
                                    className="flex-1 font-bold text-slate-600 bg-slate-100 py-3 rounded-xl hover:bg-slate-200 transition outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                                >
                                    Annulla
                                </button>
                                <button 
                                    onClick={confirmHireCandidate} 
                                    className="flex-1 font-bold text-white bg-green-600 py-3 rounded-xl hover:bg-green-700 transition shadow-md outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                                >
                                    Assumi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};