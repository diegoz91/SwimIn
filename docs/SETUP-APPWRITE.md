# Setup di Appwrite (ambiente di test)

Questa guida configura da zero il progetto Appwrite usato da SwimWaveUp:
database, permessi, storage e la Function `api`.

## 1. Requisiti

- Node.js 20 o superiore (`node -v`)
- Il repository clonato in locale e `npm install` eseguito nella root

## 2. API key (una volta sola)

1. Appwrite Console → il tuo progetto → **Overview → Integrations → API keys → Create API key**
2. Nome: `setup-script`. Scope: seleziona **Databases**, **Storage**, **Functions** e **Auth/Users** (per il reset).
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

- crea le collezioni con **document security** attiva e permessi minimi;
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
| profiles, posts, jobs, facilities, announcements, shifts, live_rooms, swim_meets | utenti loggati | utenti loggati | solo il proprietario (+ Function per i campi condivisi) |
| comments, likes | utenti loggati | solo Function | autore (commenti) |
| messages | mittente e destinatario | solo Function | solo Function (letto/non letto) |
| connections | i due utenti coinvolti | solo Function | solo Function |
| applications | candidato e chi gestisce l'annuncio | solo Function | solo Function; il candidato può ritirarla |
| notifications | solo il destinatario | solo Function | il destinatario (segna come letta) |

Le azioni che toccano dati di altri utenti (collegamenti, like, commenti, candidature, assunzioni,
follow, partecipazione a live e swim-meet, messaggi) passano dalla Function `api`, che verifica
l'identità tramite l'header `x-appwrite-user-id` impostato da Appwrite.
