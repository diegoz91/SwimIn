# Privacy e sicurezza in SwimIn: la mappa

Per ogni area dell'app: **quali dati**, **chi li vede**, **come sono protetti**, **per quanto restano**, se le azioni dello staff su quei dati finiscono nel **registro degli accessi** e se rientrano in una **conservazione su ordine dell'autorità**.
Va aggiornata insieme al codice: una nuova tabella o funzione con dati personali si aggiunge qui, con il suo tempo di conservazione in `functions/api/src/cleanup.js`.

Regole che valgono ovunque:

- **Permessi per riga.** Ogni riga e ogni file ha i suoi permessi; le tabelle con dati di più persone sono scritte solo dalla Function `api`, che verifica chi chiama (`x-appwrite-user-id`). Le righe create dalla Function hanno solo permessi di lettura.
- **In transito sempre cifrato** (HTTPS/TLS, HSTS). File nei bucket cifrati sul disco e con antivirus quando il piano Appwrite lo consente.
- **Minimo necessario.** Email solo nell'account (mai sul profilo), telefono delle persone e CV in tabelle o bucket privati.
- **Lo staff non legge i messaggi.** Nessuna azione amministrativa mostra messaggi privati. Le azioni `admin*` e `legal*` sono registrate in automatico (`audit_log`), anche quando vengono negate.
- **Nessuna conservazione "per sicurezza".** I dati si cancellano secondo i tempi qui sotto. Si conservano oltre solo con un ordine formale di un'autorità: in quel caso la Function fa una copia cifrata (`held_items`) che si apre solo con la chiave privata custodita fuori linea.

## Mappa per area

Legenda delle ultime due colonne:
- **Reg.** = le azioni dello staff su questi dati sono nel registro degli accessi.
- **Cons.** = questi dati entrano nella copia sigillata quando un ordine riguarda la persona (P) o la conversazione (C).

| Area | Dati | Chi li vede | Protezione | Per quanto | Reg. | Cons. |
|---|---|---|---|---|---|---|
| Account e accesso | email, password, sessioni, IP, accessi, 2FA | la persona; Appwrite | password solo come impronta (Argon2), 2FA TOTP, limiti sui tentativi | durata dell'account | ricerca utenti, sospensione | P (account, accessi e IP, sessioni) |
| Consenso | data e versione di Termini e Privacy | nessuno dal client | `private_info`, scritta solo da `initProfile` | durata dell'account | — | P |
| Profilo | nome, foto, ruolo, brevetti, esperienze, città | utenti registrati; il pubblico solo se il profilo è pubblico (strutture sempre) | tabella in sola lettura, modifiche solo da `updateMyProfile` | durata dell'account | — | P |
| Telefono e CV | telefono, CV in PDF | la persona, i collegamenti reciproci, chi valuta una sua candidatura | `private_info` senza permessi; bucket privato `resumes`, download con JWT | finché la persona li toglie o elimina l'account | — | P (telefono; CV come metadati) |
| Documenti dei brevetti | scansione del brevetto | la persona e gli amministratori che lo verificano | bucket privato, link firmato temporaneo | finché la persona lo toglie | sì (apertura del documento, verifica) | — |
| Messaggi e allegati | testo, file, reazioni, risposte | solo mittente e destinatario | permessi per riga, allegati in bucket privato con lettura aggiunta dalla Function, "sta scrivendo" in tabella separata | finché il mittente li elimina; se un account viene eliminato, restano al destinatario | mai visibili allo staff | P e C (anche quelli eliminati dopo l'ordine) |
| Post, commenti, reazioni | testi, foto, video, menzioni, sondaggi | utenti registrati; nei gruppi su approvazione solo i membri | creati dalla Function, filtro dei testi, voti dei sondaggi visibili solo a chi vota | finché l'autore li elimina o elimina l'account | moderazione delle segnalazioni | P (post e commenti, anche se eliminati dopo l'ordine) |
| Gruppi ed eventi | iscrizioni, liste d'attesa, link degli eventi online | membri e organizzatori; link solo a organizzatore e iscritti | tabelle scritte dalla Function, link in `event_private` | finché il gruppo o l'evento esiste | — | — |
| Annunci di lavoro | testo, sede, compenso | tutti (anche il pubblico per le offerte aperte) | scritti dalla Function, solo titolare e co-amministratori li modificano | finché la struttura esiste | — | — |
| Candidature e colloqui | candidatura, CV allegato (copia), stato, colloquio | il candidato e chi gestisce l'annuncio | righe senza scrittura dal client, copia del CV con permessi dedicati | fino a 12 mesi dopo la chiusura dell'annuncio, o finché il candidato la ritira | — | P |
| Valutazioni interne | stelle e note su una candidatura | solo chi gestisce l'annuncio, mai il candidato | `application_reviews` senza permessi per i client | come la candidatura | — | — |
| Referenze e recensioni | testi scritti da altri | referenze: autore e destinatario finché pubblicate; recensioni: tutti | permessi che cambiano con lo stato, filtro dei testi | finché vengono nascoste o eliminate | — | — |
| Area staff | turni, bacheca, chat staff, cambi turno | titolare, co-amministratori e membri dello staff, verificati a ogni lettura | tabelle senza permessi per i client, aggiornamenti tramite segnali | chat 12 mesi; turni 24 mesi; cambi turno chiusi 30 giorni | — | — |
| Notifiche, push, email | testo breve dell'avviso, iscrizioni push | solo il destinatario | permessi per riga; email solo se attive nelle preferenze | lette 90 giorni, tutte al massimo 12 mesi | — | — |
| Visite al profilo | chi ha visto quale profilo | il visitato (anonimo con `hideProfileViews`) | `profile_views` leggibile solo dalla Function | 12 mesi | — | — |
| Segnalazioni e blocchi | segnalazioni, blocchi, silenziati | segnalazioni: chi segnala e gli amministratori; blocchi: chi blocca | tabelle scritte dalla Function | segnalazioni chiuse 12 mesi; blocchi finché vengono tolti | sì (consultazione, decisione) | — |
| Premium e pagamenti | stato dell'abbonamento, id cliente Stripe/PayPal | la persona e gli amministratori | dati di pagamento solo presso Stripe e PayPal, webhook firmati | durata dell'account; le fatture le conserva il fornitore di pagamento per gli obblighi fiscali | sì (omaggi, prezzi) | — |
| Avvisi di lavoro | parole chiave, provincia | solo il proprietario | permessi per riga | finché vengono eliminati | — | — |
| Errori e suggerimenti | errore tecnico (senza contenuti), messaggi di "Scrivici" | amministratori | tabelle senza permessi per i client | errori 30 giorni; suggerimenti gestiti 12 mesi | sì | — |
| Registro degli accessi | chi, cosa, quando, su quale elemento, motivo, esito | amministratori; le voci `legal` solo il responsabile legale | solo aggiunte dalla Function, nessun contenuto | 12 mesi; voci `legal` 5 anni | — | — |
| Conservazione su ordine | copie cifrate, impronte SHA-256 | nessuno dal sistema; solo fuori linea con la chiave privata | AES-256-GCM + RSA-OAEP, chiave privata mai online | fino alla scadenza dell'ordine (di norma 60 + 30 giorni) o alla chiusura | sì (tutto) | — |
| Browser | preferenze, sessione, bozze (elenco in `pages/legal/Cookies.tsx`) | solo quel browser | nessun cookie di profilazione | finché l'utente le cancella | — | — |

## Quando entra in gioco ciascun meccanismo

| Situazione | Cosa succede | Dove nel codice |
|---|---|---|
| Iscrizione | servono Termini e Privacy accettati (16+ anni); si salvano data e versione | `initProfile`, `RegisterForm`, `CompleteAccount` |
| Un utente legge i dati di un altro (telefono, CV, candidature) | la Function controlla il rapporto (collegamento reciproco, selezionatore) a ogni richiesta | `getContactInfo`, `privateFileUrl` |
| Un amministratore apre il pannello | ogni azione `admin*` finisce nel registro, anche se negata | `audit.js`, `_withAudit` |
| Arriva una richiesta dall'autorità | il responsabile (`admin` + `legal`) registra l'ordine; la Function sigilla subito i dati | `legal.js`, *Admin › Richieste autorità* |
| Sotto ordine, l'utente cancella qualcosa | prima di cancellare resta una copia sigillata (messaggi, post, commenti, account) | `_sealBeforeDelete`, `_snapshotUser` |
| Consegna all'autorità | esportazione cifrata con impronte, apertura solo fuori linea con verifica delle impronte | `legalExportHold`, `scripts/legal/decrypt.mjs` |
| L'ordine finisce o scade | le copie si cancellano subito (chiusura) o di notte (scadenza) | `legalReleaseHold`, `_expireHolds` |
| Ogni notte alle 3 | cancellazione dei dati scaduti secondo questa tabella | `cleanup.js` |
| L'utente elimina l'account | cancellati profilo, contenuti, candidature, collegamenti, file; i messaggi restano al destinatario | `deleteAccount` |
| L'utente chiede i suoi dati | download dalle impostazioni | Impostazioni › Privacy |

## Bozza del registro dei trattamenti (art. 30 GDPR)

Da completare e far verificare al legale; i dati del titolare stanno in `src/config/legal.ts`.

| Trattamento | Finalità | Base giuridica | Interessati | Categorie di dati | Destinatari | Conservazione |
|---|---|---|---|---|---|---|
| Gestione account e profilo | fornire il social network professionale | contratto (6.1.b) | utenti | anagrafica, contatti, dati professionali | Appwrite, Vercel (responsabili) | durata dell'account |
| Messaggistica | comunicazione tra utenti | contratto | utenti | contenuti dei messaggi, allegati | Appwrite | finché eliminati dal mittente |
| Selezione del personale | candidature agli annunci delle strutture | contratto; per la struttura, misure precontrattuali | candidati | CV, esperienze, brevetti, colloqui, valutazioni | strutture che gestiscono l'annuncio (titolari autonomi) | 12 mesi dopo la chiusura dell'annuncio |
| Gestione dello staff delle strutture | turni, comunicazioni interne | contratto | staff delle strutture | turni, messaggi dello staff | struttura (titolare autonomo) | turni 24 mesi, chat 12 mesi |
| Abbonamenti Premium | pagamento e vantaggi | contratto; obbligo di legge per la parte fiscale | abbonati | stato dell'abbonamento | Stripe, PayPal (titolari autonomi) | durata dell'account |
| Sicurezza e moderazione | prevenire abusi, gestire segnalazioni | legittimo interesse (6.1.f) | utenti | segnalazioni, blocchi, accessi, errori tecnici | Appwrite | 30 giorni - 12 mesi (vedi mappa) |
| Registro degli accessi dello staff | responsabilizzazione e controllo degli accessi | legittimo interesse; art. 5.2 e 32 GDPR | staff, utenti coinvolti | identificativi, azioni, motivi | nessuno | 12 mesi; richieste autorità 5 anni |
| Conservazione su ordine dell'autorità | adempiere a ordini di conservazione e consegna | obbligo di legge (6.1.c); reg. UE 2023/1543, c.p.p. | persone oggetto dell'ordine | quelli indicati nell'ordine | autorità richiedente | fino alla scadenza dell'ordine |
| Notifiche ed email | avvisi sull'attività e riepilogo settimanale | contratto; preferenze dell'utente | utenti | email, testo dell'avviso | Appwrite Messaging, provider email | notifiche fino a 12 mesi |

## Da decidere o completare fuori dal codice

- Dati del titolare e del contatto privacy in `src/config/legal.ts`; regione del progetto Appwrite e piano Vercel per la sezione sui trasferimenti fuori UE.
- Accordi sul trattamento (DPA) con Appwrite, Vercel e il provider email; Stripe e PayPal sono titolari autonomi.
- Chi è il responsabile delle richieste delle autorità (etichette `admin` + `legal`) e dove si custodisce la chiave privata (generata con `scripts/legal/keygen.mjs`).
- Valutare con il legale se serve una valutazione d'impatto (DPIA): probabilmente no per la sola rete sociale, ma la selezione del personale su larga scala può richiederla.
- Accordo di contitolarità o di responsabilità con le strutture per candidature e dati dello staff.
