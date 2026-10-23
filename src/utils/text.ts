/** Testo senza accenti e minuscolo, per confronti e ricerche ("Forlì" = "forli"). */
export const normalizeText = (s: string) =>
    s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[’`]/g, "'")
        .toLowerCase()
        .trim();
