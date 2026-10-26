import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import type { Endorsement, UserProfile, StructureProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';
import { useConfirm } from '@/context/ConfirmContext';

const MAX_SKILLS = 20;
const MAX_SKILL_LENGTH = 60;

/** Suggerimenti specifici per il mondo del nuoto. */
export const SUGGESTED_SKILLS = [
    'Scuola nuoto bambini', 'Acquaticità neonatale', 'Nuoto agonistico', 'Nuoto master', 'Salvamento',
    'Primo soccorso BLSD', 'Aquagym', 'Acquafitness', 'Nuoto per persone con disabilità', 'Pallanuoto',
    'Nuoto artistico', 'Tuffi', 'Triathlon', 'Nuoto in acque libere', 'Preparazione atletica a secco',
    'Analisi video della tecnica', 'Idrokinesiterapia', 'Gestione impianti natatori', 'Trattamento acque', 'Organizzazione eventi',
];

interface SkillsSectionProps {
    profile: UserProfile;
    isOwnProfile: boolean;
    onProfileUpdated?: (profile: UserProfile) => void;
}

/**
 * Competenze del professionista con le conferme dei collegamenti, come gli
 * endorsement di LinkedIn: i colleghi possono confermare ciò che sai fare.
 */
export const SkillsSection: React.FC<SkillsSectionProps> = ({ profile, isOwnProfile, onProfileUpdated }) => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const profileId = profile.userId || profile.$id;
    const skills = useMemo(() => profile.skills || [], [profile.skills]);

    const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
    const [endorsers, setEndorsers] = useState<Record<string, UserProfile | StructureProfile>>({});
    const [isEditing, setIsEditing] = useState(false);
    const [newSkill, setNewSkill] = useState('');
    const [pending, setPending] = useState<string | null>(null);

    const isConnection = !!user && (user.connections || []).includes(profileId);

    const loadEndorsements = useCallback(async () => {
        try {
            const list = await databaseService.getEndorsements(profileId);
            setEndorsements(list);
            const ids = [...new Set(list.map((e) => e.endorserId))].slice(0, 100);
            const profiles = await databaseService.getConnectionsProfiles(ids);
            setEndorsers(Object.fromEntries(profiles.map((p) => [p.$id, p])));
        } catch (error) {
            console.warn('Conferme non disponibili:', error);
        }
    }, [profileId]);

    useEffect(() => {
        loadEndorsements();
    }, [loadEndorsements]);

    const bySkill = useMemo(() => {
        const map = new Map<string, Endorsement[]>();
        for (const e of endorsements) {
            if (!map.has(e.skill)) map.set(e.skill, []);
            map.get(e.skill)!.push(e);
        }
        return map;
    }, [endorsements]);

    // Le competenze più confermate in cima.
    const sortedSkills = useMemo(
        () => [...skills].sort((a, b) => (bySkill.get(b)?.length || 0) - (bySkill.get(a)?.length || 0)),
        [skills, bySkill]
    );

    const saveSkills = async (next: string[]) => {
        try {
            const updated = await databaseService.updateProfile(profileId, { skills: next });
            onProfileUpdated?.({ ...profile, ...updated } as UserProfile);
        } catch (error) {
            console.error('Salvataggio competenze:', error);
            showToast('Salvataggio non riuscito.', 'error');
        }
    };

    const addSkill = async (raw: string) => {
        const skill = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SKILL_LENGTH);
        if (!skill) return;
        if (skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
            showToast('Questa competenza è già presente.', 'info');
            return;
        }
        if (skills.length >= MAX_SKILLS) {
            showToast(`Puoi indicare al massimo ${MAX_SKILLS} competenze.`, 'error');
            return;
        }
        setNewSkill('');
        await saveSkills([...skills, skill]);
    };

    const removeSkill = async (skill: string) => {
        if ((bySkill.get(skill)?.length || 0) > 0 && !(await confirm({ title: `Rimuovere "${skill}"?`, message: 'Perderai anche le conferme ricevute.', confirmLabel: 'Rimuovi', tone: 'danger' }))) return;
        await saveSkills(skills.filter((s) => s !== skill));
    };

    const toggleEndorse = async (skill: string) => {
        if (!user) return;
        setPending(skill);
        try {
            const { endorsed } = await databaseService.toggleEndorsement(profileId, skill);
            showToast(endorsed ? `Hai confermato "${skill}".` : 'Conferma ritirata.', endorsed ? 'success' : 'info');
            await loadEndorsements();
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
        } finally {
            setPending(null);
        }
    };

    if (!isOwnProfile && skills.length === 0) return null;

    const suggestions = SUGGESTED_SKILLS.filter((s) => !skills.includes(s)).slice(0, 10);

    return (
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="skills-title">
            <div className="flex items-center justify-between mb-5">
                <h2 id="skills-title" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Icon type="star" className="w-6 h-6 text-blue-600" />
                    Competenze
                </h2>
                {isOwnProfile && (
                    <button
                        onClick={() => setIsEditing((v) => !v)}
                        data-html2canvas-ignore="true"
                        className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                    >
                        <Icon type={isEditing ? 'check' : 'pencil'} className="w-4 h-4" /> {isEditing ? 'Fatto' : 'Gestisci'}
                    </button>
                )}
            </div>

            {isOwnProfile && isEditing && (
                <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200" data-html2canvas-ignore="true">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            addSkill(newSkill);
                        }}
                        className="flex gap-2"
                    >
                        <label htmlFor="new-skill" className="sr-only">Nuova competenza</label>
                        <input
                            id="new-skill"
                            value={newSkill}
                            onChange={(e) => setNewSkill(e.target.value)}
                            maxLength={MAX_SKILL_LENGTH}
                            placeholder="Es. Scuola nuoto bambini"
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        />
                        <button type="submit" disabled={!newSkill.trim()} className="px-4 py-2.5 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50">
                            Aggiungi
                        </button>
                    </form>
                    {suggestions.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Suggerimenti</p>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.map((s) => (
                                    <button key={s} onClick={() => addSkill(s)} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700">
                                        + {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-slate-400 mt-3">{skills.length}/{MAX_SKILLS} competenze</p>
                </div>
            )}

            {skills.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <p className="text-slate-600 font-bold">Nessuna competenza indicata</p>
                    <p className="text-slate-500 text-sm mt-1">Aggiungi le tue specialità: i tuoi collegamenti potranno confermarle.</p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {sortedSkills.map((skill) => {
                        const list = bySkill.get(skill) || [];
                        const endorsedByMe = !!user && list.some((e) => e.endorserId === user.$id);
                        const faces = list.slice(0, 3).map((e) => endorsers[e.endorserId]).filter(Boolean);
                        return (
                            <li key={skill} className="py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-800">{skill}</p>
                                    {list.length > 0 && (
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="flex -space-x-2">
                                                {faces.map((p) => {
                                                    const name = p.userType === 'professional'
                                                        ? `${(p as UserProfile).firstName || ''} ${(p as UserProfile).lastName || ''}`.trim()
                                                        : (p as StructureProfile).structureName || '';
                                                    const avatar = (p.userType === 'professional' ? (p as UserProfile).avatar : (p as StructureProfile).logo) ||
                                                        initialsAvatar(name || 'U');
                                                    return (
                                                        <button key={p.$id} onClick={() => navigate(`/profile/${p.$id}`)} title={name} className="rounded-full">
                                                            <img src={avatar} alt={name} className="w-6 h-6 rounded-full border-2 border-white object-cover" />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <span className="text-xs text-slate-500 font-medium">
                                                {list.length} {list.length === 1 ? 'conferma' : 'conferme'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {!isOwnProfile && isConnection && (
                                    <button
                                        onClick={() => toggleEndorse(skill)}
                                        disabled={pending === skill}
                                        aria-pressed={endorsedByMe}
                                        data-html2canvas-ignore="true"
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-bold border transition disabled:opacity-60 ${
                                            endorsedByMe ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                                        }`}
                                    >
                                        {endorsedByMe ? '✓ Confermata' : 'Conferma'}
                                    </button>
                                )}
                                {isOwnProfile && isEditing && (
                                    <button onClick={() => removeSkill(skill)} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg" aria-label={`Rimuovi ${skill}`}>
                                        <Icon type="x" className="w-4 h-4" />
                                    </button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {!isOwnProfile && !isConnection && skills.length > 0 && (
                <p className="text-xs text-slate-500 mt-4">Collegati per poter confermare le sue competenze.</p>
            )}
        </section>
    );
};
