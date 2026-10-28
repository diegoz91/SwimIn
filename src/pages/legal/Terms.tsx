import React from 'react';
import { Link } from 'react-router';
import { LEGAL } from '@/config/legal';
import { LegalPage } from './LegalPage';
import { BETA_TERMS } from '@/features/beta/betaConsent';

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
                title: 'Fase di test',
                body: (
                    <>
                        <p>Fino al lancio SwimIn è in fase di test, aperta solo alle persone invitate. Entrando accetti anche queste condizioni:</p>
                        <ul>
                            {BETA_TERMS.map((t) => (
                                <li key={t.title}><strong>{t.title}.</strong> {t.text}</li>
                            ))}
                        </ul>
                    </>
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
                            Diritto di recesso: hai 14 giorni dalla sottoscrizione per recedere senza dare motivi con il pulsante
                            «Recedi qui dal contratto» nella pagina <Link to="/premium">Premium</Link> (oppure scrivendo a {LEGAL.contactEmail}).
                            Dopo la conferma («Conferma recesso») ricevi una ricevuta con data e ora. Iniziando a usare subito le funzioni Premium
                            accetti che il servizio sia erogato prima della scadenza di questo termine; in caso di recesso Premium si chiude subito ed
                            è rimborsata la parte di periodo non goduta, entro 14 giorni, con lo stesso metodo di pagamento.
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
                title: 'Segnalazioni, rimozioni e punto di contatto',
                body: (
                    <ul>
                        <li>Puoi segnalare contenuti o profili che violano questi termini o la legge con la funzione «Segnala»: chi esamina la segnalazione è una persona dello staff, non un sistema automatico, e ti comunichiamo l'esito.</li>
                        <li>Se rimuoviamo un tuo contenuto o sospendiamo il tuo account ti spieghiamo perché: la regola violata, il contenuto interessato, la motivazione e come contestare la decisione. La ricevi nell'app e per email.</li>
                        <li>Puoi contestare una decisione rispondendo con «Scrivici» o scrivendo a {LEGAL.contactEmail}; la riesaminiamo con una persona diversa quando possibile. Restano disponibili gli organismi di risoluzione extragiudiziale delle controversie e l'autorità giudiziaria.</li>
                        <li>Punto di contatto unico per utenti e autorità (Regolamento UE 2022/2065, Digital Services Act, art. 11 e 12): {LEGAL.contactEmail}, in italiano o in inglese.</li>
                    </ul>
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
