import React, { useEffect, useState } from 'react';
import { FormModal } from '@/components/form/FormModal';
import { ChoiceChips, Field, fieldClass } from '@/components/form/Field';
import { DatePicker, TimePicker } from '@/components/form/Pickers';
import { Icon } from '@/components/ui/Icon';
import { AddToCalendar } from '@/components/common/AddToCalendar';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { addDaysISO, formatDate, isValidISODate, todayISO } from '@/utils/dates';
import type { Application } from '@/types/types';

type Mode = 'presenza' | 'video' | 'telefono';
export const MODE_LABEL: Record<Mode, string> = { presenza: 'In presenza', video: 'Videochiamata', telefono: 'Telefono' };
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const plusHour = (t: string) => { const [h, m] = t.split(':').map(Number); const x = Math.min(h * 60 + m + 60, 23 * 60 + 59); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

/** Il colloquio come appuntamento di calendario (un'ora). */
export const interviewEvent = (a: Application, title: string, location?: string) => ({
    uid: `colloquio-${a.$id}`,
    title,
    date: a.interviewDate as string,
    start: a.interviewTime as string,
    end: plusHour(a.interviewTime as string),
    location: location || a.interviewPlace || (a.interviewMode ? MODE_LABEL[a.interviewMode] : ''),
    description: a.interviewMessage || 'Colloquio fissato su SwimIn.',
});

export const interviewChip = (a: Application) =>
    a.interviewStatus === 'accepted'
        ? { text: 'Colloquio confermato', cls: 'bg-cloro-50 text-cloro-800 border-cloro-200' }
        : a.interviewStatus === 'reschedule'
          ? { text: 'Chiede un altro orario', cls: 'bg-amber-50 text-amber-900 border-amber-200' }
          : a.interviewStatus === 'proposed'
            ? { text: 'Colloquio proposto', cls: 'bg-corsia-50 text-corsia-800 border-corsia-200' }
            : null;

/** La struttura propone (o ripropone) data, ora, modalità e luogo del colloquio. */
export const InterviewModal: React.FC<{ application: Application | null; candidateName: string; onClose: () => void; onSaved: (a: Application) => void }> = ({ application, candidateName, onClose, onSaved }) => {
    const { showToast } = useToast();
    const [v, setV] = useState({ date: '', time: '', mode: 'presenza' as Mode, place: '', message: '' });
    const [errors, setErrors] = useState<Partial<Record<'date' | 'time' | 'place', string>>>({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!application) return;
        setV({
            date: application.interviewDate && application.interviewDate >= todayISO() ? application.interviewDate : addDaysISO(todayISO(), 2),
            time: application.interviewTime || '10:00',
            mode: (application.interviewMode as Mode) || 'presenza',
            place: application.interviewPlace || '',
            message: '',
        });
        setErrors({});
    }, [application]);

    if (!application) return null;
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const err: typeof errors = {};
        if (!isValidISODate(v.date) || v.date < todayISO()) err.date = 'Scegli una data da oggi in poi.';
        if (!validTime(v.time)) err.time = 'Indica l’orario.';
        if (v.mode === 'presenza' && v.place.trim().length < 3) err.place = 'Indica dove si terrà il colloquio.';
        if (v.mode === 'video' && v.place.trim() && !/^https:\/\//.test(v.place.trim())) err.place = 'Il link deve iniziare con https://';
        setErrors(err);
        if (Object.keys(err).length) return;
        setBusy(true);
        try {
            const saved = await databaseService.proposeInterview({ applicationId: application.$id, date: v.date, time: v.time, mode: v.mode, place: v.place.trim(), message: v.message.trim() });
            showToast(`Proposta inviata: ${candidateName} riceve una notifica e può confermare.`, 'success');
            onSaved(saved);
            onClose();
        } catch (er) {
            showToast(er instanceof Error ? er.message : 'Proposta non inviata.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal open title={application.interviewStatus ? 'Proponi un altro orario' : `Proponi un colloquio a ${candidateName}`} icon="calendar" submitLabel="Invia la proposta" busy={busy} onClose={onClose} onSubmit={submit}>
            {application.interviewStatus === 'reschedule' && application.interviewReply && (
                <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{candidateName} ha scritto: «{application.interviewReply}»</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="iv-date" label="Data" error={errors.date}>
                    <DatePicker label="Data del colloquio" min={todayISO()} max={addDaysISO(todayISO(), 120)} value={v.date} onChange={(d) => setV({ ...v, date: d })} />
                </Field>
                <Field id="iv-time" label="Ora" error={errors.time}>
                    <TimePicker label="Ora del colloquio" value={v.time} onChange={(t) => setV({ ...v, time: t })} />
                </Field>
            </div>
            <div>
                <p className="text-sm font-semibold text-abisso mb-2">Modalità</p>
                <ChoiceChips<Mode> label="Modalità" options={(Object.keys(MODE_LABEL) as Mode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} value={[v.mode]} onChange={(x) => setV({ ...v, mode: x[0] || 'presenza' })} />
            </div>
            <Field id="iv-place" label={v.mode === 'presenza' ? 'Dove' : v.mode === 'video' ? 'Link della videochiamata' : 'Note per la chiamata'} optional={v.mode !== 'presenza'} error={errors.place}>
                <input value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} maxLength={300} placeholder={v.mode === 'presenza' ? 'Es. Reception della piscina, via Lido 1' : v.mode === 'video' ? 'https://meet…' : 'Es. Ti chiamiamo noi al numero del profilo'} className={fieldClass(errors.place)} />
            </Field>
            <Field id="iv-msg" label="Messaggio" optional>
                <textarea value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} rows={3} maxLength={500} placeholder="Es. Porta il brevetto originale, faremo anche una prova in acqua." className={fieldClass(undefined, 'resize-y')} />
            </Field>
        </FormModal>
    );
};

/**
 * Il colloquio visto dal candidato: data, modalità e luogo, con Confermo / Chiedo un altro
 * orario; una volta confermato si aggiunge al calendario.
 */
export const InterviewCard: React.FC<{ application: Application; jobTitle: string; structureName?: string; onChanged: (a: Application) => void }> = ({ application: a, jobTitle, structureName, onChanged }) => {
    const { showToast } = useToast();
    const [asking, setAsking] = useState(false);
    const [reply, setReply] = useState('');
    const [busy, setBusy] = useState(false);
    if (!a.interviewStatus || !a.interviewDate || !a.interviewTime) return null;
    const chip = interviewChip(a);

    const respond = async (accept: boolean) => {
        if (!accept && reply.trim().length < 3) return showToast('Scrivi quando saresti disponibile.', 'error');
        setBusy(true);
        try {
            const saved = await databaseService.respondInterview(a.$id, accept, reply.trim());
            showToast(accept ? 'Colloquio confermato: aggiungilo al calendario.' : 'Richiesta inviata: la struttura ti proporrà un altro orario.', 'success');
            setAsking(false);
            setReply('');
            onChanged(saved);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Risposta non inviata.', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-2xl border border-corsia-200 bg-corsia-50/50 p-4" aria-label="Colloquio">
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <Icon type="calendar" className="w-5 h-5 text-corsia-700" />
                <p className="font-semibold text-abisso first-letter:uppercase">{formatDate(a.interviewDate, 'weekday')}, ore {a.interviewTime}</p>
                {chip && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}</span>}
            </div>
            <p className="text-sm text-slate-700">
                {a.interviewMode ? MODE_LABEL[a.interviewMode] : 'Colloquio'}
                {a.interviewPlace ? <> · {a.interviewMode === 'video' && /^https:\/\//.test(a.interviewPlace) ? <a href={a.interviewPlace} target="_blank" rel="noopener noreferrer" className="font-semibold text-corsia-700 hover:underline break-all">link della videochiamata</a> : <span className="break-words">{a.interviewPlace}</span>}</> : null}
            </p>
            {a.interviewMessage && <p className="text-sm text-slate-600 mt-1 italic break-words">«{a.interviewMessage}»</p>}
            {a.interviewStatus === 'reschedule' && <p className="text-sm text-slate-600 mt-1">Hai chiesto un altro orario: «{a.interviewReply}». Ti avvisiamo appena la struttura risponde.</p>}

            {a.interviewStatus === 'proposed' && !asking && (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => respond(true)} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">Confermo</button>
                    <button type="button" disabled={busy} onClick={() => setAsking(true)} className="px-4 py-2 rounded-full text-sm font-semibold border border-slate-300 text-abisso hover:bg-white disabled:opacity-60">Chiedo un altro orario</button>
                </div>
            )}
            {asking && (
                <div className="mt-3 space-y-2">
                    <label htmlFor={`iv-reply-${a.$id}`} className="text-sm font-semibold text-abisso">Quando saresti disponibile?</label>
                    <textarea id={`iv-reply-${a.$id}`} value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={500} placeholder="Es. Giovedì dopo le 15 o venerdì mattina" className={fieldClass(undefined, 'resize-y')} />
                    <div className="flex gap-2">
                        <button type="button" disabled={busy} onClick={() => respond(false)} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">Invia</button>
                        <button type="button" onClick={() => setAsking(false)} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:bg-white">Annulla</button>
                    </div>
                </div>
            )}
            {a.interviewStatus === 'accepted' && (
                <div className="mt-3">
                    <AddToCalendar events={[interviewEvent(a, `Colloquio · ${jobTitle}${structureName ? ` · ${structureName}` : ''}`)]} filename="colloquio-swimin" label="Aggiungi al calendario" />
                </div>
            )}
        </section>
    );
};

/** Valutazione interna a stelle (0–5), con pulsanti radio accessibili. */
export const StarRating: React.FC<{ value: number; onChange?: (n: number) => void; size?: 'sm' | 'md'; label?: string }> = ({ value, onChange, size = 'md', label = 'Valutazione' }) => {
    const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-6 h-6';
    if (!onChange) {
        return (
            <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label}: ${value} su 5`}>
                {[1, 2, 3, 4, 5].map((n) => <Icon key={n} type="star" className={`${cls} ${n <= value ? 'text-amber-500' : 'text-slate-300'}`} />)}
            </span>
        );
    }
    return (
        <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} ${n === 1 ? 'stella' : 'stelle'}`} onClick={() => onChange(value === n ? 0 : n)} className="p-1 rounded-full hover:bg-amber-50 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500">
                    <Icon type="star" className={`${cls} ${n <= value ? 'text-amber-500' : 'text-slate-300'}`} />
                </button>
            ))}
        </div>
    );
};
