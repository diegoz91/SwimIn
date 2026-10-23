import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAnagrafica, parseIstatRows, readCsv, readXlsx } from './istat.mjs';

const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url));

for (const [label, rows] of [['CSV Windows-1252', () => readCsv(fixture('istat-esempio.csv'))], ['XLSX', () => readXlsx(fixture('istat-esempio.xlsx'))]]) {
    test(`legge il file ISTAT (${label})`, () => {
        const { province, comuni } = buildAnagrafica(parseIstatRows(rows()));
        assert.deepEqual(comuni.MI, ['Abbiategrasso', 'Milano']);
        assert.deepEqual(comuni.FC, ['Forlì']); // accenti conservati
        assert.deepEqual(comuni.BZ, ['Bolzano']); // nome italiano
        const bz = province.find((p) => p.code === 'BZ');
        assert.deepEqual(bz, { code: 'BZ', name: 'Bolzano', region: 'Trentino-Alto Adige' });
        assert.equal(province.find((p) => p.code === 'AO').region, "Valle d'Aosta");
        assert.equal(province.find((p) => p.code === 'FC').name, 'Forlì-Cesena');
    });
}

test('rifiuta un file senza le colonne attese', () => {
    assert.throws(() => parseIstatRows([['a', 'b'], ['1', '2']]), /Intestazione ISTAT/);
});
