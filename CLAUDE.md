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
- `npm run setup-db` — crea/aggiorna DB, collezioni, indici, bucket e deploya la Function `api` (richiede `.env.setup` con API key, MAI committarlo)
- `npm run reset-db -- --yes` — ⚠️ cancella tutto l'ambiente di test
- `cd functions/api && npm test` — test della Function server-side
- Guida operativa: `docs/SETUP-APPWRITE.md`

## Variabili d'ambiente
- `.env` (frontend): `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`
- `.env.setup` (script Node): `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`
- Entrambi sono in `.gitignore`. Non scrivere mai chiavi nel codice.

## Struttura
- `src/pages/` — pagine di route (Home, Jobs, Network, Profile, Chat, Live, Login, Register)
- `src/features/<dominio>/components/` — UI per dominio: auth, feed, jobs, network, messaging, profile
- `src/services/database.ts` — **unico punto di accesso** alle collezioni Appwrite; i componenti non devono chiamare `databases.*` direttamente
- `src/services/storage.ts` — upload avatar e media post
- `src/hooks/useAuth.tsx` — sessione e profilo utente corrente
- `src/types/types.ts` — tipi di dominio; tenerli allineati allo schema in `setup-db.js`
- `setup-db.js` — **fonte di verità dello schema** Appwrite (collezioni, attributi, indici, permessi)
- `functions/api/` — Appwrite Function per le operazioni che toccano dati di più utenti; il client la chiama con `callApi()` in `database.ts`
- `.github/workflows/ci.yml` — CI su ogni PR: sincronizza `package-lock.json`, type-check, build, test della Function

## Convenzioni
- UI, testi e messaggi d'errore in **italiano**; nomi di variabili/funzioni in inglese.
- Ogni nuovo campo di un documento va aggiunto sia in `setup-db.js` sia in `types.ts`.
- Niente `as any` nuovi; non silenziare errori con `catch {}` vuoti: logga o mostra un toast (`ToastContext`).
- Componenti funzionali + hooks, Tailwind per lo stile.

## Sicurezza (priorità)
- I permessi vanno impostati **per documento** (document security), non `update/delete(Role.users())` a livello di collezione.
- Operazioni che toccano dati di altri utenti (collegamenti, like, commenti, candidature, assunzioni, follow, notifiche, messaggi) passano dalla Function `api`, che verifica l'utente tramite `x-appwrite-user-id`. Nuove azioni del genere vanno aggiunte lì, con un test in `functions/api/test`.
- I messaggi privati devono essere leggibili solo da mittente e destinatario.

## Workflow
- Branch per ogni intervento (`fix/...`, `feat/...`), commit piccoli, PR verso `main`.
- Prima di consegnare: CI verde sulla PR (in questa sessione il registry npm può non essere raggiungibile: la CI è il riferimento).
- Se modifichi `package.json`, la CI rigenera e committa il `package-lock.json`: fai `git pull --rebase` prima del push successivo.
- Gli errori di type-check si leggono dalle annotazioni del check-run (`gh api repos/.../check-runs/<job_id>/annotations`).
