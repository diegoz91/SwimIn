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
- `api/` — funzioni Vercel: `/u/:id` (anteprime social del profilo pubblico), `/sitemap.xml`, `/robots.txt`. Chiamano solo le azioni pubbliche della Function (`PUBLIC_ACTIONS` in `functions/api/src/public.js`), senza chiavi segrete; test in `scripts/vercel/api.test.mjs`
- `.github/workflows/ci.yml` — CI su ogni PR: sincronizza `package-lock.json`, type-check, build, test della Function

## Design system (SwimIn, "acqua premium")
- Colori (token Tailwind in `tailwind.config.js`): `abisso` #0A2738 testi forti, `corsia-*` azioni (la scala `blue-*` è ricalibrata sullo stesso blu), `cloro-*` accenti, `piastrella` #F2F8FA sfondo, `galleggiante` #E23D3D **solo** SOS ed errori.
- Font: Figtree (testo) e Barlow Condensed (`font-display`, applicato a h1/h2), ospitati con l'app via @fontsource. Niente Google Fonts o CDN esterni.
- Elemento distintivo: la corsia. Logo = `<Brand />`/`<BrandMark />` (T di fine corsia), classe `.lane-rope` per il galleggiante. Usarlo con parsimonia (header, landing, live).
- Avatar: `avatarOf()` / `displayNameOf()` / `headlineOf()` in `utils/profile.ts`; mai servizi esterni per le iniziali.
- Testi in sentence case, niente maiuscolo per etichette o pulsanti, niente emoji decorative nei controlli.
- Controlli: mai `<select>`, `type="date"`, `type="time"`, `datalist` o checkbox nativi. Usare `Select`, `DatePicker` (gg/mm/aaaa, valore ISO), `TimePicker` (24 h), `MonthYearPicker`, `SuggestInput`, `CityCombobox` da `components/form/Pickers.tsx`, `Checkbox` da `Field.tsx`, e `LocationFields` per la coppia provincia/comune. Si aprono in un portale (non vengono tagliati dalle modali) e su mobile come foglio dal basso.
- Anagrafica: province in `src/data/generated/province.json`, comuni in `public/data/comuni/<SIGLA>.json`, generati da `scripts/anagrafica/update.mjs` dalla fonte ISTAT (workflow mensile `Anagrafica comuni`, che apre una PR). Non modificarli a mano. Il comune va validato con `comuneOf()` e `useComuniSync()`.
- Form: usare `useForm` (`hooks/useForm.ts`) con regole da `utils/validation.ts`, campi `Field` / `ProvinceSelect` / `MonthYearPicker` da `components/form/` e la modale `FormModal` (foglio dal basso su mobile, conferma se ci sono modifiche). Date di calendario come stringhe ISO (`YYYY-MM-DD`, mesi `YYYY-MM`) con gli helper di `utils/dates.ts`; mai date in testo libero. Elenchi del settore (ruoli, brevetti, enti, servizi) in `data/swimming.ts`, province in `data/italy.ts`.
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
- Profili e pagine struttura si modificano solo via Function (`updateMyProfile`, `createFacility`, `updateFacility` in `functions/api/src/profile.js`): le tabelle sono in sola lettura per i client.
- Amministratori: utenti con l'etichetta `admin` (Console Appwrite → Auth → utente → Labels). Le azioni `admin*` della Function lo verificano sempre; il client usa `useBlocks().isAdmin` solo per mostrare il pannello `/admin`.
- Area staff di una struttura (bacheca, turni, membri): solo amministratori e membri di `staff` (Facility o profilo Struttura), verificati dalla Function a ogni lettura (`functions/api/src/team.js`). Un collegamento o un follower **non** è staff. Le tabelle `announcements` e `shifts` non hanno permessi per i client.
- Dati privati: email solo nell'account (mai sul profilo); telefono delle persone in `private_info`, restituito da `getContactInfo` solo alla persona, ai collegamenti reciproci e a chi valuta una sua candidatura.
- Post, swim-meet e dirette si modificano/annullano solo via Function (`updatePost`, `createSwimMeet`, `cancelSwimMeet`, `endLiveRoom`).
- Profili pubblici (`/u/:id`): strutture sempre, persone solo con `publicProfile` attivo. La Function è eseguibile anche dagli ospiti, ma senza login accetta solo `PUBLIC_ACTIONS`, che restituiscono dati non sensibili.
- Interazioni social (`functions/api/src/social.js`): reazioni ai post (`react`, tipi in `data/reactions.ts` e `REACTIONS` lato server), mi piace ai commenti, ripubblicazioni (`repost`/`undoRepost`, sempre dell'originale) e visite al profilo (`recordProfileView`, notifica al massimo una volta ogni 24 ore per visitatore, anonima con `hideProfileViews`; la tabella `profile_views` la legge solo la Function).
- Blocchi: `assertNotBlocked` nella Function per messaggi, collegamenti e commenti; nel client filtrare i contenuti con `useBlocks().isHidden()` / `isMutedOrHidden()`.

## Workflow
- Branch per ogni intervento (`fix/...`, `feat/...`), commit piccoli, PR verso `main`.
- Prima di consegnare: CI verde sulla PR (in questa sessione il registry npm può non essere raggiungibile: la CI è il riferimento).
- Se modifichi `package.json`, la CI rigenera e committa il `package-lock.json`: fai `git pull --rebase` prima del push successivo.
- Gli errori di type-check si leggono dalle annotazioni del check-run (`gh api repos/.../check-runs/<job_id>/annotations`).
