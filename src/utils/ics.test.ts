import { describe, expect, it } from 'vitest';
import { buildIcs, icsEscape } from './ics';

describe('buildIcs', () => {
    it('crea un evento in ora italiana', () => {
        const ics = buildIcs([{ uid: 's1', title: 'Turno, vasca grande', date: '2026-11-03', start: '08:00', end: '12:30', location: 'Piscina Blu; Milano' }], new Date('2026-10-23T10:00:00Z'));
        expect(ics).toContain('DTSTART;TZID=Europe/Rome:20261103T080000');
        expect(ics).toContain('DTEND;TZID=Europe/Rome:20261103T123000');
        expect(ics).toContain('SUMMARY:Turno\\, vasca grande');
        expect(ics).toContain('LOCATION:Piscina Blu\; Milano');
        expect(ics).toContain('DTSTAMP:20261023T100000Z');
        expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    });

    it('protegge i caratteri speciali', () => {
        expect(icsEscape('a\\b\nc')).toBe('a\\\\b\\nc');
    });

    it('spezza le righe lunghe', () => {
        const ics = buildIcs([{ uid: 'x', title: 'à'.repeat(80), date: '2026-01-01', start: '09:00', end: '10:00' }]);
        const lines = ics.split('\r\n');
        expect(lines.some((l) => l.startsWith(' '))).toBe(true);
        expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    });
});
