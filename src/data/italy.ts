/** Province italiane (sigla automobilistica), raggruppate per regione. */
export interface Province {
    code: string;
    name: string;
    region: string;
}

const RAW: Record<string, [string, string][]> = {
    Abruzzo: [['AQ', "L'Aquila"], ['CH', 'Chieti'], ['PE', 'Pescara'], ['TE', 'Teramo']],
    Basilicata: [['MT', 'Matera'], ['PZ', 'Potenza']],
    Calabria: [['CZ', 'Catanzaro'], ['CS', 'Cosenza'], ['KR', 'Crotone'], ['RC', 'Reggio Calabria'], ['VV', 'Vibo Valentia']],
    Campania: [['AV', 'Avellino'], ['BN', 'Benevento'], ['CE', 'Caserta'], ['NA', 'Napoli'], ['SA', 'Salerno']],
    'Emilia-Romagna': [
        ['BO', 'Bologna'], ['FE', 'Ferrara'], ['FC', 'Forlì-Cesena'], ['MO', 'Modena'], ['PR', 'Parma'],
        ['PC', 'Piacenza'], ['RA', 'Ravenna'], ['RE', 'Reggio Emilia'], ['RN', 'Rimini'],
    ],
    'Friuli-Venezia Giulia': [['GO', 'Gorizia'], ['PN', 'Pordenone'], ['TS', 'Trieste'], ['UD', 'Udine']],
    Lazio: [['FR', 'Frosinone'], ['LT', 'Latina'], ['RI', 'Rieti'], ['RM', 'Roma'], ['VT', 'Viterbo']],
    Liguria: [['GE', 'Genova'], ['IM', 'Imperia'], ['SP', 'La Spezia'], ['SV', 'Savona']],
    Lombardia: [
        ['BG', 'Bergamo'], ['BS', 'Brescia'], ['CO', 'Como'], ['CR', 'Cremona'], ['LC', 'Lecco'], ['LO', 'Lodi'],
        ['MN', 'Mantova'], ['MI', 'Milano'], ['MB', 'Monza e Brianza'], ['PV', 'Pavia'], ['SO', 'Sondrio'], ['VA', 'Varese'],
    ],
    Marche: [['AN', 'Ancona'], ['AP', 'Ascoli Piceno'], ['FM', 'Fermo'], ['MC', 'Macerata'], ['PU', 'Pesaro e Urbino']],
    Molise: [['CB', 'Campobasso'], ['IS', 'Isernia']],
    Piemonte: [
        ['AL', 'Alessandria'], ['AT', 'Asti'], ['BI', 'Biella'], ['CN', 'Cuneo'], ['NO', 'Novara'],
        ['TO', 'Torino'], ['VB', 'Verbano-Cusio-Ossola'], ['VC', 'Vercelli'],
    ],
    Puglia: [['BA', 'Bari'], ['BT', 'Barletta-Andria-Trani'], ['BR', 'Brindisi'], ['FG', 'Foggia'], ['LE', 'Lecce'], ['TA', 'Taranto']],
    Sardegna: [
        ['CA', 'Cagliari'], ['CI', 'Carbonia-Iglesias'], ['OT', 'Gallura'], ['VS', 'Medio Campidano'], ['NU', 'Nuoro'],
        ['OG', 'Ogliastra'], ['OR', 'Oristano'], ['SS', 'Sassari'], ['SU', 'Sud Sardegna'],
    ],
    Sicilia: [
        ['AG', 'Agrigento'], ['CL', 'Caltanissetta'], ['CT', 'Catania'], ['EN', 'Enna'], ['ME', 'Messina'],
        ['PA', 'Palermo'], ['RG', 'Ragusa'], ['SR', 'Siracusa'], ['TP', 'Trapani'],
    ],
    Toscana: [
        ['AR', 'Arezzo'], ['FI', 'Firenze'], ['GR', 'Grosseto'], ['LI', 'Livorno'], ['LU', 'Lucca'],
        ['MS', 'Massa-Carrara'], ['PI', 'Pisa'], ['PT', 'Pistoia'], ['PO', 'Prato'], ['SI', 'Siena'],
    ],
    'Trentino-Alto Adige': [['BZ', 'Bolzano'], ['TN', 'Trento']],
    Umbria: [['PG', 'Perugia'], ['TR', 'Terni']],
    "Valle d'Aosta": [['AO', 'Aosta']],
    Veneto: [['BL', 'Belluno'], ['PD', 'Padova'], ['RO', 'Rovigo'], ['TV', 'Treviso'], ['VE', 'Venezia'], ['VR', 'Verona'], ['VI', 'Vicenza']],
};

export const PROVINCES: Province[] = Object.entries(RAW).flatMap(([region, list]) =>
    list.map(([code, name]) => ({ code, name, region }))
);

export const REGIONS = Object.keys(RAW);

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

export const isProvinceCode = (code?: string | null): boolean => !!code && BY_CODE.has(code.trim().toUpperCase());
export const provinceName = (code?: string | null): string | undefined => (code ? BY_CODE.get(code.trim().toUpperCase())?.name : undefined);

/** Lingue proposte nel profilo (testo libero ammesso). */
export const LANGUAGES = ['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco', 'Portoghese', 'Rumeno', 'Arabo', 'Albanese', 'Cinese', 'Russo', 'Ucraino', 'LIS (lingua dei segni)'];
