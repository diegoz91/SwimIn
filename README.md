# SwimIn (SwimWaveUp)

**Il social network professionale del nuoto.** SwimIn mette in contatto chi lavora in piscina (istruttori FIN, assistenti bagnanti, allenatori, direttori sportivi) con le strutture (piscine, centri sportivi) e con chi nuota per passione. È pensato come il "LinkedIn del nuoto": profili professionali con brevetti, rete di contatti, offerte di lavoro e sostituzioni urgenti, messaggi, gruppi ed eventi. Le strutture ci gestiscono anche staff e turni.

![Stato](https://img.shields.io/badge/stato-pre--lancio-yellow)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Appwrite](https://img.shields.io/badge/Appwrite-1.8_TablesDB-FD366E?logo=appwrite&logoColor=white)
![Vercel](https://img.shields.io/badge/deploy-Vercel-000000?logo=vercel&logoColor=white)

---

## Indice

- [Per chi è](#per-chi-è)
- [Funzionalità](#funzionalità)
- [Architettura](#architettura)
- [Sicurezza](#sicurezza)
- [Privacy e conformità](#privacy-e-conformità)
- [Affidabilità e operazioni](#affidabilità-e-operazioni)
- [Qualità e CI](#qualità-e-ci)
- [Design system](#design-system)
- [Avvio in locale](#avvio-in-locale)
- [Configurazione e deploy](#configurazione-e-deploy)
- [Struttura del repository](#struttura-del-repository)
- [Prima del lancio](#prima-del-lancio)
- [Documentazione](#documentazione)

---

## Per chi è

All'iscrizione si sceglie uno di tre tipi di account:

| Account | Per chi | Cosa ci fa |
|---|---|---|
| **Lavoro nel nuoto** | istruttori, assistenti bagnanti, allenatori, direttori | profilo professionale con brevetti, CV, candidature, turni nelle strutture in cui lavora |
| **Nuoto per passione** | appassionati, master, genitori | feed, gruppi, eventi, contatti con professionisti e strutture |
| **Struttura** | piscine, centri sportivi, società | annunci di lavoro e SOS, selezione dei candidati, staff, turni, bacheca, recensioni |

Una struttura è sempre un account Struttura. Il titolare può nominare fino a 5 co-amministratori dal proprio staff.

## Funzionalità

### Profili
- Profilo professionale con esperienze, **brevetti** (con scadenza, documento allegato e verifica dagli amministratori), competenze confermabili dai collegamenti, disponibilità e zone.
- **Checklist di completamento** cliccabile: ogni passo apre l'azione giusta. Indice fisso delle sezioni.
- **CV in PDF** privato: lo vede solo chi valuta una tua candidatura, e solo se lo alleghi.
- **Referenze scritte** da colleghi, strutture o selezionatori: le pubblichi tu, oppure restano nascoste.
- Profilo pubblico facoltativo (`/u/:id`) con anteprima per i social. Le strutture sono sempre pubbliche.
- Visite al profilo, statistiche, segui e collegamenti.

### Feed e contenuti
- Post con testo, foto, video, **video-analisi tecnica** (commenti legati a un istante del video) e sondaggi.
- Reazioni, commenti con risposte e "mi piace", ripubblicazioni, menzioni `@` e hashtag con pagina dedicata.
- Feed "Per te" (collegamenti, seguiti, provincia, interazioni) o "Più recenti". I post nuovi non spostano la lettura: compare l'avviso "N nuovi post".
- Salvati, segnalazioni, blocco e silenziamento. Un filtro automatico ferma insulti e spam.

### Lavoro
- Bacheca offerte con filtri e ricerca tollerante agli errori. **SOS Vasca** per sostituzioni urgenti, estese alla regione per le strutture Premium.
- **Offerte pubbliche** indicizzabili (`/offerte/:id`, dati strutturati per Google Jobs) e nella sitemap.
- Candidatura in una schermata, con CV allegato. Percorso a tappe di ogni candidatura (nuova, vista, selezionata, assunta, non selezionata).
- Gestionale annunci per strutture e co-amministratori, con conteggi per fase.
- **Selezione**: valutazione interna a stelle e note (mai visibili al candidato). Proposta di colloquio (in presenza, video o telefono) che il candidato conferma o sposta, con aggiunta al calendario.
- **Avvisi di lavoro** per parole chiave, provincia, contratto o solo SOS.

### Strutture e staff
- Area staff riservata: **bacheca** interna, **chat dello staff**, membri e inviti.
- **Turni**:
  - serie ricorrenti, modelli di settimana e conferma da parte dello staff;
  - **cambi turno** tra colleghi;
  - **esportazione CSV** del mese per le paghe.
- Calendario personale `/turni`, a settimana o a mese: un colore per struttura, ore del periodo e avviso dei turni sovrapposti.
- Scorciatoie "Lavori presso" e avviso "Sei stato assunto".
- Recensioni delle strutture, con risposta della struttura.

### Messaggi
- Chat in tempo reale con allegati (foto e documenti), risposte, reazioni ed eliminazione per tutti.
- Indicatore "sta scrivendo" e conferme di lettura (disattivabili).
- Widget dei messaggi sempre a portata su schermi grandi.

### Gruppi ed eventi
- **Gruppi** aperti o su approvazione, con regole, moderazione, post e commenti riservati ai membri.
- **Eventi** in presenza o online: quota, posti limitati con **lista d'attesa** automatica, eventi di gruppo e file `.ics` o Google Calendar.
- Dirette "Bordo vasca" (sale con palco e chat). Si accendono con `VITE_LIVE=on`.

### SwimIn Premium
- Tre piani: professionisti, appassionati (Premium Passione) e strutture. Prova gratuita e pagamento con **Stripe** o **PayPal**.
- Vantaggi verificati dal server:
  - messaggi a chi non è un collegamento;
  - più annunci attivi e annunci in evidenza;
  - staff più grande, più avvisi di lavoro e SOS regionali;
  - candidature in cima e precedenza nelle liste d'attesa;
  - statistiche e visite anonime.
- Prezzi modificabili dagli amministratori senza toccare il codice. Chi è già abbonato mantiene il proprio prezzo.

### Notifiche
- Centro notifiche in tempo reale, raggruppato per giorno. Dalla campanella si può segnare come letta una notifica o tutte.
- **Push** sul telefono e sul computer, ed **email** secondo le preferenze di ogni categoria.
- **Promemoria della sera prima** per turni e colloqui di domani. **Riepilogo settimanale** via email.

### Account
- Email e password o **Google**, verifica email, recupero password, **verifica in due passaggi** (app di autenticazione e codici di recupero).
- Impostazioni: account, password, sicurezza, notifiche, privacy (profilo pubblico, visite anonime, conferme di lettura), aspetto (tema chiaro o scuro).
- **Download dei propri dati** ed **eliminazione dell'account**.

### Esperienza
- Landing per i visitatori e benvenuto guidato a tappe dopo l'iscrizione.
- Ricerca globale di persone, strutture, offerte, gruppi, eventi, post e hashtag, con ricerche recenti.
- App installabile (PWA) con pagina offline. Avviso di connessione persa e ritrovata.
- Scheletri di caricamento e barra di avanzamento. Caricamenti con percentuale reale.
- Azioni reversibili con "Annulla" invece di conferme.
- Tema chiaro e scuro, interfaccia pensata da 360 px a schermi larghi.
- Finestra "Scrivici" per mandare suggerimenti dall'app.

### Amministrazione (`/admin`)
- Panoramica, segnalazioni, verifica dei brevetti e utenti (sospensione, Premium in omaggio).
- Piani e prezzi, errori dell'app, stato del servizio (manutenzione o rallentamenti), suggerimenti.
- **Registro accessi** dello staff.
- **Richieste delle autorità**: solo per chi ha l'etichetta `legal`.

## Architettura

```
                ┌──────────────────────────┐
  Browser  ───► │  SPA React (Vercel)      │  CSP, intestazioni di sicurezza, PWA
                └──────┬────────────┬──────┘
          lettura dirette│            │ azioni che toccano altri utenti
          + Realtime     │            ▼
                ┌────────▼───────┐  ┌──────────────────────────────┐
                │ Appwrite       │◄─┤ Function "api" (Node)        │  identità da x-appwrite-user-id,
                │ Auth · TablesDB│  │ 146 azioni · webhook Stripe/ │  permessi per riga, limiti
                │ Storage ·      │  │ PayPal · esecuzione oraria   │  anti-abuso, filtro testi,
                │ Messaging      │  └──────────────────────────────┘  registro accessi
                └────────────────┘
  Vercel /api:  /u/:id e /offerte/:id (anteprime e dati strutturati), sitemap, robots, /api/health
```

- **Frontend**: React 19, TypeScript strict, Vite 6, React Router 6, Tailwind 3.4. Ogni pagina si carica a parte (`lazyPage`, che ricarica una volta se dopo un rilascio un pezzo non esiste più).
- **Backend**: Appwrite Cloud, con l'API TablesDB (1.8+). `setup-db.js` è la **fonte di verità** dello schema: tabelle, colonne, indici, permessi e bucket. Crea e aggiorna tutto, e cancella ciò che non è più nello schema.
- **Function `api`** (`functions/api/`): l'unica via per le operazioni che riguardano altri utenti o che devono garantire l'autore (post, collegamenti, messaggi, candidature, turni, pagamenti…). Ogni modulo ha i suoi test.
- **Tempo reale**:
  - Realtime diretto per le tabelle leggibili dal client: offerte, post, commenti, eventi, notifiche, messaggi;
  - per i dati che passano solo dalla Function, un **segnale** senza dati per destinatario (`signals`), che fa ricaricare la vista.
- **Esecuzione programmata** ogni ora:
  - promemoria dalle 18;
  - pulizia notturna alle 3;
  - riepilogo email il lunedì.

## Sicurezza

- **Permessi per singola riga e file.** Le tabelle con dati di più persone sono scritte solo dalla Function. Le righe che crea hanno solo permessi di lettura, così nessuno può riscrivere autore, struttura o contatori.
- **Identità mai dal client.** I controlli usano dati che solo il server o l'altra parte possono scrivere, mai campi "chi sono" inviati dal browser.
- **Messaggi e allegati** sono leggibili solo da mittente e destinatario. Allegati, CV e documenti dei brevetti stanno in bucket privati e si scaricano con un JWT.
- **Dati riservati fuori dalle righe pubbliche.** Email solo nell'account. Telefono, CV e consenso in `private_info`. "Sta scrivendo" e link degli eventi online in tabelle separate.
- **Limiti anti-abuso** su messaggi, commenti, post, collegamenti, segnalazioni e suggerimenti (errore 429). **Filtro dei testi** contro insulti, anche camuffati, e spam.
- **Blocchi** verificati dal server su messaggi, collegamenti e commenti.
- **Verifica in due passaggi**. Accesso con Google tramite OAuth2 a token, con controllo di `state`.
- **Content Security Policy** generata a ogni build: script solo dall'app, connessioni solo ad Appwrite e Google Calendar. Poi HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Bucket cifrati e con antivirus quando il piano li offre. Webhook di pagamento firmati.
- **Dependabot**, `npm audit` in CI e [`SECURITY.md`](SECURITY.md) per le segnalazioni.

## Privacy e conformità

La mappa completa di dati, accessi, protezione e tempi di conservazione per ogni area è in [`docs/PRIVACY-SICUREZZA.md`](docs/PRIVACY-SICUREZZA.md). Lo stesso documento contiene una bozza del registro dei trattamenti (art. 30 GDPR).

- **Consenso registrato**: all'iscrizione servono Termini e Privacy accettati (16+ anni). Data e versione dei testi restano salvate.
- **Pulizia notturna** secondo i tempi dichiarati nella Privacy:

  | Dato | Conservazione |
  |---|---|
  | Errori dell'app | 30 giorni |
  | Notifiche lette | 90 giorni |
  | Tutte le notifiche, visite al profilo, segnalazioni chiuse, chat dello staff, registro accessi | 12 mesi |
  | Candidature di annunci chiusi | 12 mesi dopo la chiusura |
  | Turni | 24 mesi |

  La stessa pulizia toglie anche le righe orfane e gli account di prova rimasti.
- **Registro degli accessi dello staff**: ogni azione amministrativa viene registrata in automatico, compresi i tentativi negati. Non contiene mai contenuti e non si può modificare.
- **Richieste delle autorità**: nessuna conservazione preventiva dei messaggi. Solo dopo un ordine formale, il responsabile (etichette `admin` + `legal`) registra la richiesta e la Function fa una **copia sigillata** dei dati:
  - cifratura AES-256-GCM con chiave RSA-OAEP e impronte SHA-256;
  - la copia si apre solo fuori linea, con la chiave privata della società;
  - se l'utente cancella qualcosa dopo l'ordine, ne resta una copia;
  - alla scadenza o alla chiusura le copie si cancellano.
- Pagine **Privacy**, **Termini** e **Cookie**. L'elenco dei dati salvati nel browser è generato dal codice.

## Affidabilità e operazioni

- **Registro unico degli errori** del client e del server, con impronta per raggrupparli. Avviso agli amministratori (notifica ed eventuale webhook Slack, Discord o Telegram) al massimo una volta l'ora per errore.
- **Stato del servizio** deciso dagli amministratori: rallentamenti o manutenzione, attivi subito per tutti. Pagina pubblica `/stato` e ripiego con `VITE_MAINTENANCE=on`.
- **`/api/health`** per i monitor esterni. Il workflow **Monitor** controlla l'app ogni 10 minuti.
- **Prova reale** dopo ogni deploy: percorsi principali con account veri, eliminati alla fine.
- **Database sempre pulito**: a ogni deploy `setup-db` elimina tabelle, colonne, indici e bucket fuori schema (`PRUNE=apply|report|off`).

## Qualità e CI

| Workflow | Quando | Cosa fa |
|---|---|---|
| **CI** | ogni PR | sincronizza `package-lock.json`, `npm audit`, type-check, test del frontend (Vitest), build, test della Function |
| **Schermate** | ogni PR | quasi 500 schermate in 6 formati (360 → 1440 px, anche tema scuro) sul branch `ci-screenshots/<branch>`; controllo del layout (niente scorrimento orizzontale, aree di tocco ≥ 24 px), **accessibilità** axe-core WCAG 2.1 AA, **45 percorsi end-to-end** con Playwright, LCP/CLS della landing e budget del bundle |
| **Deploy Appwrite** | push su `main` | schema, migrazioni, pulizia, variabili e deploy della Function con verifica della versione attiva |
| **Prova reale** | dopo il deploy | percorsi veri su Appwrite con account di prova |
| **Monitor** | ogni 10 minuti | salute dell'app e soglia di errori |
| **Pulizia database** | manuale | solo la pulizia dello schema (`report` o `apply`) |
| **Anagrafica comuni** | mensile | aggiorna province e comuni dalla fonte ISTAT e apre una PR |

Test: 25 file per la Function (`functions/api/test`), test del frontend in `src/**/*.test.ts` ed e2e in `scripts/e2e/flows.mjs`, su un Appwrite finto condiviso (`scripts/screenshots/mock.mjs`).

## Design system

"Acqua premium". I token Tailwind sono in `tailwind.config.js`:

| Token | Uso |
|---|---|
| `abisso` | testi forti |
| `corsia` | azioni |
| `cloro` | accenti |
| `piastrella` | sfondo |
| `galleggiante` | solo SOS ed errori |
| `oro` | solo Premium |

- Font **Figtree** e **Barlow Condensed**, ospitati con l'app (nessun CDN esterno).
- Elemento distintivo: la corsia (logo a "T" di fine vasca, galleggiante `.lane-rope`).
- Tema chiaro e scuro: ogni colore è una variabile CSS.
- Controlli propri al posto di quelli nativi: `Select`, `DatePicker`, `TimePicker`, `Checkbox`… Si aprono come foglio dal basso su mobile.
- Mai finestre del browser: conferme con `useConfirm()`, avvisi con i toast.
- Testi in italiano e in sentence case.

## Avvio in locale

Requisiti: **Node.js 22** e un progetto Appwrite Cloud.

```bash
git clone https://github.com/diegoz91/swimwaveup.0.0.1.git
cd swimwaveup.0.0.1
npm install
cp .env.example .env              # endpoint e project ID di Appwrite
cp .env.setup.example .env.setup  # API key di amministrazione: MAI committarla
npm run setup-db                  # crea schema, bucket e Function "api"
npm run dev                       # http://localhost:3000
```

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo (porta 3000) |
| `npm run build` | type-check e build di produzione |
| `npm run typecheck` | solo controllo dei tipi |
| `npm test` | test del frontend |
| `cd functions/api && npm test` | test della Function |
| `npm run setup-db` | crea o aggiorna schema, bucket, variabili e Function |
| `npm run reset-db -- --yes` | ⚠️ cancella tutti i dati dell'ambiente di test |

## Configurazione e deploy

**Frontend** (`.env` e Vercel):

| Variabile | Uso |
|---|---|
| `VITE_APPWRITE_ENDPOINT` | endpoint di Appwrite |
| `VITE_APPWRITE_PROJECT_ID` | id del progetto Appwrite |
| `VITE_LIVE` | `on` accende le dirette |
| `VITE_GOOGLE_AUTH` | `off` spegne l'accesso con Google |
| `VITE_GOOGLE_CALENDAR_API` | `off` spegne il salvataggio diretto su Google Calendar |
| `VITE_MAINTENANCE` | `on` mette il sito in manutenzione anche senza Appwrite |

**Deploy automatico** (GitHub › Settings › Secrets and variables), usato dal workflow *Deploy Appwrite*:

| Tipo | Nome | Uso |
|---|---|---|
| secret | `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY` | accesso amministrativo ad Appwrite |
| secret | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | pagamenti Premium (facoltativi) |
| secret | `ALERT_WEBHOOK_URL` | avvisi su Slack, Discord o Telegram (facoltativo) |
| secret | `ESCROW_PUBLIC_KEY` | chiave **pubblica** per le copie sigillate (`scripts/legal/keygen.mjs`) |
| variabile | `APP_URL`, `FUNCTION_URL`, `EMAIL_NOTIFICATIONS`, `PAYPAL_MODE` | indirizzi, email, modalità PayPal |
| variabile | `ALERT_USER_IDS`, `MONITOR_ERROR_THRESHOLD`, `PRUNE` | avvisi, monitor, pulizia dello schema |

Senza i secret `APPWRITE_*`, `npm run setup-db` va lanciato a mano dopo ogni merge che tocca `functions/api/` o `setup-db.js`. Il sito si pubblica su Vercel: le riscritture della SPA e le intestazioni di sicurezza sono in `vercel.json`. Guida passo passo in [`docs/SETUP-APPWRITE.md`](docs/SETUP-APPWRITE.md).

## Struttura del repository

```
src/
  pages/            pagine di route (caricate a parte) e pagine legali
  features/         interfaccia per dominio: auth, feed, jobs, network, messaging, profile,
                    team, groups, events, admin, feedback…
  components/       guscio dell'app, form e controlli, UI condivisa
  services/         accesso ad Appwrite (database.ts è l'unico punto), storage, upload, Google, 2FA
  hooks/ context/   sessione, form, tempo reale, segnali, stato del servizio, blocchi, conferme
  utils/ data/      date, validazione, feed, turni, Premium; elenchi del settore, province e comuni
functions/api/      Function Appwrite: un modulo per area (team, billing, legal, audit…) e test
api/                funzioni Vercel: anteprime social, offerte pubbliche, sitemap, robots, health
scripts/            e2e e schermate, prova reale, monitor, qualità, anagrafica, billing, legal
setup-db.js         schema, permessi, bucket, migrazioni, pulizia e deploy della Function
docs/               guida operativa e mappa privacy/sicurezza
```

## Prima del lancio

Cose da fare fuori dal codice:

- **Dati legali**: titolare, contatti e regione dei fornitori in `src/config/legal.ts`; accordi sul trattamento (DPA) con Appwrite, Vercel e il provider email; verifica di Privacy e Termini con un legale.
- **Chiavi in produzione**: Stripe e PayPal live, provider email in Appwrite Messaging (`EMAIL_NOTIFICATIONS=on`), progetto Google OAuth verificato.
- **Richieste delle autorità**: generare la coppia di chiavi, mettere la privata fuori linea, nominare il responsabile (etichette `admin` + `legal`).
- **Appwrite**: impostazioni di sicurezza di Auth (password, sessioni), 2FA sugli amministratori, dominio personalizzato (es. `api.swimin.it`), piano Pro per i backup.
- **GitHub**: secret scanning e push protection. Un monitor esterno (es. UptimeRobot) su `/api/health`.

## Documentazione

- [`docs/SETUP-APPWRITE.md`](docs/SETUP-APPWRITE.md): configurazione di Appwrite, Google, Premium, monitoraggio, sicurezza, richieste delle autorità.
- [`docs/PRIVACY-SICUREZZA.md`](docs/PRIVACY-SICUREZZA.md): mappa di dati, accessi e tempi di conservazione; bozza del registro dei trattamenti.
- [`SECURITY.md`](SECURITY.md): come segnalare una vulnerabilità.
- [`CLAUDE.md`](CLAUDE.md): convenzioni e regole del progetto per chi sviluppa.
