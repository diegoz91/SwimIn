import { describe, expect, it } from 'vitest';
import { formatDay, openStatus, parseDay, serializeDay } from './openingHours';

const WEEK = ['07:00-22:00', '07:00-22:00', '07:00-13:00,15:00-22:00', '07:00-22:00', '07:00-22:00', '09:00-19:00', 'chiuso'];
// 2026-10-26 è un lunedì: at(0, …) = lunedì.
const at = (day: number, hh: number, mm = 0) => new Date(2026, 9, 26 + day, hh, mm);

describe('orari di apertura', () => {
    it('legge e riscrive i giorni', () => {
        expect(parseDay('chiuso')).toEqual({ closed: true, ranges: [] });
        expect(parseDay('')).toBeNull();
        expect(serializeDay(parseDay('07:00-13:00,15:00-22:00'))).toBe('07:00-13:00,15:00-22:00');
        expect(formatDay('07:00-13:00,15:00-22:00')).toBe('07:00–13:00 e 15:00–22:00');
        expect(formatDay('chiuso')).toBe('Chiuso');
    });

    it('aperto adesso e prossima variazione', () => {
        expect(openStatus(WEEK, at(0, 10))).toEqual({ open: true, label: 'Aperto · chiude alle 22:00' });
        expect(openStatus(WEEK, at(2, 14))).toEqual({ open: false, label: 'Chiuso · apre alle 15:00' });
        expect(openStatus(WEEK, at(0, 23))).toEqual({ open: false, label: 'Chiuso · apre domani alle 07:00' });
        expect(openStatus(WEEK, at(6, 10))).toEqual({ open: false, label: 'Chiuso · apre domani alle 07:00' }); // domenica chiuso
        expect(openStatus(WEEK, at(5, 20))).toEqual({ open: false, label: 'Chiuso · apre lunedì alle 07:00' });
        expect(openStatus(['', '', '', '', '', '', ''], at(0, 10))).toBeNull();
    });
});
