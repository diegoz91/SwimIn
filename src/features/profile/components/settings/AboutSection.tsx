import React from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { APP_CONFIG } from '@/config/constants';
import { LEGAL } from '@/config/legal';
import { Group, Row, SectionHeader } from './ui';
import { openFeedback } from '@/features/feedback/Feedback';

const LINKS = [
    { to: '/termini', label: 'Termini di servizio', hint: 'Le regole per usare SwimIn.' },
    { to: '/privacy', label: 'Privacy policy', hint: 'Quali dati raccogliamo e perché.' },
    { to: '/cookie', label: 'Cookie policy', hint: 'Niente cookie pubblicitari o di profilazione.' },
];

/** Email di contatto solo quando è stata compilata in config/legal.ts (non i segnaposto tra parentesi). */
const contactEmail = /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/.test(LEGAL.contactEmail) ? LEGAL.contactEmail : null;

export const AboutSection: React.FC = () => (
    <>
        <SectionHeader title="Info e assistenza" description="Documenti legali, contatti e versione dell’app." />
        <div className="space-y-5">
            <Group title="Documenti">
                <ul className="divide-y divide-slate-100">
                    {LINKS.map((l) => (
                        <li key={l.to}>
                            <Link to={l.to} className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-piastrella/60 transition-colors outline-hidden focus-visible:bg-piastrella">
                                <span className="w-10 h-10 rounded-xl bg-piastrella text-corsia-700 grid place-items-center shrink-0" aria-hidden="true"><Icon type="document" className="w-5 h-5" /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-abisso">{l.label}</span>
                                    <span className="block text-sm text-slate-500">{l.hint}</span>
                                </span>
                                <Icon type="chevron-right" className="w-5 h-5 text-slate-400 shrink-0" />
                            </Link>
                        </li>
                    ))}
                </ul>
            </Group>

            <Group title="Suggerimenti e problemi">
                <button type="button" onClick={() => openFeedback()} className="w-full text-left flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-piastrella/60 transition-colors outline-hidden focus-visible:bg-piastrella">
                    <span className="w-10 h-10 rounded-xl bg-piastrella text-corsia-700 grid place-items-center shrink-0" aria-hidden="true"><Icon type="chat-bubble" className="w-5 h-5" /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-abisso">Scrivici dall’app</span>
                        <span className="block text-sm text-slate-500">Un’idea, qualcosa che non funziona o che non si capisce: arriva direttamente a noi.</span>
                    </span>
                    <Icon type="chevron-right" className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
            </Group>

            {contactEmail && (
                <Group title="Assistenza">
                    <Row
                        icon="mail"
                        title="Scrivici"
                        description={<>Per problemi con l’account, segnalazioni o richieste sui dati: <a href={`mailto:${contactEmail}?subject=${encodeURIComponent('Assistenza SwimIn')}`} className="font-semibold text-corsia-700 hover:underline break-all">{contactEmail}</a></>}
                    />
                </Group>
            )}

            <Group title="Informazioni">
                <Row icon="info" title="SwimIn" description={`Il network professionale del nuoto. Versione ${APP_CONFIG.version}.`} />
            </Group>
        </div>
    </>
);
