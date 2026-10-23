/** Vocabolario del settore usato nei form (suggerimenti ed elenchi). */
import type { Certification } from '@/types/types';

export const PROFESSIONAL_ROLES = [
    'Istruttore di nuoto', 'Assistente bagnanti', 'Allenatore', 'Istruttore di acquafitness', 'Istruttore di acquaticità neonatale',
    'Coordinatore scuola nuoto', 'Direttore tecnico', 'Responsabile impianto', 'Preparatore atletico', 'Studente / in formazione',
];

export const STRUCTURE_TYPES = ['Piscina comunale', 'Centro sportivo', 'Società sportiva', 'Stabilimento balneare', 'Parco acquatico', 'Hotel / Spa', 'Centro di riabilitazione'];

export const EMPLOYMENT_TYPES = [
    { value: 'dipendente', label: 'Dipendente' },
    { value: 'collaborazione', label: 'Collaborazione sportiva' },
    { value: 'partita-iva', label: 'Libero professionista' },
    { value: 'stagionale', label: 'Stagionale' },
    { value: 'volontariato', label: 'Volontariato' },
    { value: 'tirocinio', label: 'Tirocinio' },
];
export const employmentLabel = (v?: string) => EMPLOYMENT_TYPES.find((e) => e.value === v)?.label || '';

export const CERT_CATEGORIES = [
    { value: 'salvamento', label: 'Salvamento' },
    { value: 'istruzione', label: 'Istruzione' },
    { value: 'allenamento', label: 'Allenamento' },
    { value: 'primo_soccorso', label: 'Primo soccorso' },
    { value: 'sicurezza', label: 'Sicurezza' },
    { value: 'specializzazione', label: 'Specializzazione' },
    { value: 'manutenzione', label: 'Impianti e acque' },
    { value: 'altro', label: 'Altro' },
] as const;

/** Accetta sia la chiave sia l'etichetta salvata dai dati vecchi. */
export const certCategoryKey = (v?: string) =>
    CERT_CATEGORIES.find((c) => c.value === v || c.label.toLowerCase() === (v || '').toLowerCase())?.value || (v ? 'altro' : '');
export const certCategoryLabel = (v?: string) => CERT_CATEGORIES.find((c) => c.value === certCategoryKey(v))?.label || v || '';

export const CERT_ISSUERS = [
    'FIN – Federazione Italiana Nuoto', 'FIN – Sezione Salvamento', 'Società Nazionale di Salvamento', 'Federazione Italiana Salvamento Acquatico',
    'Croce Rossa Italiana', 'IRC – Italian Resuscitation Council', 'American Heart Association', 'UISP', 'CSI', 'Libertas', 'AICS', 'CONI',
];

/** Brevetti più diffusi, per l'inserimento rapido; `years` = validità tipica. */
export const COMMON_CERTS: (Omit<Certification, 'expiry'> & { years?: number })[] = [
    { name: 'Brevetto Assistente Bagnanti', issuer: 'Società Nazionale di Salvamento', category: 'salvamento', years: 3 },
    { name: 'Brevetto Assistente Bagnanti', issuer: 'FIN – Sezione Salvamento', category: 'salvamento', years: 3 },
    { name: 'Istruttore di nuoto 1° livello', issuer: 'FIN – Federazione Italiana Nuoto', category: 'istruzione' },
    { name: 'Istruttore di nuoto 2° livello', issuer: 'FIN – Federazione Italiana Nuoto', category: 'istruzione' },
    { name: 'BLSD esecutore', issuer: 'IRC – Italian Resuscitation Council', category: 'primo_soccorso', years: 2 },
    { name: 'Allenatore di nuoto', issuer: 'FIN – Federazione Italiana Nuoto', category: 'allenamento' },
];
export const CERT_NAMES = Array.from(new Set([
    ...COMMON_CERTS.map((c) => c.name),
    'Istruttore di acquafitness', 'Istruttore di nuoto per disabili', 'Istruttore di acquaticità neonatale', 'Allenatore di pallanuoto',
    'Brevetto Assistente Bagnanti – acque libere', 'Operatore di primo soccorso aziendale', 'Addetto antincendio', 'Tecnico trattamento acque',
]));

export const POOL_SERVICES = [
    'Scuola nuoto', 'Nuoto libero', 'Acquaticità neonatale', 'Acquafitness', 'Agonismo', 'Nuoto master', 'Pallanuoto',
    'Nuoto artistico', 'Tuffi', 'Riabilitazione in acqua', 'Corsi per persone con disabilità', 'Corsi di salvamento', 'Subacquea',
];

export const POOL_SETTINGS = [
    { value: 'coperta', label: 'Coperta' },
    { value: 'scoperta', label: 'Scoperta' },
    { value: 'entrambe', label: 'Coperta e scoperta' },
] as const;
