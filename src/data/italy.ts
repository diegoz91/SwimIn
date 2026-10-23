/**
 * Province italiane dalla fonte ufficiale ISTAT. Il file generato si aggiorna
 * ogni mese (workflow "Anagrafica comuni", script scripts/anagrafica/update.mjs);
 * i comuni di ciascuna provincia si caricano quando servono (vedi data/comuni.ts).
 */
import PROVINCE_DATA from './generated/province.json';

export interface Province {
    code: string;
    name: string;
    region: string;
}

export const PROVINCES: Province[] = (PROVINCE_DATA as Province[]).slice().sort(
    (a, b) => a.region.localeCompare(b.region, 'it') || a.name.localeCompare(b.name, 'it')
);

export const REGIONS = Array.from(new Set(PROVINCES.map((p) => p.region)));

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

export const isProvinceCode = (code?: string | null): boolean => !!code && BY_CODE.has(code.trim().toUpperCase());
export const provinceName = (code?: string | null): string | undefined => (code ? BY_CODE.get(code.trim().toUpperCase())?.name : undefined);

/** Lingue proposte nel profilo (testo libero ammesso). */
export const LANGUAGES = ['Italiano', 'Inglese', 'Spagnolo', 'Francese', 'Tedesco', 'Portoghese', 'Rumeno', 'Arabo', 'Albanese', 'Cinese', 'Russo', 'Ucraino', 'LIS (lingua dei segni)'];
