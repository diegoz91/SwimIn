import type { GroupCategory, GroupPrivacy } from '@/types/types';

/** Categorie dei gruppi (allineate a GROUP_CATEGORIES in functions/api/src/groups.js). */
export const GROUP_CATEGORIES: { value: GroupCategory; label: string }[] = [
    { value: 'master', label: 'Nuoto master' },
    { value: 'istruttori', label: 'Istruttori' },
    { value: 'salvamento', label: 'Salvamento e bagnini' },
    { value: 'allenatori', label: 'Allenatori' },
    { value: 'appassionati', label: 'Appassionati' },
    { value: 'strutture', label: 'Gestori di piscine' },
    { value: 'territorio', label: 'Territorio' },
    { value: 'altro', label: 'Altro' },
];

export const GROUP_PRIVACY: { value: GroupPrivacy; label: string; description: string }[] = [
    { value: 'open', label: 'Aperto', description: 'Chiunque può entrare subito.' },
    { value: 'approval', label: 'Su approvazione', description: 'Un amministratore approva ogni richiesta.' },
];

export const groupCategoryLabel = (c?: string) => GROUP_CATEGORIES.find((x) => x.value === c)?.label || 'Altro';
