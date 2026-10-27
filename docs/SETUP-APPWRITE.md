# Setup di Appwrite (ambiente di test)

Questa guida configura da zero il progetto Appwrite usato da SwimWaveUp:
database, permessi, storage e la Function `api`.

## 1. Requisiti

- Node.js 20 o superiore (`node -v`)
- Il repository aggiornato (`git pull`) e **`npm install` rieseguito** nella root dopo ogni pull che modifica `package.json`

## 2. API key (una volta sola)

1. Appwrite Console → il tuo progetto → **Overview → Integrations → API keys → Create API key**
2. Nome: `setup-script`. Per l'ambiente di test la cosa più semplice è **Select all**. In alternativa servono,
   in lettura e scrittura: **Auth** (`users.*`), **Database** (`databases.*`, `tables.*`, `columns.*`, `indexes.*`, `rows.*`),
   **Storage** (`buckets.*`, `files.*`) e **Functions** (`functions.*`, `execution.*`).
   Se ne manca uno lo script si ferma con `missing scopes (["..."])`: modifica la key e aggiungilo.

> Gli script usano l'API **TablesDB** di Appwrite 1.8+: nella console "tabelle/colonne/righe"
> corrispondono a "collezioni/attributi/documenti" delle versioni precedenti.
3. Copia `.env.setup.example` in `.env.setup` e incolla endpoint, project ID e la key.

> `.env.setup` è nel `.gitignore`: non va mai committato né condiviso in chat.

## 3. Reset (solo se vuoi ripartire da zero)

```bash
npm run reset-db -- --yes
```

Cancella database, bucket, Function e **tutti gli utenti**. Dopo il reset bisogna registrarsi di nuovo nell'app.

## 4. Setup

```bash
npm run setup-db
```

Lo script:

- crea le tabelle con **row security** attiva e permessi minimi;
- crea gli indici per le query più usate;
- crea i bucket `avatars` e `post_media` (lettura pubblica, modifica solo del proprietario), `certificates` e `chat_files` (privati: ogni file è leggibile solo da chi lo carica e, per gli allegati dei messaggi, dal destinatario);
- crea la Function **`api`** e ne carica il codice da `functions/api`.

Si può rilanciare in sicurezza: crea solo ciò che manca e riallinea i permessi.
Per aggiornare solo lo schema senza ricaricare la Function: `npm run setup-db -- --skip-function`.

## 5. Verifica della Function

Console → **Functions → SwimWaveUp API → Deployments**: l'ultimo deployment deve risultare **Ready**.
Se la build fallisce, apri il deployment e guarda il log di build.

Se la runtime `node-22` non fosse disponibile sul tuo piano, imposta in `.env.setup`:

```
APPWRITE_FUNCTION_RUNTIME=node-20.0
```

## 6. Frontend

- In locale: copia `.env.example` in `.env` e lancia `npm run dev`.
- Su Vercel: Project Settings → Environment Variables → `VITE_APPWRITE_ENDPOINT` e `VITE_APPWRITE_PROJECT_ID`.
- In Appwrite Console → **Overview → Platforms** aggiungi una piattaforma Web con i domini usati
  (`localhost`, il dominio di produzione Vercel e `*.vercel.app` per le preview), altrimenti il browser blocca le richieste (CORS).

## 7. Notifiche push ed email

- **Push.** Non serve nessun servizio esterno. Al primo `npm run setup-db` vengono generate le chiavi VAPID e salvate come variabili della Function (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
  - Non cancellarle: con chiavi nuove i dispositivi già registrati smettono di ricevere notifiche.
  - Ogni utente le attiva da *Impostazioni › Notifiche*, oppure dall'invito nella pagina Notifiche.
  - Su iPhone e iPad le push arrivano solo all'app aggiunta alla schermata Home (iOS 16.4 o successivo).
- **Email.**
  1. In Console → *Messaging → Providers* aggiungi un provider email (Brevo, Mailgun, SendGrid o SMTP) e verifica il dominio mittente.
  2. In `.env.setup` imposta `EMAIL_NOTIFICATIONS=on` e `APP_URL=https://il-tuo-dominio` (serve per i link nelle email).
  3. Rilancia `npm run setup-db`.

  Senza provider le email restano spente e nelle impostazioni compare solo la colonna Push.
- **Riepilogo settimanale.** Con le email attive, `setup-db` imposta sulla Function l'esecuzione programmata `0 6-18 * * 1` (lunedì, ogni ora dalle 6 alle 18 UTC) e un timeout di 120 secondi. Ogni esecuzione invia il riepilogo a 250 persone non ancora raggiunte nella settimana; chi non ha novità o l'ha disattivato non riceve nulla. Il risultato di ogni esecuzione è nei log della Function (*Functions → api → Executions*).
- **Cosa si riceve.** I valori predefiniti, modificabili da ogni utente per categoria:
  - push: tutte le categorie;
  - email: collegamenti, candidature e lavoro, SOS, avvisi;
  - messaggi: solo push.
- **SOS.** Una sostituzione urgente avvisa i professionisti della stessa provincia che hanno indicato disponibilità per quel giorno e quella fascia, al massimo 100 persone.

## 8. Profili pubblici e motori di ricerca

- `/u/:id` mostra la scheda pubblica anche senza account. Le strutture sono sempre pubbliche; le persone lo diventano solo attivando *Impostazioni › Privacy › Pagina pubblica del profilo*.
- Su Vercel le funzioni in `api/` generano le anteprime per WhatsApp, LinkedIn e Facebook, oltre a `sitemap.xml` e `robots.txt`. Usano le stesse variabili `VITE_APPWRITE_ENDPOINT` e `VITE_APPWRITE_PROJECT_ID` del frontend: non serve altro.
- La Function `api` è eseguibile anche dagli ospiti (`execute: any`). Senza login accetta solo le azioni pubbliche, che restituiscono dati non sensibili: niente email, telefono delle persone, post o messaggi.

## 9. Deploy automatico della Function

Vercel aggiorna il sito a ogni merge, ma **non** la Function `api` né lo schema del database. Se non si aggiornano, le funzioni nuove rispondono "Azione sconosciuta".

Per aggiornarli in automatico:

1. Aggiungi tre secret in GitHub → *Settings → Secrets and variables → Actions*:
   - `APPWRITE_ENDPOINT`
   - `APPWRITE_PROJECT_ID`
   - `APPWRITE_API_KEY` (la stessa chiave di `.env.setup`)
2. Facoltativo: aggiungi tra le *Variables* `APP_URL` ed `EMAIL_NOTIFICATIONS`.

Alla fine di ogni deploy `setup-db` chiama la Function con l'azione pubblica `health` e controlla che risponda la versione appena caricata; se non è così la attiva e, se ancora non risponde, il deploy fallisce. Su GitHub l'esito compare come annotazione, per esempio "Function api versione a4b2a9a26287 attiva sul progetto …57b3". Se il sito dice "Questa funzione è in aggiornamento" dopo un deploy riuscito, quasi sempre il sito (Vercel, `VITE_APPWRITE_PROJECT_ID`) e i secret di GitHub (`APPWRITE_PROJECT_ID`) puntano a progetti diversi: le ultime quattro cifre devono coincidere.

Da quel momento il workflow **Rilascio** (§15) lancia `npm run setup-db` a ogni merge che tocca `functions/api/` o `setup-db.js`, dopo che la verifica è passata, e aspetta che la build della Function sia pronta. Si può avviare anche a mano da *Actions → Rilascio → Run workflow*.

## 10. SwimIn Premium (pagamenti)

Senza configurazione Premium funziona già con la **prova gratuita** di 30 giorni e con l'**omaggio** da *Admin › Utenti*. Per incassare:

1. **Indirizzo della Function**: Console Appwrite → *Functions → api → Domains*, ad esempio `https://xxxx.fra.appwrite.run`. Mettilo in `FUNCTION_URL`: in `.env.setup` oppure tra le *Variables* di GitHub.
2. **Stripe** (carta, Apple Pay, Google Pay):
   - crea l'account su stripe.com;
   - da *Developers → API keys* copia la chiave segreta (`sk_test_…` per le prove, `sk_live_…` in produzione) in `STRIPE_SECRET_KEY` (in `.env.setup` o tra i secret di GitHub);
   - in *Settings → Billing → Customer portal* attiva il portale: serve per disdetta, cambio carta e fatture.
3. **PayPal**:
   - su developer.paypal.com → *Apps & Credentials* crea un'app (sandbox per le prove, live in produzione);
   - copia *Client ID* e *Secret* in `PAYPAL_CLIENT_ID` e `PAYPAL_SECRET`;
   - imposta `PAYPAL_MODE=live` quando passi alla produzione.
4. **Lancia `npm run setup-db`** (o il workflow *Rilascio*). Lo script:
   - crea su Stripe i 6 prezzi e su PayPal i 6 piani predefiniti: professionisti 4,99 €/mese o 47,90 €/anno, appassionati (Premium Passione) 1,99 €/mese o 19 €/anno, strutture 19 €/mese o 179 €/anno, tutti IVA inclusa;
   - registra i webhook verso `FUNCTION_URL/webhooks/stripe` e `/webhooks/paypal`;
   - salva tutto nelle variabili della Function.

   Si può rilanciare quante volte vuoi: non crea doppioni.

**Cambiare i prezzi**: da *Admin › Piani e prezzi* (solo amministratori). La Function salva il nuovo importo nella tabella `plans` e crea subito il nuovo prezzo su Stripe e il nuovo piano su PayPal (se un servizio non risponde, li crea al primo abbonamento). I nuovi prezzi valgono per chi si abbona da quel momento: gli abbonamenti già attivi restano al prezzo sottoscritto. I prezzi predefiniti, usati finché nessuno li cambia, stanno in `functions/api/src/billing.js` (`PRICES`).

**Cosa include il piano Base** (limiti verificati dalla Function, costanti in `billing.js`): strutture fino a 2 annunci attivi (gli SOS non contano) e area staff fino a 5 persone; avvisi di lavoro fino a 2 (10 con Premium); SOS solo nella provincia della struttura (con Premium anche nelle altre province della regione). Premium aggiunge inoltre candidature in cima, precedenza nelle liste d'attesa degli eventi, messaggi diretti a chi non è un collegamento (15 al mese per i professionisti, 5 per gli appassionati, 40 per le strutture), tutte le visite, statistiche e visite anonime.

## 11. Google (accesso con Gmail e Google Calendar)

Nell'app: **Continua con Google** su accesso e iscrizione; nelle impostazioni, in *Accesso e sicurezza*, **Collega Google**. Turni ed eventi si possono salvare in **Google Calendar**: con Google collegato vanno direttamente nel calendario della persona, altrimenti si apre Google Calendar con l'evento già compilato. Nessuna chiave sta nel codice: l'accesso passa da Appwrite.

1. **Google Cloud Console** (console.cloud.google.com), con un progetto dedicato a SwimIn:
   - *API e servizi → Libreria*: attiva **Google Calendar API**.
   - *Schermata consenso OAuth*: tipo *Esterno*, nome "SwimIn", logo, email di assistenza, dominio dell'app, link a `/privacy` e `/termini`. Ambiti: `openid`, `email`, `profile` e `.../auth/calendar.events`.
   - *Credenziali → Crea credenziali → ID client OAuth*, tipo *Applicazione web*. In **URI di reindirizzamento autorizzati** incolla l'indirizzo mostrato da Appwrite al passo 2 (simile a `https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/<ID progetto>`). Copia *ID client* e *Client secret*.
2. **Console Appwrite → Auth → Settings → OAuth2 Providers → Google**: attivalo e incolla *App ID* (l'ID client) e *App secret*. Da qui copi anche l'URI di reindirizzamento del passo 1.
3. **Console Appwrite → Overview → Platforms**: la piattaforma Web deve avere il dominio di produzione (es. `swimin.it`) e quello di Vercel. Google rimanda solo a domini registrati qui.
4. **Verifica dell'app su Google** (prima del lancio): l'accesso con nome ed email è disponibile subito dopo la verifica del brand. Il permesso del calendario (`calendar.events`) invece è un ambito *sensibile*: finché Google non approva l'app, chi lo concede vede l'avviso "app non verificata" e lo possono usare al massimo 100 persone. Avvia la verifica da *Schermata consenso OAuth → Pubblica app*; servono il video che mostra l'uso del calendario e la privacy policy che lo cita. Nel frattempo puoi impostare su Vercel `VITE_GOOGLE_CALENDAR_API=off`: Google Calendar resta disponibile con il link già compilato, senza chiedere il permesso.
5. Se al lancio Google non è ancora configurato, imposta su Vercel `VITE_GOOGLE_AUTH=off`: i pulsanti Google spariscono finché non lo togli.

Come funziona: il flusso è quello a token di Appwrite (`createOAuth2Token` → `/accesso/google` → `createSession`), quindi funziona anche se Appwrite e l'app stanno su domini diversi e con i browser che bloccano i cookie di terze parti. Al primo accesso con Google l'account esiste già (email verificata da Google) ma manca il profilo: la pagina `/completa-account` chiede il tipo di account e i termini. Se l'email è la stessa di un account già registrato con password, Appwrite collega Google a quell'account. Chi si è iscritto solo con Google può impostare una password da *Accesso e sicurezza*. Gli eventi in Google Calendar hanno un id fisso (turno o evento SwimIn): salvarli di nuovo li aggiorna, senza doppioni.

## 12. Monitoraggio, prova reale e manutenzione

**Avvisi di errore.** Ogni errore del server (Function) e dell'app viene registrato in *Admin › Errori*,
raggruppato per tipo. Al primo errore di un tipo nuovo (al massimo uno all'ora per tipo) gli utenti con
l'etichetta `admin` ricevono una notifica `system_alert` (anche push ed email, secondo le loro preferenze).
Facoltativo: un canale esterno.
- Slack o Discord: crea un webhook in arrivo e salvalo nel secret GitHub `ALERT_WEBHOOK_URL`.
- Altri destinatari oltre agli admin: id utente separati da virgola nella variabile GitHub `ALERT_USER_IDS`.
Al rilascio successivo finiscono tra le variabili della Function.

**Controlli ogni 10 minuti** (workflow `Controlli`): sito, `/api/health`, Function su Appwrite e picco di
errori del server (variabile `MONITOR_ERROR_THRESHOLD`, predefinita 20 in 15 minuti). Se qualcosa non va si
apre **una** issue "Servizio con problemi" (una email); quando torna regolare la issue si chiude con un
commento (una seconda email). Nel frattempo nessun'altra email. Per un secondo controllo indipendente da GitHub, aggiungi `https://<dominio>/api/health`
a un servizio gratuito come UptimeRobot o Better Stack (risponde 200 se tutto va, 503 se Appwrite non risponde).

**Prova reale** (job del workflow `Rilascio` e, ogni notte, di `Controlli`): crea quattro
account temporanei (`swimin-e2e+…@example.com`) e percorre iscrizione, CV, candidatura, colloquio,
assunzione, staff, turni, cambio turno e chat con allegato, controllando anche gli accessi vietati.
Poi elimina gli account e ripulisce. Gli annunci di questi account non mandano avvisi alle persone vere.
Rapporto nel riepilogo del workflow.

**Manutenzione.**
- *Admin › Stato del servizio*: "Rallentamenti" mostra una striscia gialla con il tuo messaggio;
  "Manutenzione" mostra a tutti la pagina di manutenzione (gli amministratori continuano a usare l'app).
  Vale subito, senza rilasci. La pagina pubblica `/stato` mostra il messaggio e controlla i servizi dal vivo.
- *Se Appwrite non risponde* (il pannello non funziona): su Vercel imposta `VITE_MAINTENANCE=on` e,
  se vuoi, `VITE_MAINTENANCE_MESSAGE`, poi rilancia il deploy. Per tornare online togli la variabile e
  rilancia. Se il server non risponde l'app mostra comunque da sola "SwimIn non risponde" e riprova.

## 13. Sicurezza e privacy: cosa fa l'app e cosa configurare

**Già nel codice**
- Connessioni sempre cifrate (HTTPS, HSTS). Password gestite da Appwrite (mai visibili, conservate come impronta cifrata); verifica in due passaggi per tutti.
- Permessi per singola riga e file: messaggi, allegati, CV, brevetti, telefono, note interne e area staff li legge solo chi è autorizzato; tutto ciò che tocca altri utenti passa dalla Function, che controlla l'identità.
- Content Security Policy generata a ogni build (`vite.config.ts`): script solo dall'app (lo script del tema con il suo hash), connessioni solo ad Appwrite e alle API di Google Calendar, nessun iframe, nessun plugin. I test end-to-end falliscono se la policy blocca qualcosa. In `vercel.json`: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
- Bucket con cifratura dei file e antivirus quando il piano li offre (`setup-db` lo prova e avvisa se non disponibili).
- Limiti anti-abuso, filtro dei testi, registro errori senza contenuti, eliminazione dell'account e download dei propri dati dalle impostazioni, pulizia notturna secondo i tempi di conservazione.
- Dependabot (`.github/dependabot.yml`) e `npm audit` in CI per le vulnerabilità delle dipendenze; `SECURITY.md` per le segnalazioni.

**Da configurare nella console (una volta)**
- *Appwrite › Auth › Security*: "Password dictionary" e "Personal data" attivi, "Password history" (es. 5), limite sessioni per utente (es. 10), "Session alerts" se le email sono attive.
- *Appwrite › Auth › Users*: verifica in due passaggi attiva sugli account con etichetta `admin`.
- *Dominio personalizzato per Appwrite* (es. `api.swimin.it`, Settings › Custom domains) e `VITE_APPWRITE_ENDPOINT` aggiornato: il cookie di sessione diventa del tuo dominio. Senza, i browser che bloccano i cookie di terze parti (Safari) fanno usare all'SDK la "sessione di riserva" in memoria locale, meno protetta.
- *GitHub › Settings › Code security*: Secret scanning, Push protection e Private vulnerability reporting attivi.
- *Piano Pro di Appwrite*: backup giornalieri del database e, se si vuole, colonne cifrate per i testi più sensibili (messaggi, telefono): richiedono una migrazione dei dati, da pianificare.

**Crittografia end-to-end dei messaggi**: non adottata. Richiederebbe chiavi su ogni dispositivo (chi cambia telefono perde lo storico), renderebbe impossibili anteprime nelle notifiche, moderazione delle segnalazioni e chat staff condivise. I messaggi sono protetti da permessi per riga e cifratura in transito; la cifratura per colonna lato server (Pro) è il passo successivo sensato.

## 14. Richieste delle autorità e registro degli accessi

**Registro degli accessi** (`functions/api/src/audit.js`, tabella `audit_log`): ogni azione `admin*` e `legal*` della Function viene registrata in automatico (chi, quando, cosa, su quale elemento, motivo, esito; anche i tentativi negati), senza contenuti. Si consulta in *Admin › Registro accessi*. Conservazione: 12 mesi; le voci delle richieste delle autorità 5 anni.

**Conservazione su ordine dell'autorità** (`functions/api/src/legal.js`, tabelle `legal_holds` e `held_items`). I messaggi **non** si conservano "per sicurezza" oltre l'account (sarebbe contrario al GDPR); si conservano solo dopo un ordine formale (es. ordine europeo di conservazione, 60 giorni + 30).

1. *Una volta, su un computer fidato*: `node scripts/legal/keygen.mjs ./chiavi` → `escrow-public.pem` va nel secret GitHub **`ESCROW_PUBLIC_KEY`** (il deploy lo passa alla Function; incollare il PEM intero, a capo compresi). `escrow-private.pem` (protetta da frase segreta) va **fuori linea**: chiavetta in cassaforte + copia presso il legale. Mai su GitHub, Appwrite o Vercel.
2. *Chi gestisce le richieste*: Console Appwrite → Auth → utente → Labels → `admin` **e** `legal`. Compare la scheda *Admin › Richieste autorità*.
3. *Arriva un ordine*: "Registra un ordine" (persona o conversazione, autorità, protocollo, data, durata, come è arrivato). La Function sigilla subito account, accessi (IP), profilo, dati privati, messaggi, post, commenti, candidature: copie cifrate (AES-256-GCM, chiave avvolta con RSA-OAEP) con impronta SHA-256. Se l'utente poi elimina messaggi, post, commenti o l'account, resta una copia sigillata.
4. *Consegna*: "Esporta" → file JSON cifrato con il manifesto delle impronte. Sul computer fuori linea: `node scripts/legal/decrypt.mjs file.json escrow-private.pem uscita/` verifica le impronte e scrive i dati in chiaro + `manifesto.txt` (catena di custodia). Consegnare con canale sicuro (PEC) e cancellare la cartella.
5. *Fine*: "Chiudi" cancella subito le copie; alla scadenza le cancella la pulizia notturna. Proroga con "Proroga" (anche con una nuova copia dei dati di oggi).

Senza `ESCROW_PUBLIC_KEY` la registrazione risponde 503: nessuna copia in chiaro viene mai creata. Mappa completa di dati, accessi e tempi: `docs/PRIVACY-SICUREZZA.md`.

## 15. Build, test e rilascio (pipeline) ed email

Un solo flusso, tutto su GitHub Actions:

| Workflow | Quando | Cosa fa |
|---|---|---|
| **Verifica** | ogni PR | build e test: lockfile, vulnerabilità, tema, tipi, test unitari, build, test della Function, delle funzioni Vercel e dell'anagrafica; poi schermate in 6 formati, controllo del layout, accessibilità, 45 percorsi end-to-end e budget del bundle (rapporti sul branch `ci-screenshots/<branch>`) |
| **Rilascio** | merge su `main` (non per sola documentazione) o a mano | Verifica di nuovo → Appwrite (schema e Function, se toccati) e attesa della pubblicazione di Vercel → prova reale → **un solo riepilogo** |
| **Controlli** | ogni 10 minuti, prova reale ogni notte | email solo quando il servizio si rompe e quando torna regolare |
| **Aggiornamenti** | quando la Verifica di un aggiornamento automatico è verde | unisce le PR mensili di Dependabot (versioni minori) e dell'anagrafica e fa partire il Rilascio |
| **Anagrafica comuni** | ogni mese | aggiorna province e comuni da ISTAT e apre la PR (unita da Aggiornamenti) |
| **Pulizia database** | a mano | solo la pulizia dello schema |

**Una email per rilascio.** Il riepilogo è un commento nella issue *Rilasci di SwimIn* (etichetta `rilasci`): esito di build e test, Appwrite, Vercel (con il link al sito) e prova reale. Menziona chi ha fatto il merge, oppure gli utenti nella variabile GitHub `NOTIFY_USERS` (login separati da virgola).

**Per non ricevere altre email** (impostazioni del tuo account, una volta):
- *GitHub → Settings → Notifications*:
  - in *Actions* togli le email ("Only notify for failed workflows" spento): gli esiti arrivano dal riepilogo;
  - in *Dependabot alerts* lascia solo la sintesi settimanale;
- sul repository *Watch → Custom*: lascia attive solo le *Issues*, così ricevi i riepiloghi e gli avvisi di servizio ma non le PR;
- *Vercel → Account Settings → Notifications*: togli le email delle pubblicazioni. I commenti di Vercel su PR e commit sono già spenti (`github.silent` in `vercel.json`) e le anteprime non partono per i branch automatici (`dependabot/**`, `bot/**`, `ci-screenshots/**`);
- *Claude*: le notifiche delle sessioni si gestiscono nelle impostazioni di Claude (claude.ai).

**Vercel solo dopo i test (consigliato).** Vercel pubblica il sito da sé a ogni merge, in parallelo alla verifica. Per pubblicarlo in produzione solo se i test passano: *Vercel → Project → Settings → Deployment Checks* e aggiungi il controllo GitHub **Verifica / Build e test** (e *Schermate, accessibilità ed end-to-end*). Vercel prepara la build ma la mette online solo quando i controlli sono verdi.

## Modello di sicurezza (in breve)

| Collezione | Chi legge | Chi crea | Chi modifica |
|---|---|---|---|
| profiles | utenti loggati | solo Function | solo Function (`updateMyProfile`, `setCoAdmin`) |
| posts, swim_meets, live_rooms | utenti loggati | solo Function (autore verificato) | solo Function (`updatePost`, `cancelSwimMeet`, `endLiveRoom`) |
| jobs | utenti loggati | solo Function (struttura verificata) | solo Function (`closeJob`, `reopenJob`) |
| announcements, shifts (area staff) | solo tramite Function, per amministratori e staff | solo Function | solo Function |
| audit_log (registro accessi) | solo tramite Function (`adminListAudit`, voci `legal` solo con etichetta `legal`) | solo Function (in automatico) | nessuno |
| legal_holds, held_items (conservazione) | solo tramite Function (`legal*`, etichette `admin` + `legal`); copie cifrate, leggibili solo fuori linea | solo Function | solo Function (scadenza, chiusura) |
| private_info (telefono delle persone) | solo tramite Function (`getContactInfo`): la persona, i collegamenti, chi valuta una sua candidatura | solo Function | solo Function |
| push_subscriptions, blocks, client_errors, profile_views, subscriptions, plans, staff_messages, staff_chat_reads, event_private | solo Function | solo Function | solo Function |
| typing ("sta scrivendo") | solo il destinatario (permesso sulla riga) | solo Function | solo Function |
| job_alerts (avvisi di lavoro) | solo il proprietario (permesso sulla riga) | solo Function | solo Function |
| recommendations (referenze) | in attesa o nascoste: autore e destinatario; pubblicate: utenti loggati | solo Function | solo Function |
| comment_likes, follows | utenti loggati | solo Function | solo Function |
| poll_votes | solo chi ha votato (permesso sulla riga) | solo Function | solo Function |
| groups, group_members | utenti loggati | solo Function (`createGroup`, `joinGroup`) | solo Function (amministratori del gruppo) |
| endorsements | utenti loggati | solo Function (solo tra collegati) | solo Function |
| reports | nessuno (solo Console) | solo Function | solo Console |
| comments, likes | utenti loggati | solo Function | solo Function (`deleteComment`: autore, autore del post, amministratori del gruppo) |
| messages | mittente e destinatario | solo Function | solo Function (letto/non letto) |
| connections | i due utenti coinvolti | solo Function | solo Function |
| applications | candidato e chi gestisce l'annuncio | solo Function | solo Function; il candidato può ritirarla |
| notifications | solo il destinatario | solo Function | il destinatario (segna come letta) |

Le azioni che toccano dati di altri utenti o che devono garantire l'identità dell'autore (post, annunci,
collegamenti, like, commenti, conferme di competenze, candidature, assunzioni, follow, partecipazione
a live e swim-meet, messaggi, segnalazioni, eliminazione account) passano dalla Function `api`, che verifica
l'identità tramite l'header `x-appwrite-user-id` impostato da Appwrite.
