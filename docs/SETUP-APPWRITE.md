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
- crea i bucket `avatars` e `post_media` (lettura pubblica, modifica solo del proprietario);
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

## Modello di sicurezza (in breve)

| Collezione | Chi legge | Chi crea | Chi modifica |
|---|---|---|---|
| profiles, facilities, announcements, shifts, live_rooms, swim_meets | utenti loggati | utenti loggati | solo il proprietario (+ Function per i campi condivisi) |
| posts, jobs | utenti loggati | solo Function (autore/struttura verificati) | solo l'autore |
| endorsements | utenti loggati | solo Function (solo tra collegati) | solo Function |
| reports | nessuno (solo Console) | solo Function | solo Console |
| comments, likes | utenti loggati | solo Function | autore (commenti) |
| messages | mittente e destinatario | solo Function | solo Function (letto/non letto) |
| connections | i due utenti coinvolti | solo Function | solo Function |
| applications | candidato e chi gestisce l'annuncio | solo Function | solo Function; il candidato può ritirarla |
| notifications | solo il destinatario | solo Function | il destinatario (segna come letta) |

Le azioni che toccano dati di altri utenti o che devono garantire l'identità dell'autore (post, annunci,
collegamenti, like, commenti, conferme di competenze, candidature, assunzioni, follow, partecipazione
a live e swim-meet, messaggi, segnalazioni, eliminazione account) passano dalla Function `api`, che verifica
l'identità tramite l'header `x-appwrite-user-id` impostato da Appwrite.
