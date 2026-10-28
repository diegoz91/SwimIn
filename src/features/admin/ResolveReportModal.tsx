import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { Field, fieldClass } from '@/components/form/Field';
import { Select } from '@/components/form/Pickers';
import { MODERATION_GROUNDS, groundOf, type ModerationGround } from '@/data/moderation';
import type { AdminReport } from '@/services/database';

const EXPLANATION_MAX = 500;

/**
 * Rimozione o sospensione motivata: la regola violata e la spiegazione arrivano all'autore
 * (notifica e email) insieme a come contestare la decisione.
 */
export const ResolveReportModal: React.FC<{
    report: AdminReport | null;
    decision: 'remove' | 'suspend';
    busy: boolean;
    onClose: () => void;
    onConfirm: (motive: { ground: ModerationGround; explanation: string }) => void;
}> = ({ report, decision, busy, onClose, onConfirm }) => {
    const [ground, setGround] = useState<ModerationGround>('altro');
    const [explanation, setExplanation] = useState('');
    useEffect(() => {
        setGround(groundOf(report?.reason));
        setExplanation('');
    }, [report]);
    if (!report) return null;
    const suspend = decision === 'suspend';
    return (
        <FormModal
            open
            title={suspend ? `Sospendere ${report.target.authorName || 'l’autore'}?` : 'Rimuovere il contenuto?'}
            description="Indica la regola violata: l’autore riceve la motivazione nell’app e per email, con le istruzioni per contestarla."
            icon="shield"
            tone="danger"
            busy={busy}
            submitLabel={suspend ? 'Sospendi e invia la motivazione' : 'Rimuovi e invia la motivazione'}
            onClose={onClose}
            onSubmit={(e) => { e.preventDefault(); onConfirm({ ground, explanation: explanation.trim() }); }}
        >
            <div className="space-y-4">
                <Field id="resolve-ground" label="Regola violata">
                    <Select label="Regola violata" value={ground} onChange={(v) => setGround(v as ModerationGround)} options={Object.entries(MODERATION_GROUNDS).map(([value, label]) => ({ value, label }))} />
                </Field>
                <Field id="resolve-explanation" label="Motivazione per l’autore" optional count={{ value: explanation, max: EXPLANATION_MAX }} hint="Spiega in modo chiaro e rispettoso cosa non va: la legge chiede di indicare i fatti alla base della decisione.">
                    <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} maxLength={EXPLANATION_MAX} className={fieldClass(undefined, 'resize-y')} placeholder="Es. Il post pubblicizza più volte un servizio a pagamento estraneo al nuoto." />
                </Field>
                <p className="text-sm text-slate-600">
                    {suspend ? 'L’account non potrà più accedere.' : 'Il contenuto viene eliminato.'} Chi ha segnalato riceve l’esito, senza dettagli sull’altra persona.
                </p>
            </div>
        </FormModal>
    );
};
