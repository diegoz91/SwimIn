import React from 'react';
import { Link } from 'react-router';
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
                        <li><strong>Curriculum vitae</strong> (facoltativo): il PDF che carichi è visibile solo a te; quando ti candidi allegandolo, la struttura che gestisce l'annuncio riceve una copia, che viene eliminata se ritiri la candidatura o elimini l'account.</li>
                        <li><strong>Contenuti</strong>: post, foto e video, commenti, consigli (“like”), annunci di lavoro, candidature e lettere di presentazione, partecipazione a eventi.</li>
                        <li><strong>Messaggi privati</strong> scambiati con altri utenti, visibili solo a mittente e destinatario.</li>
                        <li><strong>Accesso con Google</strong> (facoltativo): nome, email e foto dell'account Google, solo per creare l'account o farti entrare. Se colleghi Google Calendar, SwimIn usa il permesso del calendario solo per aggiungere o aggiornare i turni e gli eventi che scegli di salvare: non legge né cancella gli altri appuntamenti. Puoi scollegare Google da <em>Impostazioni › Accesso e sicurezza</em> o da myaccount.google.com. L'uso dei dati ricevuti dalle API di Google rispetta le Google API Services User Data Policy, inclusi i requisiti di uso limitato.</li>
                        <li><strong>Statistiche</strong>: quando visiti un profilo, apri un annuncio o un profilo compare tra i risultati di una tua ricerca, registriamo chi, cosa e il giorno. Chi riceve la visita vede solo i conteggi e, con Premium, chi l’ha visitato (salvo la navigazione anonima); le comparse nelle ricerche e le visualizzazioni degli annunci sono mostrate solo come numeri, mai con i nomi.</li>
                        <li><strong>Fase di test</strong>: data e versione delle condizioni accettate e, se ti sei iscritto con un invito, il codice usato (nei dati privati, mai sul profilo), per sapere chi ha accettato le condizioni e quanti posti di ogni invito sono stati usati.</li>
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
                            Il profilo e i post sono visibili agli altri utenti registrati. I messaggi privati e i loro allegati (foto e documenti) sono visibili solo ai
                            partecipanti alla conversazione; chi li invia può eliminarli per entrambi. Le candidature sono visibili a te e a chi gestisce l'annuncio. Le notifiche sono visibili solo a te.
                        </p>
                        <p>I dati sono trattati, in qualità di responsabili del trattamento, dai fornitori tecnici necessari al funzionamento del servizio:</p>
                        <ul>
                            <li><strong>Appwrite</strong> (autenticazione, database, archiviazione file, funzioni server).</li>
                            <li><strong>Vercel</strong> (pubblicazione dell'applicazione web).</li>
                            <li><strong>Google</strong> (solo se scegli l'accesso con Google o Google Calendar: autenticazione e salvataggio degli appuntamenti nel tuo calendario).</li>
                            <li><strong>Stripe</strong> e <strong>PayPal</strong> (pagamenti degli abbonamenti Premium, solo per chi si abbona: trattano i dati di pagamento come titolari autonomi; SwimIn conserva solo lo stato dell'abbonamento).</li>
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
                title: 'Come proteggiamo i dati',
                body: (
                    <ul>
                        <li>Le comunicazioni tra il tuo dispositivo, SwimIn e i nostri fornitori sono sempre cifrate (HTTPS/TLS).</li>
                        <li>Le password non sono mai visibili, nemmeno a noi: il fornitore di autenticazione ne conserva solo un'impronta cifrata. Puoi attivare la verifica in due passaggi.</li>
                        <li>Messaggi privati, allegati, CV, documenti dei brevetti, telefono e note interne delle candidature sono leggibili solo dalle persone autorizzate: i permessi sono controllati dal server per ogni singolo elemento. I file privati sono separati da quelli pubblici e, dove il fornitore lo consente, cifrati sul disco.</li>
                        <li>Le pagine dell'app possono caricare contenuti solo da SwimIn e dai nostri fornitori (Content Security Policy) e non possono essere incluse in altri siti.</li>
                        <li>Tentativi ripetuti e abusi sono limitati automaticamente; gli errori tecnici vengono registrati senza il contenuto dei messaggi.</li>
                        <li>Il personale di SwimIn ha solo gli accessi strettamente necessari (moderazione delle segnalazioni, verifica dei brevetti, assistenza) e ogni sua azione resta in un registro che non si può modificare. I messaggi privati non sono consultabili dal pannello di amministrazione.</li>
                    </ul>
                ),
            },
            {
                title: 'Per quanto tempo conserviamo i dati',
                body: (
                    <ul>
                        <li>I dati dell'account e del profilo per tutta la durata dell'account.</li>
                        <li>Se elimini l'account, cancelliamo profilo, post, commenti, consigli, candidature, collegamenti e notifiche; i messaggi già inviati restano visibili al destinatario, senza il collegamento al tuo profilo.</li>
                        <li>I registri tecnici di sicurezza per un periodo limitato, non superiore a 12 mesi salvo obblighi di legge; i registri degli errori dell'app per 30 giorni.</li>
                        <li>Le notifiche già lette per 90 giorni, le altre al massimo 12 mesi; le visite al profilo, le comparse nelle ricerche, le visualizzazioni degli annunci e i suggerimenti inviati con "Scrivici" (dopo che li abbiamo gestiti) per 12 mesi.</li>
                        <li>Le candidature (con il CV allegato e le valutazioni di chi seleziona) fino a 12 mesi dopo la chiusura dell'annuncio; le segnalazioni chiuse e la chat dello staff per 12 mesi; i turni di lavoro per 24 mesi.</li>
                        <li>La data in cui hai accettato Termini e Privacy, per tutta la durata dell'account.</li>
                        <li>
                            Non conserviamo i messaggi oltre la durata dell'account per eventuali richieste future. Solo se un'autorità giudiziaria o di polizia ci ordina
                            formalmente di conservarli, facciamo una copia cifrata dei dati indicati nell'ordine, che nessuno può leggere dal sistema: resta per il tempo
                            stabilito dall'ordine (di norma 60 giorni, prorogabili), viene consegnata solo all'autorità e poi cancellata.
                        </li>
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
