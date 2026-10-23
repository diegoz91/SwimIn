import { describe, expect, it } from 'vitest';
import {
    check, email, integerBetween, maxLength, minLength, notAfter, passwordStrength, personName, phone, postalCode, province, required, time, url, vatNumber,
} from '../validation';
import { isoToIt, itToIso, maskDate, maskTime, normalizeTime, experiencePeriod, formatDuration, isValidISODate, monthsBetween, sortExperiences, totalExperienceMonths, addDaysISO, formatMonth } from '../dates';
import { normalizeAvailability, summarizeAvailability } from '../availability';
import { isJobOpen, jobExpiryLabel } from '../jobs';

describe('regole di validazione', () => {
    it('required e lunghezze', () => {
        expect(check('', required())).toBe('Campo obbligatorio.');
        expect(check('  ', required('Serve il nome.'))).toBe('Serve il nome.');
        expect(check('ab', minLength(3))).toMatch(/almeno 3/);
        expect(check('', minLength(3))).toBeUndefined();
        expect(check('abcd', maxLength(3))).toMatch(/Massimo 3/);
    });

    it('nomi di persona', () => {
        expect(personName("D'Angelo")).toBeUndefined();
        expect(personName('Maria Luisa')).toBeUndefined();
        expect(personName('Nicolò')).toBeUndefined();
        expect(personName('Mario3')).toBeDefined();
        expect(personName('<script>')).toBeDefined();
    });

    it('email, telefono, url', () => {
        expect(email('nome@piscina.it')).toBeUndefined();
        expect(email('nome@piscina')).toBeDefined();
        expect(phone('+39 333 123 4567')).toBeUndefined();
        expect(phone('02 1234567')).toBeUndefined();
        expect(phone('0039 3331234567')).toBeUndefined();
        expect(phone('+44 20 7946 0958')).toBeUndefined();
        expect(phone('12345')).toBeDefined();
        expect(phone('5551234567')).toBeDefined();
        expect(phone('333-abc')).toBeDefined();
        expect(url('www.piscina.it')).toBeUndefined();
        expect(url('https://piscina.it/corsi')).toBeUndefined();
        expect(url('piscina')).toBeDefined();
        expect(url('javascript:alert(1)')).toBeDefined();
    });

    it('province, CAP, partita IVA', () => {
        expect(province('MI')).toBeUndefined();
        expect(province('mb')).toBeUndefined();
        expect(province('XX')).toBeDefined();
        expect(postalCode('20121')).toBeUndefined();
        expect(postalCode('2012')).toBeDefined();
        expect(vatNumber('07643520567')).toBeUndefined(); // cifra di controllo corretta
        expect(vatNumber('07643520568')).toMatch(/non valida/);
        expect(vatNumber('123')).toMatch(/11 cifre/);
    });

    it('numeri, date e orari', () => {
        expect(integerBetween(1, 10)('5')).toBeUndefined();
        expect(integerBetween(1, 10)('11')).toBeDefined();
        expect(integerBetween(1, 10)('2.5')).toBeDefined();
        expect(notAfter('2026-10-23', 'futuro')('2026-10-24')).toBe('futuro');
        expect(notAfter('2026-10', 'futuro')('2026-09')).toBeUndefined();
        expect(time('09:30')).toBeUndefined();
        expect(time('24:00')).toBeDefined();
    });

    it('robustezza della password', () => {
        expect(passwordStrength('abc').score).toBe(0);
        expect(passwordStrength('password').label).toBe('Troppo comune');
        expect(passwordStrength('giulia2026!', ['giulia']).score).toBe(1);
        expect(passwordStrength('Vasca25metri!').score).toBeGreaterThanOrEqual(3);
    });
});

describe('date', () => {
    it('valida le date di calendario', () => {
        expect(isValidISODate('2024-02-29')).toBe(true);
        expect(isValidISODate('2023-02-29')).toBe(false);
        expect(isValidISODate('12/04/2024')).toBe(false);
        expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
        expect(formatMonth('2020-09')).toBe('set 2020');
    });

    it('calcola durate ed esperienze', () => {
        expect(monthsBetween('2020-09', '2020-09')).toBe(1);
        expect(monthsBetween('2020-09', '2022-10')).toBe(26);
        expect(formatDuration(26)).toBe('2 anni e 2 mesi');
        expect(formatDuration(12)).toBe('1 anno');
        const now = new Date(2026, 9, 23);
        expect(experiencePeriod({ role: 'a', facility: 'b', startDate: '2025-10', current: true }, now)).toBe('ott 2025 – oggi · 1 anno e 1 mese');
        expect(experiencePeriod({ role: 'a', facility: 'b', period: 'Estate 2019' }, now)).toBe('Estate 2019');
        const sorted = sortExperiences([
            { role: 'vecchia', facility: '', startDate: '2015-01', endDate: '2016-01' },
            { role: 'attuale', facility: '', startDate: '2020-01', current: true },
            { role: 'legacy', facility: '', period: '2010' },
        ]);
        expect(sorted.map((e) => e.role)).toEqual(['attuale', 'vecchia', 'legacy']);
        expect(totalExperienceMonths([
            { role: '', facility: '', startDate: '2024-01', endDate: '2024-12' },
            { role: '', facility: '', startDate: '2024-06', endDate: '2025-05' },
        ], now)).toBe(17);
    });
});


describe('disponibilità e scadenze', () => {
    it('normalizza e riassume le fasce', () => {
        expect(normalizeAvailability(['sab-mattina', 'lun-sera', 'xx', 'lun-sera'])).toEqual(['lun-sera', 'sab-mattina']);
        const weekdaysEvening = ['lun', 'mar', 'mer', 'gio', 'ven'].map((d) => `${d}-sera`);
        expect(summarizeAvailability([...weekdaysEvening, 'sab-mattina'])).toBe('Mattina: sabato · sera: feriali');
        expect(summarizeAvailability([])).toBe('');
    });

    it('annunci scaduti', () => {
        expect(isJobOpen({ isActive: true, expiresAt: '2026-10-23' }, '2026-10-23')).toBe(true);
        expect(isJobOpen({ isActive: true, expiresAt: '2026-10-22' }, '2026-10-23')).toBe(false);
        expect(isJobOpen({ isActive: true }, '2026-10-23')).toBe(true);
        expect(jobExpiryLabel({ expiresAt: '2026-10-25' }, new Date(2026, 9, 23))).toBe('Scade tra 2 giorni');
        expect(jobExpiryLabel({ expiresAt: '2026-10-23' }, new Date(2026, 9, 23))).toBe('Scade oggi');
    });
});

describe('formato italiano', () => {
    it('converte gg/mm/aaaa', () => {
        expect(isoToIt('2026-10-23')).toBe('23/10/2026');
        expect(itToIso('23/10/2026')).toBe('2026-10-23');
        expect(itToIso('1/2/2026')).toBe('2026-02-01');
        expect(itToIso('31/02/2026')).toBe('31/02/2026'); // inesistente: resta testo e la validazione lo segnala
        expect(itToIso('23/10')).toBe('23/10');
    });
    it('maschera la digitazione', () => {
        expect(maskDate('2', '')).toBe('2');
        expect(maskDate('23', '2')).toBe('23/');
        expect(maskDate('231', '23')).toBe('23/1');
        expect(maskDate('23102026', '')).toBe('23/10/2026');
        expect(maskDate('23/10/', '23/10')).toBe('23/10/');
        expect(maskDate('1/2/2026', '1/2/202')).toBe('1/2/2026');
        expect(maskDate('23/1', '23/10')).toBe('23/1'); // cancellazione
        expect(maskDate('23/10/20261', '23/10/2026')).toBe('23/10/2026');
        expect(maskTime('930', '93')).toBe('93:0');
        expect(maskTime('0930', '093')).toBe('09:30');
        expect(normalizeTime('9:30')).toBe('09:30');
        expect(normalizeTime('25:00')).toBe('25:00');
    });
});
