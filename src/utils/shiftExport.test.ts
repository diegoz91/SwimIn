import { describe, expect, it } from 'vitest';
import { buildShiftsCsv, shiftTotals } from './shiftExport';
import type { ShiftExportRow } from '@/services/database';

const row = (over: Partial<ShiftExportRow>): ShiftExportRow => ({ id: 'x', date: '2026-11-04', start: '09:00', end: '13:30', hours: 4.5, userId: 'anna', userName: 'Anna Rossi', role: 'Istruttrice', status: 'confirmed', ...over });

describe('esportazione dei turni', () => {
    const rows = [
        row({ id: 'a' }),
        row({ id: 'b', date: '2026-11-05', start: '15:00', end: '18:00', hours: 3, status: 'scheduled' }),
        row({ id: 'c', userId: 'bob', userName: 'Bob "Bobo" Bianchi', role: 'Assistente; bagnanti', hours: 2 }),
        row({ id: 'd', userId: 'bob', userName: 'Bob "Bobo" Bianchi', hours: 4, status: 'declined' }),
    ];

    it('totali per persona senza i turni rifiutati', () => {
        expect(shiftTotals(rows)).toEqual([
            { name: 'Anna Rossi', shifts: 2, hours: 7.5 },
            { name: 'Bob "Bobo" Bianchi', shifts: 1, hours: 2 },
        ]);
    });

    it('CSV per Excel in italiano', () => {
        const csv = buildShiftsCsv(rows, { structureName: 'Piscina Lido', month: '2026-11' });
        expect(csv.startsWith('﻿Turni Piscina Lido;11/2026\r\n')).toBe(true);
        expect(csv).toContain('\r\nData;Giorno;Persona;Ruolo;Inizio;Fine;Ore;Stato\r\n');
        expect(csv).toContain('04/11/2026;mer;Anna Rossi;Istruttrice;09:00;13:30;4,5;Confermato');
        expect(csv).toContain('05/11/2026;gio;Anna Rossi;Istruttrice;15:00;18:00;3;Da confermare');
        expect(csv).toContain('"Bob ""Bobo"" Bianchi";"Assistente; bagnanti"');
        expect(csv).toContain(';Non può\r\n');
        expect(csv).toContain('\r\nAnna Rossi;;2;7,5\r\n');
        expect(csv.endsWith('Totale;;3;9,5\r\n')).toBe(true);
    });
});
