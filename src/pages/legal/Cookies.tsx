import React from 'react';
import { LegalPage } from './LegalPage';

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
                    <ul>
                        <li><strong>Sessione di accesso</strong> (cookie e memoria locale del browser impostati da Appwrite): ti mantiene autenticato. Dura fino al logout o alla scadenza della sessione.</li>
                        <li><strong>Preferenze dell'interfaccia</strong> (memoria locale del browser): ad esempio quali avvisi hai già chiuso. Restano sul tuo dispositivo.</li>
                    </ul>
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
