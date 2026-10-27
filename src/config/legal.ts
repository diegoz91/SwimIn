/**
 * Dati del Titolare del trattamento mostrati nelle pagine legali.
 * ⚠️ DA COMPLETARE prima del lancio pubblico: i campi tra [parentesi quadre]
 * sono segnaposto. I testi delle pagine legali sono una bozza da far
 * verificare a un consulente legale.
 */
export const LEGAL = {
    serviceName: 'SwimIn (SwimWaveUp)',
    controllerName: '[Ragione sociale o nome del titolare]',
    controllerAddress: '[Indirizzo completo]',
    vatNumber: '[Partita IVA / Codice fiscale]',
    contactEmail: '[email di contatto privacy]',
    dpoEmail: null as string | null, // Responsabile della protezione dei dati, se nominato
    lastUpdated: '27 ottobre 2026',
    isDraft: true,
} as const;
