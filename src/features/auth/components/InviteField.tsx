import React, { useEffect, useState } from 'react';
import { Field, fieldClass } from '@/components/form/Field';
import { useAppStatus } from '@/hooks/useAppStatus';
import { databaseService } from '@/services/database';
import { normalizeInvite, storedInvite } from '@/utils/invite';

/**
 * Codice di invito della fase di test: compare solo quando l'iscrizione è su invito, già compilato
 * se si arriva dal QR o dal link. `verify()` lo controlla sul server prima di creare l'account.
 */
export function useInvite() {
    const { status } = useAppStatus();
    const required = status.inviteOnly;
    const [code, setCode] = useState(storedInvite);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => setError(null), [code]);

    const verify = async (): Promise<boolean> => {
        if (!required) return true;
        const c = normalizeInvite(code);
        if (c.length < 6) {
            setError('Inserisci il codice di invito che hai ricevuto.');
            return false;
        }
        try {
            const res = await databaseService.checkInvite(c);
            if (!res.valid) setError('Codice non valido, scaduto o già usato da troppe persone.');
            return res.valid;
        } catch (err) {
            console.error('Controllo invito:', err);
            setError('Non siamo riusciti a controllare il codice. Riprova.');
            return false;
        }
    };

    return { required, code: normalizeInvite(code), setCode, error, setError, verify };
}

export const InviteField: React.FC<{ invite: ReturnType<typeof useInvite>; disabled?: boolean }> = ({ invite, disabled }) => {
    if (!invite.required) return null;
    return (
        <Field id="invite-code" label="Codice di invito" error={invite.error || undefined} hint="SwimIn è in fase di test: ci si iscrive con il codice ricevuto (è già compilato se hai usato il QR o il link).">
            <input
                value={invite.code}
                onChange={(e) => invite.setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="Es. K7M2Q9XA"
                maxLength={16}
                disabled={disabled}
                className={fieldClass(invite.error || undefined, 'uppercase tracking-widest')}
            />
        </Field>
    );
};
