import { describe, expect, it } from 'vitest';
import { addMonths, hoursLabel, monthGrid, overlappingIds, shiftRange, structureColorMap, totalHours, STRUCTURE_COLORS } from '../shiftCalendar';

const s = (id: string, date: string, shiftTime: string, structureId = 'a', status: 'scheduled' | 'confirmed' | 'declined' = 'confirmed') => ({ $id: id, structureId, date, shiftTime, status });

describe('shiftCalendar', () => {
    it('legge gli orari dei turni', () => {
        expect(shiftRange('07:00–13:00')).toEqual([420, 780]);
        expect(shiftRange('9:30 - 12:00')).toEqual([570, 720]);
        expect(shiftRange('22:00–02:00')).toEqual([1320, 1560]);
        expect(shiftRange('mattina')).toBeNull();
    });

    it('somma le ore senza i turni rifiutati', () => {
        expect(totalHours([s('1', '2026-10-27', '07:00–13:00'), s('2', '2026-10-28', '09:00–10:30'), s('3', '2026-10-29', '08:00–20:00', 'a', 'declined')])).toBe(7.5);
        expect(hoursLabel(7.5)).toBe('7,5 ore');
        expect(hoursLabel(1)).toBe('1 ora');
    });

    it('trova i turni sovrapposti anche in strutture diverse', () => {
        const list = [
            s('1', '2026-10-27', '09:00–12:00', 'lido'),
            s('2', '2026-10-27', '11:00–14:00', 'aquae'),
            s('3', '2026-10-27', '14:00–16:00', 'aquae'),
            s('4', '2026-10-28', '09:00–12:00', 'lido'),
            s('5', '2026-10-28', '10:00–11:00', 'aquae', 'declined'),
        ];
        expect([...overlappingIds(list)].sort()).toEqual(['1', '2']);
    });

    it('costruisce la griglia del mese da lunedì', () => {
        const grid = monthGrid('2026-10');
        expect(grid).toHaveLength(42);
        expect(grid[0]).toBe('2026-09-28');
        expect(grid).toContain('2026-10-31');
        expect(addMonths('2026-12', 1)).toBe('2027-01');
        expect(addMonths('2026-01', -1)).toBe('2025-12');
    });

    it('dà un colore stabile a ogni struttura', () => {
        const map = structureColorMap(['b', 'a', 'b'], ['a']);
        expect(map.get('a')).toBe(STRUCTURE_COLORS[0]);
        expect(map.get('b')).toBe(STRUCTURE_COLORS[1]);
    });
});
