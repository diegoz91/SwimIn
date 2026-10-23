import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL } from '@/config/legal';
import { LegalPage } from './LegalPage';

const Terms: React.FC = () => (
    <LegalPage
        title="Termini di servizio"
        intro={
            <p>
                Questi termini regolano l'uso di {LEGAL.serviceName}, il social network professionale dedicato al mondo del nuoto,
                fornito da {LEGAL.controllerName}. Creando un account li accetti.
            </p>
        }
        sections={[
            {
                title: 'Il servizio',
                body: (
                    <p>
                        SwimIn permette a professionisti del nuoto e a strutture sportive di creare un profilo, collegarsi, scambiare messaggi,
                        pubblicare contenuti e annunci di lavoro e candidarsi. Il servizio è fornito “così com'è” e può evolvere nel tempo.
                    </p>
                ),
            },
            {
                title: 'Account',
                body: (
                    <ul>
                        <li>Devi avere almeno 16 anni e fornire dati veritieri.</li>
                        <li>Un account “Struttura” può essere creato solo da chi è autorizzato a rappresentare la struttura.</li>
                        <li>Sei responsabile della riservatezza della tua password e delle attività svolte con il tuo account.</li>
                    </ul>
                ),
            },
            {
                title: 'Brevetti, qualifiche e annunci',
                body: (
                    <>
                        <p>
                            Le qualifiche, i brevetti e le esperienze indicate nei profili sono dichiarate dagli utenti. SwimIn non ne verifica
                            l'autenticità salvo dove espressamente indicato. Le strutture sono tenute a verificare i titoli richiesti per legge
                            (es. brevetti di salvamento) prima di affidare un incarico.
                        </p>
                        <p>
                            Gli annunci di lavoro devono riguardare posizioni reali, rispettare la normativa sul lavoro e non contenere requisiti
                            discriminatori. SwimIn non è parte dei rapporti di lavoro tra utenti.
                        </p>
                    </>
                ),
            },
            {
                title: 'SwimIn Premium',
                body: (
                    <ul>
                        <li>
                            SwimIn è gratuito nel piano Base. Il piano Premium, a pagamento, aggiunge le funzioni descritte nella pagina{' '}
                            <Link to="/premium">SwimIn Premium</Link>, con i prezzi in vigore al momento dell'acquisto (IVA inclusa).
                        </li>
                        <li>La prova gratuita di 30 giorni è disponibile una sola volta per account e non richiede metodi di pagamento.</li>
                        <li>
                            L'abbonamento, mensile o annuale, si rinnova automaticamente alla scadenza con addebito sul metodo scelto (carta tramite
                            Stripe o PayPal), finché non viene disdetto. Puoi disdire in qualsiasi momento dalla pagina Premium: il rinnovo si ferma e
                            i vantaggi restano attivi fino alla fine del periodo già pagato.
                        </li>
                        <li>
                            Diritto di recesso: hai 14 giorni dall'acquisto per recedere scrivendo a {LEGAL.contactEmail}. Iniziando a usare subito
                            le funzioni Premium accetti che il servizio sia erogato prima della scadenza di questo termine; in caso di recesso è
                            rimborsata la parte di periodo non goduta.
                        </li>
                        <li>I dati di pagamento sono trattati direttamente da Stripe e PayPal: SwimIn non li riceve né li conserva.</li>
                        <li>Eliminando l'account, gli abbonamenti attivi vengono disdetti automaticamente.</li>
                    </ul>
                ),
            },
            {
                title: 'Contenuti degli utenti',
                body: (
                    <>
                        <p>
                            Resti titolare dei contenuti che pubblichi e concedi a SwimIn una licenza non esclusiva e gratuita a mostrarli agli
                            altri utenti per il funzionamento del servizio, fino alla loro eliminazione.
                        </p>
                        <p>Non è consentito pubblicare contenuti:</p>
                        <ul>
                            <li>illeciti, offensivi, discriminatori, violenti o che incitano all'odio;</li>
                            <li>che ritraggono minori senza il consenso di chi esercita la responsabilità genitoriale;</li>
                            <li>che violano diritti di terzi (immagine, privacy, diritto d'autore);</li>
                            <li>pubblicitari non richiesti o ingannevoli (spam, false offerte di lavoro).</li>
                        </ul>
                    </>
                ),
            },
            {
                title: 'Segnalazioni e sospensioni',
                body: (
                    <p>
                        Puoi segnalare contenuti o profili che violano questi termini. Possiamo rimuovere contenuti e sospendere o chiudere
                        account in caso di violazioni, informandoti quando possibile.
                    </p>
                ),
            },
            {
                title: 'Responsabilità',
                body: (
                    <p>
                        Nei limiti consentiti dalla legge, SwimIn non risponde dei contenuti pubblicati dagli utenti né dei rapporti che nascono
                        tra loro. Restano salvi i diritti inderogabili riconosciuti ai consumatori dal Codice del Consumo.
                    </p>
                ),
            },
            {
                title: 'Chiusura dell\'account',
                body: <p>Puoi eliminare il tuo account in qualsiasi momento dalle Impostazioni. Gli effetti sui dati sono descritti nella <Link to="/privacy">Privacy Policy</Link>.</p>,
            },
            {
                title: 'Legge applicabile',
                body: <p>Questi termini sono regolati dalla legge italiana. Per i consumatori è competente il foro del luogo di residenza o domicilio.</p>,
            },
            {
                title: 'Contatti',
                body: <p>Per domande scrivi a <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.</p>,
            },
        ]}
    />
);

export default Terms;
