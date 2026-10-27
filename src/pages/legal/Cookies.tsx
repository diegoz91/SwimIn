import React from 'react';
import { LegalPage } from './LegalPage';

/** Elenco completo di ciò che SwimIn salva nel browser (tenerlo allineato al codice). */
const STORAGE: { what: string; name: string; where: string; duration: string; why: string }[] = [
    { what: 'Sessione di accesso', name: 'a_session_…', where: 'cookie di Appwrite', duration: 'fino al logout o alla scadenza della sessione', why: 'ti mantiene autenticato.' },
    { what: 'Sessione di riserva', name: 'cookieFallback', where: 'memoria locale', duration: 'fino al logout', why: 'la usa Appwrite solo se il browser blocca i suoi cookie, per non disconnetterti.' },
    { what: 'Tema', name: 'swimin-theme', where: 'memoria locale', duration: 'finché non lo cambi', why: 'ricorda se preferisci il tema chiaro o scuro.' },
    { what: 'Ordine del feed', name: 'swimin:feed', where: 'memoria locale', duration: 'finché non lo cambi', why: 'ricorda la scelta tra "Per te" e "Più recenti".' },
    { what: 'Ricerche recenti', name: 'swimin-recent-searches', where: 'memoria locale', duration: 'finché non le cancelli', why: 'ti propone le ultime ricerche fatte da questo dispositivo.' },
    { what: 'Avvisi già visti', name: 'swimin:hired-seen, swimin:push-prompt-dismissed, swimin:status-dismissed…', where: 'memoria locale e di sessione', duration: 'sul dispositivo o fino alla chiusura della scheda', why: 'non ti ripropone avvisi che hai già chiuso.' },
    { what: 'Passaggi in corso', name: 'swimin:google, swimin:offerta, swimin:chunk-reload', where: 'memoria di sessione o locale', duration: 'pochi minuti, poi vengono tolti', why: 'riportano alla pagina giusta dopo l\'accesso con Google, dopo l\'iscrizione da un\'offerta o dopo un aggiornamento dell\'app.' },
];

const Cookies: React.FC = () => (
    <LegalPage
        title="Cookie Policy"
        intro={
            <p>
                SwimIn usa esclusivamente cookie e strumenti di memorizzazione <strong>tecnici</strong>, necessari a farti accedere e a far
                funzionare il servizio. Non usiamo cookie di profilazione o pubblicitari, né strumenti di analisi di terze parti. Per questo,
                secondo le Linee guida del Garante (provv. 10 giugno 2021), non è richiesto il consenso preventivo.
            </p>
        }
        sections={[
            {
                title: 'Cosa memorizziamo',
                body: (
                    <>
                        <p>Tutto è tecnico e serve solo a te: nessun dato viene usato per pubblicità o profilazione.</p>
                        <ul>
                            {STORAGE.map((i) => (
                                <li key={i.name}>
                                    <strong>{i.what}</strong> (<code>{i.name}</code>, {i.where}, {i.duration}): {i.why}
                                </li>
                            ))}
                        </ul>
                    </>
                ),
            },
            {
                title: 'Pagamenti e Google',
                body: (
                    <p>
                        Se scegli di abbonarti a Premium vieni portato sulle pagine di Stripe o PayPal, che usano i propri cookie secondo le loro
                        informative. Se colleghi Google (accesso o calendario) passi dalle pagine di Google. SwimIn non inserisce i loro script nelle
                        proprie pagine.
                    </p>
                ),
            },
            {
                title: 'Contenuti di terze parti',
                body: (
                    <p>
                        SwimIn non carica caratteri, script o immagini da servizi di terze parti: font e avatar con le iniziali sono generati e
                        serviti dall'app stessa. Le foto caricate dagli utenti sono conservate sul nostro fornitore di archiviazione (Appwrite).
                    </p>
                ),
            },
            {
                title: 'Come gestirli',
                body: (
                    <p>
                        Puoi cancellare cookie e dati del sito dalle impostazioni del browser. Se lo fai verrai disconnesso e dovrai accedere di nuovo.
                    </p>
                ),
            },
        ]}
    />
);

export default Cookies;
