import type { ProfileStats } from '@/services/database';
import type { StructureProfile, UserProfile } from '@/types/types';

export interface StatsTip { id: string; title: string; text: string; to: string; action: string }

/** Variazione percentuale rispetto al periodo precedente (null se prima non c'era nulla). */
export const changeOf = (current: number, previous: number): number | null => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null);

/**
 * "Cosa puoi fare": fino a 3 consigli concreti, dal più utile, ricavati dal profilo e dalle
 * statistiche degli ultimi 30 giorni. Ogni consiglio porta all'azione giusta.
 */
export function statsTips(profile: UserProfile | StructureProfile, s: ProfileStats, max = 3): StatsTip[] {
    const tips: StatsTip[] = [];
    const structure = profile.userType === 'structure';
    const enthusiast = !structure && profile.personType === 'enthusiast';

    const photo = structure ? profile.logo : profile.avatar;
    const headline = structure ? profile.structureType : profile.title;
    if (!photo || !headline || !profile.bio || !profile.province) {
        const missing = [!photo && (structure ? 'il logo' : 'la foto'), !headline && (structure ? 'il tipo di struttura' : 'la qualifica'), !profile.bio && 'la presentazione', !profile.province && 'la provincia'].filter(Boolean);
        tips.push({ id: 'profilo', title: 'Completa il profilo', text: `${missing.length === 1 ? 'Manca' : 'Mancano'} ${missing.join(', ')}: i profili completi compaiono prima nelle ricerche e vengono aperti più spesso.`, to: '/profile', action: 'Completa il profilo' });
    }

    // Compare nelle ricerche ma pochi aprono il profilo: conta la prima impressione.
    if (s.searchesLast30 >= 5 && s.viewsLast30 < s.searchesLast30 / 4) {
        tips.push({ id: 'impressione', title: 'Fatti aprire da chi ti trova', text: `Sei comparso in ${s.searchesLast30} ricerche ma pochi hanno aperto il profilo: una foto chiara e ${structure ? 'un tipo di struttura preciso' : 'una qualifica precisa (es. "Istruttore FIN nuoto bambini")'} fanno la differenza.`, to: '/profile', action: 'Modifica il profilo' });
    }

    if (structure) {
        const open = s.jobs.filter((j) => j.isActive);
        if (open.length === 0) {
            tips.push({ id: 'annuncio', title: 'Pubblica un annuncio', text: 'Non hai annunci aperti: chi ha un avviso di lavoro adatto riceve una notifica appena pubblichi.', to: '/jobs/annunci', action: 'Pubblica un annuncio' });
        }
        const weak = open.find((j) => j.viewers >= 10 && j.applications === 0);
        if (weak) {
            tips.push({ id: `annuncio-${weak.id}`, title: 'Rivedi un annuncio', text: `"${weak.title}" è stato aperto da ${weak.viewers} persone ma nessuno si è candidato: indica compenso, orari e requisiti essenziali.`, to: `/jobs/${weak.id}`, action: 'Apri l’annuncio' });
        }
        const waiting = s.jobs.reduce((n, j) => n + j.newApplications, 0);
        if (waiting > 0) {
            tips.push({ id: 'candidature', title: 'Rispondi alle candidature', text: waiting === 1 ? 'C’è una candidatura nuova da leggere: rispondere presto aumenta le probabilità di assumere.' : `Ci sono ${waiting} candidature nuove da leggere: rispondere presto aumenta le probabilità di assumere.`, to: '/jobs/annunci', action: 'Vai agli annunci' });
        }
    }

    if (s.postsLast30 === 0) {
        tips.push({ id: 'post', title: 'Pubblica un post', text: structure ? 'Racconta corsi, orari o novità della piscina: i post portano visite al profilo e candidature.' : 'Condividi un allenamento, un corso o un brevetto appena preso: chi pubblica riceve più visite.', to: '/', action: 'Scrivi un post' });
    }

    const change = changeOf(s.viewsLast30, s.previous.views);
    if (change !== null && change <= -30 && !tips.some((t) => t.id === 'post')) {
        tips.push({ id: 'calo', title: 'Le visite sono calate', text: `${Math.abs(change)}% di visite in meno rispetto ai 30 giorni prima: aggiorna disponibilità ed esperienze o pubblica qualcosa di nuovo.`, to: '/profile', action: 'Aggiorna il profilo' });
    }

    if (!structure && !profile.publicProfile) {
        tips.push({ id: 'pubblico', title: 'Rendi pubblico il profilo', text: 'Con il profilo pubblico puoi condividere il link e farti trovare anche da chi non è ancora su SwimIn.', to: '/profile?tab=impostazioni&sezione=privacy', action: 'Apri le impostazioni' });
    }

    if (!structure && !enthusiast && !profile.availableForEmergencies) {
        tips.push({ id: 'sos', title: 'Accetta le sostituzioni urgenti', text: 'Chi è disponibile per gli SOS riceve le richieste delle piscine vicine: è il modo più veloce per farsi conoscere.', to: '/profile', action: 'Indica la disponibilità' });
    }

    return tips.slice(0, max);
}
