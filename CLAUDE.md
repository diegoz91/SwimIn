# SwimWaveUp (SwimIn) — Guida per Claude

Social network professionale per il mondo del nuoto, ispirato a LinkedIn.
Utenti: **professionisti** (istruttori FIN, assistenti bagnanti, allenatori, direttori sportivi) e **strutture** (piscine, centri sportivi).

## Stack
- React 19 + TypeScript (strict) + Vite 6, React Router 6, Tailwind 3.4
- Backend BaaS: **Appwrite Cloud** (Auth, Databases, Storage, Realtime) — SDK web `appwrite`
- Deploy: Vercel (SPA rewrite in `vercel.json`)
- Alias import: `@/` → `src/`

## Comandi
- `npm run dev` — dev server su porta 3000
- `npm run build` — `tsc && vite build` (deve passare prima di ogni commit)
- `npm run typecheck` — solo controllo dei tipi
- `npm test` — test del frontend (Vitest, file `src/**/*.test.ts`)
- `npm run setup-db` — crea/aggiorna DB, collezioni, indici, bucket e deploya la Function `api` (richiede `.env.setup` con API key, MAI committarlo)
- `npm run reset-db -- --yes` — ⚠️ cancella tutto l'ambiente di test
- `cd functions/api && npm test` — test della Function server-side
- Guida operativa: `docs/SETUP-APPWRITE.md`

## Variabili d'ambiente
- `.env` (frontend): `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`
- `.env.setup` (script Node): `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`
- Entrambi sono in `.gitignore`. Non scrivere mai chiavi nel codice.

## Struttura
- `src/pages/` — pagine di route (Landing per i visitatori su `/`, Home, Jobs, Network, Profile, Chat, Live, PostPage `/post/:id`, Notifications `/notifiche`, Search `/cerca`, Saved `/salvati`, Onboarding `/benvenuto`, Login, Register, ResetPassword, VerifyEmail, NotFound) e `src/pages/legal/` (privacy, termini, cookie). Tutte caricate con `React.lazy` in `App.tsx`
- `src/features/<dominio>/components/` — UI per dominio: auth, feed, jobs, network, messaging, profile
- `src/services/database.ts` — **unico punto di accesso** alle collezioni Appwrite; i componenti non devono chiamare `databases.*` direttamente
- `src/services/storage.ts` — upload di immagini (compresse con `utils/image.ts`) e video; `deleteByUrl` per pulire i file sostituiti
- `src/config/legal.ts` — dati del titolare per le pagine legali (**da completare prima del lancio**)
- `src/hooks/useAuth.tsx` — sessione e profilo utente corrente
- `src/types/types.ts` — tipi di dominio; tenerli allineati allo schema in `setup-db.js`
- `setup-db.js` — **fonte di verità dello schema** Appwrite (tabelle, colonne, indici, permessi). Usa l'API **TablesDB** (Appwrite 1.8+); la vecchia API Databases per schema/collezioni è deprecata e la console non offre più i suoi scope
- `functions/api/` — Appwrite Function per le operazioni che toccano dati di più utenti; il client la chiama con `callApi()` in `database.ts`
- `.github/workflows/ci.yml` — CI su ogni PR: sincronizza `package-lock.json`, type-check, build, test della Function

## Design system (SwimIn, "acqua premium")
- Colori (token Tailwind in `tailwind.config.js`): `abisso` #0A2738 testi forti, `corsia-*` azioni (la scala `blue-*` è ricalibrata sullo stesso blu), `cloro-*` accenti, `piastrella` #F2F8FA sfondo, `galleggiante` #E23D3D **solo** SOS ed errori.
- Font: Figtree (testo) e Barlow Condensed (`font-display`, applicato a h1/h2), ospitati con l'app via @fontsource. Niente Google Fonts o CDN esterni.
- Elemento distintivo: la corsia. Logo = `<Brand />`/`<BrandMark />` (T di fine corsia), classe `.lane-rope` per il galleggiante. Usarlo con parsimonia (header, landing, live).
- Avatar: `avatarOf()` / `displayNameOf()` / `headlineOf()` in `utils/profile.ts`; mai servizi esterni per le iniziali.
- Testi in sentence case, niente maiuscolo per etichette o pulsanti, niente emoji decorative nei controlli.
- Revisione visiva: il workflow `Schermate` pubblica le schermate (dati di esempio in `scripts/screenshots/fixtures.mjs`) sul branch `ci-screenshots/<branch>`; per vederle `git clone -b ci-screenshots/<branch> …`.

## Convenzioni
- UI, testi e messaggi d'errore in **italiano**; nomi di variabili/funzioni in inglese.
- Ogni nuovo campo di un documento va aggiunto sia in `setup-db.js` sia in `types.ts`.
- Niente `as any` nuovi; non silenziare errori con `catch {}` vuoti: logga o mostra un toast (`ToastContext`).
- Componenti funzionali + hooks, Tailwind per lo stile.

## Sicurezza (priorità)
- I permessi vanno impostati **per documento** (document security), non `update/delete(Role.users())` a livello di collezione.
- Passano dalla Function `api` (che verifica l'utente tramite `x-appwrite-user-id`) le operazioni che toccano dati di altri utenti **o** che devono garantire l'identità dell'autore: creazione di post e annunci, collegamenti, like, commenti, conferme di competenze, candidature, assunzioni, follow, notifiche, messaggi, segnalazioni, eliminazione account. Nuove azioni del genere vanno aggiunte lì, con un test in `functions/api/test`.
- Mai fidarsi di campi "chi sono" inviati dal client (`authorId`, `structureId`, elenchi `connections` del chiamante): un utente può modificare il proprio profilo, quindi i controlli devono usare dati che solo il server o l'altra parte possono scrivere.
- I messaggi privati devono essere leggibili solo da mittente e destinatario.

## Workflow
- Branch per ogni intervento (`fix/...`, `feat/...`), commit piccoli, PR verso `main`.
- Prima di consegnare: CI verde sulla PR (in questa sessione il registry npm può non essere raggiungibile: la CI è il riferimento).
- Se modifichi `package.json`, la CI rigenera e committa il `package-lock.json`: fai `git pull --rebase` prima del push successivo.
- Gli errori di type-check si leggono dalle annotazioni del check-run (`gh api repos/.../check-runs/<job_id>/annotations`).
