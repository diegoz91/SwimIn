# 🏊‍♂️ SwimWaveUp (SwimIn)

**Il primo Social Network Professionale dedicato esclusivamente al mondo del nuoto.**

SwimWaveUp connette Istruttori FIN, Assistenti Bagnanti, Allenatori, Direttori Sportivi e Strutture (Piscine e Centri Sportivi) in un'unica piattaforma dinamica. Pensato come il "LinkedIn del nuoto", facilita il networking, la condivisione di competenze e l'incrocio tra domanda e offerta di lavoro nel settore acquatico.

![Stato](https://img.shields.io/badge/Stato-In_sviluppo-yellow)
![Versione](https://img.shields.io/badge/Versione-1.0.0-blue)
![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=white)
![Appwrite](https://img.shields.io/badge/Backend-Appwrite-FD366E?logo=appwrite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)

---

## ✨ Funzionalità principali

### 👤 Profili "Passaporto Natatorio"
- Due tipi di account: **Professionista** (istruttore, assistente bagnanti, allenatore…) e **Struttura** (piscina, centro sportivo).
- Foto profilo e copertina caricate dal dispositivo, esperienze, **brevetti con scadenza** e badge automatici (FIN, Salvamento).
- **Competenze confermabili dai collegamenti** (endorsement) e barra di completamento del profilo.
- Passaporto scaricabile in PDF, profilo condivisibile via link.
- **Pagine Struttura** gestite da uno o più amministratori, con staff, bacheca interna, turni e statistiche.

### 📰 Feed
- Post con testo, foto, video e **video-analisi tecnica** (commenti legati a un istante del video).
- Consigli (like), commenti e risposte, post consigliati dai collegamenti.
- Modifica ed eliminazione dei propri contenuti, link permanente per ogni post, segnalazioni.

### 💼 Lavoro
- Annunci pubblicati da strutture verificate, **SOS Vasca** per le sostituzioni urgenti.
- Ricerca con tolleranza agli errori di battitura, filtri per ruolo, contratto e zona, ordinamento.
- Candidatura rapida o personalizzata, gestione dei candidati e assunzione.

### 🤝 Network e messaggi
- Richieste di collegamento, suggerimenti, ricerca di persone e strutture, Swim-Meet (eventi).
- Chat in tempo reale con stato online, "sta scrivendo" e conferme di lettura disattivabili.

### 🔔 Notifiche, account e privacy
- Centro notifiche in tempo reale (consigli, commenti, collegamenti, candidature, conferme).
- Verifica email, recupero e cambio password, cambio email, uscita dagli altri dispositivi.
- **Esportazione dei dati** ed **eliminazione dell'account** (GDPR), pagine Privacy, Termini e Cookie.

### 🔒 Sicurezza
- Permessi per singola riga su Appwrite: ognuno modifica solo i propri contenuti, i messaggi sono leggibili solo da mittente e destinatario.
- Le operazioni tra più utenti passano da una **Appwrite Function** che verifica identità e diritti, coperta da test automatici.

---

## 🛠️ Stack Tecnologico

**Frontend:**
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) (Build tool ultrarapido)
- [Tailwind CSS v3.4](https://tailwindcss.com/) + PostCSS (Styling)
- [React Router v6](https://reactrouter.com/) (Navigazione)

**Backend (BaaS):**
- [Appwrite Cloud](https://appwrite.io/)
  - **Auth**: Gestione sessioni e sicurezza.
  - **Databases (MariaDB)**: Collezioni relazionali per Profili, Post, Messaggi, Jobs.
  - **Storage**: Bucket per Avatar e Media dei Post.
  - **Realtime**: Connessioni WebSocket per feed e chat istantanee.
  - **Document Security**: Protezione E2E/Rest per la privacy della messaggistica.

---

## 🚀 Installazione e Avvio Locale

Requisiti: Node.js 20+ e un progetto Appwrite (Cloud).

```bash
git clone https://github.com/diegoz91/swimwaveup.0.0.1.git
cd swimwaveup.0.0.1
npm install
cp .env.example .env          # inserisci endpoint e project ID di Appwrite
npm run dev                   # http://localhost:3000
```

### Backend Appwrite

Database, permessi, storage e la Function `api` si configurano con uno script:

```bash
cp .env.setup.example .env.setup   # API key di amministrazione, MAI committarla
npm run setup-db
```

Guida completa: [`docs/SETUP-APPWRITE.md`](docs/SETUP-APPWRITE.md).

### Comandi utili

| Comando | Cosa fa |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Type-check + build di produzione |
| `npm run typecheck` | Solo controllo dei tipi |
| `npm run setup-db` | Crea/aggiorna schema Appwrite e Function |
| `npm run reset-db -- --yes` | ⚠️ Cancella tutti i dati dell'ambiente di test |
| `npm test` | Test del frontend |
| `cd functions/api && npm test` | Test della Function server-side |

### Struttura

```
src/            Frontend React (pages, features, services, hooks)
functions/api/  Appwrite Function per le operazioni tra più utenti
setup-db.js     Schema e permessi del database (fonte di verità)
docs/           Guide operative
```
