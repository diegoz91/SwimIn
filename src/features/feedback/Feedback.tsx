import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FormModal } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { useToast } from '@/context/ToastContext';
import { databaseService, type FeedbackKind } from '@/services/database';

const OPEN_EVENT = 'swimin:feedback';

/** Apre la finestra "Scrivici" da qualsiasi punto dell'app (menu, piè di pagina, impostazioni). */
export const openFeedback = (kind: FeedbackKind = 'idea') => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: kind }));

const KINDS: { value: FeedbackKind; label: string }[] = [
    { value: 'problema', label: 'Qualcosa non va' },
    { value: 'idea', label: 'Un’idea' },
    { value: 'altro', label: 'Altro' },
];
const PLACEHOLDER: Record<FeedbackKind, string> = {
    problema: 'Cosa stavi facendo e cosa è successo? Es. "Dal telefono il calendario dei turni non si apre."',
    idea: 'Cosa ti piacerebbe trovare su SwimIn? Es. "Poter esportare i miei turni in PDF."',
    altro: 'Scrivici quello che vuoi.',
};

/**
 * Finestra "Scrivici": suggerimenti e segnalazioni che arrivano agli amministratori
 * (Admin › Suggerimenti), con la pagina in cui ci si trova e il tipo di dispositivo.
 * Montata una volta nell'app (`FeedbackHost`), si apre con `openFeedback()`.
 */
export const FeedbackHost: React.FC = () => {
    const { pathname } = useLocation();
    const { showToast } = useToast();
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState<FeedbackKind>('idea');
    const [message, setMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const onOpen = (e: Event) => {
            setKind(((e as CustomEvent).detail as FeedbackKind) || 'idea');
            setError(null);
            setOpen(true);
        };
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_EVENT, onOpen);
    }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const text = message.trim();
        if (text.length < 10) return setError('Scrivi almeno qualche parola.');
        setBusy(true);
        try {
            await databaseService.sendFeedback(kind, text, pathname, navigator.userAgent);
            showToast(kind === 'problema' ? 'Grazie: lo guardiamo al più presto.' : 'Grazie del suggerimento: lo leggiamo tutti.', 'success');
            setMessage('');
            setOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Messaggio non inviato. Riprova.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal
            open={open}
            title="Scrivici"
            description="Lo leggono le persone che fanno SwimIn."
            icon="chat-bubble"
            submitLabel="Invia"
            busyLabel="Invio…"
            busy={busy}
            dirty={message.trim().length > 0}
            onClose={() => setOpen(false)}
            onSubmit={submit}
        >
            <div>
                <p className="text-sm font-semibold text-abisso mb-2">Di cosa si tratta</p>
                <ChoiceChips<FeedbackKind> label="Di cosa si tratta" options={KINDS} value={[kind]} onChange={(v) => setKind(v[0] || 'idea')} />
            </div>
            <Field id="feedback-message" label="Il tuo messaggio" error={error || undefined} count={{ value: message, max: 2000 }}>
                <textarea value={message} onChange={(e) => { setMessage(e.target.value); setError(null); }} rows={5} maxLength={2000} placeholder={PLACEHOLDER[kind]} className={fieldClass(error || undefined, 'resize-y')} />
            </Field>
            <p className="text-xs text-slate-500">Insieme al messaggio inviamo la pagina in cui sei ({pathname}) e il tipo di dispositivo, per capire meglio.</p>
        </FormModal>
    );
};
