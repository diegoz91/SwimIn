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

Da quel momento il workflow **Deploy Appwrite** lancia `npm run setup-db` a ogni merge che tocca `functions/api/` o `setup-db.js`, e aspetta che la build della Function sia pronta. Si può avviare anche a mano da *Actions → Deploy Appwrite → Run workflow*.

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
4. **Lancia `npm run setup-db`** (o il workflow *Deploy Appwrite*). Lo script:
   - crea su Stripe i 4 prezzi e su PayPal i 4 piani: persone 4,99 €/mese o 47,90 €/anno, strutture 19 €/mese o 179 €/anno, tutti IVA inclusa;
   - registra i webhook verso `FUNCTION_URL/webhooks/stripe` e `/webhooks/paypal`;
   - salva tutto nelle variabili della Function.

   Si può rilanciare quante volte vuoi: non crea doppioni.

I prezzi stanno in `functions/api/src/billing.js` (`PRICES`). Se li cambi e rilanci `setup-db`, si creano i nuovi prezzi; gli abbonamenti già attivi restano al vecchio prezzo.

## Modello di sicurezza (in breve)

| Collezione | Chi legge | Chi crea | Chi modifica |
|---|---|---|---|
| profiles, facilities | utenti loggati | solo Function | solo Function (`updateMyProfile`, `updateFacility`) |
| posts, swim_meets, live_rooms | utenti loggati | solo Function (autore verificato) | solo Function (`updatePost`, `cancelSwimMeet`, `endLiveRoom`) |
| jobs | utenti loggati | solo Function (struttura verificata) | solo Function (`closeJob`, `reopenJob`) |
| announcements, shifts (area staff) | solo tramite Function, per amministratori e staff | solo Function | solo Function |
| private_info (telefono delle persone) | solo tramite Function (`getContactInfo`): la persona, i collegamenti, chi valuta una sua candidatura | solo Function | solo Function |
| push_subscriptions, blocks, client_errors, profile_views, subscriptions, staff_messages, staff_chat_reads, event_private | solo Function | solo Function | solo Function |
| typing ("sta scrivendo") | solo il destinatario (permesso sulla riga) | solo Function | solo Function |
| job_alerts (avvisi di lavoro) | solo il proprietario (permesso sulla riga) | solo Function | solo Function |
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
