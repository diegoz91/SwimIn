/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APPWRITE_ENDPOINT: string;
  readonly VITE_APPWRITE_PROJECT_ID: string;
  /** "off" nasconde l'accesso con Google (provider non ancora configurato in Appwrite). */
  readonly VITE_GOOGLE_AUTH?: string;
  /** "on" mostra la sezione Live (spenta al lancio: compare "in arrivo"). */
  readonly VITE_LIVE?: string;
  /** "off" toglie l'avviso della fase di test (al lancio pubblico). */
  readonly VITE_BETA?: string;
  /** "off" disattiva il salvataggio diretto in Google Calendar (resta il link precompilato). */
  readonly VITE_GOOGLE_CALENDAR_API?: string;
  /** "on" mostra a tutti la pagina di manutenzione (quando Appwrite non risponde e non si può usare il pannello admin). */
  readonly VITE_MAINTENANCE?: string;
  /** Testo della pagina di manutenzione decisa al rilascio. */
  readonly VITE_MAINTENANCE_MESSAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}