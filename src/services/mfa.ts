import { AuthenticationFactor, AuthenticatorType } from 'appwrite';
import { account } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

/**
 * Verifica in due passaggi (TOTP con un'app come Google Authenticator, Authy, 1Password)
 * gestita da Appwrite: attivazione con QR, codici di recupero, verifica all'accesso.
 */
export async function mfaStatus(): Promise<{ enabled: boolean; totp: boolean }> {
    const [me, factors] = await Promise.all([account.get(), account.listMfaFactors()]);
    return { enabled: !!me.mfa, totp: !!factors.totp };
}

/** Avvia l'attivazione: segreto e indirizzo otpauth:// da mostrare come QR. */
export async function startTotpSetup(): Promise<{ secret: string; uri: string }> {
    const factors = await account.listMfaFactors();
    // Un'attivazione lasciata a metà: si ricomincia da capo.
    if (factors.totp) await account.deleteMfaAuthenticator(AuthenticatorType.Totp);
    const { secret, uri } = await account.createMfaAuthenticator(AuthenticatorType.Totp);
    return { secret, uri };
}

/** Conferma il primo codice, attiva la verifica e restituisce i codici di recupero. */
export async function confirmTotpSetup(code: string): Promise<string[]> {
    await account.updateMfaAuthenticator(AuthenticatorType.Totp, code.replace(/\s/g, ''));
    await account.updateMFA(true);
    const { recoveryCodes } = await account.createMfaRecoveryCodes();
    return recoveryCodes;
}

export async function disableTotp() {
    await account.updateMFA(false);
    await account.deleteMfaAuthenticator(AuthenticatorType.Totp);
}

export async function regenerateRecoveryCodes(): Promise<string[]> {
    const { recoveryCodes } = await account.updateMfaRecoveryCodes();
    return recoveryCodes;
}

/** All'accesso: crea la sfida (app o codice di recupero) e restituisce il suo id. */
export async function createLoginChallenge(useRecovery = false): Promise<string> {
    const challenge = await account.createMfaChallenge(useRecovery ? AuthenticationFactor.Recoverycode : AuthenticationFactor.Totp);
    return challenge.$id;
}

export async function completeLoginChallenge(challengeId: string, code: string) {
    await account.updateMfaChallenge(challengeId, code.replace(/\s/g, ''));
}

export const isMfaRequired = (err: unknown) => (err as { type?: string })?.type === 'user_more_factors_required';

/** QR dell'indirizzo otpauth://, generato da Appwrite e scaricato con la sessione. */
export async function totpQrUrl(uri: string): Promise<string> {
    const { jwt } = await account.createJWT();
    const res = await fetch(`${APPWRITE_CONFIG.endpoint}/avatars/qr?text=${encodeURIComponent(uri)}&size=240&margin=1`, {
        headers: { 'X-Appwrite-Project': APPWRITE_CONFIG.projectId, 'X-Appwrite-JWT': jwt },
    });
    if (!res.ok) throw new Error('QR non disponibile: usa la chiave qui sotto.');
    return URL.createObjectURL(await res.blob());
}
