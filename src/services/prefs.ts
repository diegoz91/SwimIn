import { account } from '@/services/appwrite';

/**
 * Preferenze private dell'account (Appwrite account prefs): le legge e scrive solo la persona,
 * seguono l'utente su tutti i dispositivi. Per piccoli stati personali dell'interfaccia,
 * mai per dati che altri devono vedere o che il server deve garantire.
 */
export interface AccountPrefs {
    /** Candidature con assunzione già annunciate in home (l'avviso compare una volta sola). */
    hiredSeen?: string[];
}

export async function getPrefs(): Promise<AccountPrefs> {
    try {
        return (await account.getPrefs()) as unknown as AccountPrefs;
    } catch (err) {
        console.warn('Preferenze dell’account:', err);
        return {};
    }
}

/** Aggiorna alcune chiavi lasciando le altre come sono. */
export async function patchPrefs(patch: Partial<AccountPrefs>): Promise<void> {
    const current = await getPrefs();
    await account.updatePrefs({ prefs: { ...current, ...patch } });
}
