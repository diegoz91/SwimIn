import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL } from '@/config/legal';
import { LegalPage } from './LegalPage';

const Privacy: React.FC = () => (
    <LegalPage
        title="Privacy Policy"
        intro={
            <p>
                Questa informativa spiega come {LEGAL.serviceName} tratta i dati personali di chi usa la piattaforma, ai sensi del
                Regolamento (UE) 2016/679 (“GDPR”) e del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.
            </p>
        }
        sections={[
            {
                title: 'Titolare del trattamento',
                body: (
                    <>
                        <p>
                            {LEGAL.controllerName}, {LEGAL.controllerAddress}, {LEGAL.vatNumber}. Per qualsiasi richiesta sulla privacy
                            puoi scrivere a <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
                        </p>
                        {LEGAL.dpoEmail && <p>Responsabile della protezione dei dati (DPO): {LEGAL.dpoEmail}.</p>}
                    </>
                ),
            },
            {
                title: 'Quali dati trattiamo',
                body: (
                    <ul>
                        <li><strong>Dati dell'account</strong>: nome e cognome o nome della struttura, email, password (conservata solo in forma cifrata dal nostro fornitore di autenticazione).</li>
                        <li><strong>Dati del profilo</strong> che scegli di pubblicare: foto, qualifica, città, biografia, esperienze, brevetti e certificazioni con relative scadenze, competenze, disponibilità per sostituzioni urgenti.</li>
                        <li><strong>Contenuti</strong>: post, foto e video, commenti, consigli (“like”), annunci di lavoro, candidature e lettere di presentazione, partecipazione a eventi.</li>
                        <li><strong>Messaggi privati</strong> scambiati con altri utenti, visibili solo a mittente e destinatario.</li>
                        <li><strong>Dati tecnici</strong>: indirizzo IP, tipo di dispositivo e browser, data e ora di accesso, stato online, registri tecnici necessari alla sicurezza.</li>
                    </ul>
                ),
            },
            {
                title: 'Perché li trattiamo e su quale base giuridica',
                body: (
                    <ul>
                        <li><strong>Fornire il servizio</strong> (creare l'account, mostrare il profilo, permettere collegamenti, messaggi, candidature): esecuzione del contratto, art. 6.1.b GDPR.</li>
                        <li><strong>Sicurezza e prevenzione degli abusi</strong> (protezione degli account, gestione delle segnalazioni): legittimo interesse, art. 6.1.f GDPR.</li>
                        <li><strong>Comunicazioni di servizio</strong> (verifica email, recupero password, notifiche sull'attività): esecuzione del contratto.</li>
                        <li><strong>Obblighi di legge</strong> e richieste delle autorità: art. 6.1.c GDPR.</li>
                    </ul>
                ),
            },
            {
                title: 'Chi può vedere i tuoi dati',
                body: (
                    <>
                        <p>
                            Il profilo e i post sono visibili agli altri utenti registrati. I messaggi privati sono visibili solo ai partecipanti
                            alla conversazione. Le candidature sono visibili a te e a chi gestisce l'annuncio. Le notifiche sono visibili solo a te.
                        </p>
                        <p>I dati sono trattati, in qualità di responsabili del trattamento, dai fornitori tecnici necessari al funzionamento del servizio:</p>
                        <ul>
                            <li><strong>Appwrite</strong> (autenticazione, database, archiviazione file, funzioni server).</li>
                            <li><strong>Vercel</strong> (pubblicazione dell'applicazione web).</li>
                            <li><strong>UI Avatars</strong> (generazione dell'immagine con le iniziali quando non hai caricato una foto: riceve solo il nome da mostrare).</li>
                        </ul>
                        <p>Non vendiamo i tuoi dati e non li usiamo per pubblicità profilata.</p>
                    </>
                ),
            },
            {
                title: 'Trasferimenti fuori dall\'UE',
                body: (
                    <p>
                        Alcuni fornitori possono trattare dati al di fuori dello Spazio Economico Europeo. In questi casi il trasferimento avviene
                        sulla base di una decisione di adeguatezza della Commissione europea (es. EU-U.S. Data Privacy Framework) o delle Clausole
                        Contrattuali Standard. [Da verificare in base alla regione del progetto Appwrite e al piano Vercel scelti.]
                    </p>
                ),
            },
            {
                title: 'Per quanto tempo conserviamo i dati',
                body: (
                    <ul>
                        <li>I dati dell'account e del profilo per tutta la durata dell'account.</li>
                        <li>Se elimini l'account, cancelliamo profilo, post, commenti, consigli, candidature, collegamenti e notifiche; i messaggi già inviati restano visibili al destinatario, senza il collegamento al tuo profilo.</li>
                        <li>I registri tecnici di sicurezza per un periodo limitato, non superiore a 12 mesi salvo obblighi di legge.</li>
                    </ul>
                ),
            },
            {
                title: 'I tuoi diritti',
                body: (
                    <>
                        <p>
                            Puoi chiedere in qualsiasi momento l'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento,
                            la portabilità e opporti ai trattamenti basati sul legittimo interesse (artt. 15-22 GDPR). Molte di queste azioni sono
                            disponibili direttamente nell'app: modifica del profilo, eliminazione di post e commenti, eliminazione dell'account
                            dalle <strong>Impostazioni</strong>.
                        </p>
                        <p>
                            Per le altre richieste scrivi a <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. Hai inoltre il diritto di
                            proporre reclamo al Garante per la protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer">garanteprivacy.it</a>).
                        </p>
                    </>
                ),
            },
            {
                title: 'Minori',
                body: <p>Il servizio è destinato a persone che hanno compiuto 16 anni. Non raccogliamo consapevolmente dati di minori di questa età.</p>,
            },
            {
                title: 'Cookie e tecnologie simili',
                body: (
                    <p>
                        Usiamo solo strumenti tecnici necessari al funzionamento del servizio. I dettagli sono nella{' '}
                        <Link to="/cookie">Cookie Policy</Link>.
                    </p>
                ),
            },
            {
                title: 'Modifiche',
                body: <p>Se modifichiamo questa informativa in modo rilevante ti avviseremo nell'app o via email prima che le modifiche abbiano effetto.</p>,
            },
        ]}
    />
);

export default Privacy;
