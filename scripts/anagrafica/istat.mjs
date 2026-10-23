/**
 * Lettura del file ISTAT dei comuni (CSV con ";" in Windows-1252, oppure XLSX)
 * senza dipendenze esterne.
 */
import { inflateRawSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// CSV

/** Righe di un CSV ISTAT; gestisce virgolette, ";" e la codifica Windows-1252. */
export function readCsv(buf) {
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    // Se ci sono caratteri non validi in UTF-8 il file è in Windows-1252.
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ';') { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); cell = '';
            if (row.some((x) => x.trim())) rows.push(row);
            row = [];
        } else cell += c;
    }
    if (cell || row.length) { row.push(cell); if (row.some((x) => x.trim())) rows.push(row); }
    return rows;
}

// ---------------------------------------------------------------------------
// XLSX (zip con XML): bastano il primo foglio e le stringhe condivise.

function unzip(buf) {
    const files = {};
    // Fine della directory centrale
    let eocd = buf.length - 22;
    while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('XLSX non valido');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < count; n++) {
        const method = buf.readUInt16LE(p + 10);
        const size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(dataStart, dataStart + size);
        files[name] = method === 8 ? inflateRawSync(raw) : raw;
        p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

const decodeXml = (s) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

const colIndex = (ref) => {
    const letters = ref.replace(/\d+/g, '');
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};

export function readXlsx(buf) {
    const files = unzip(buf);
    const shared = [];
    const sst = files['xl/sharedStrings.xml']?.toString('utf8') || '';
    for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) || []) {
        shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')));
    }
    const sheetName = Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
    const sheet = files[sheetName].toString('utf8');
    const rows = [];
    for (const r of sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) || []) {
        const row = [];
        for (const c of r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
            const ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1];
            const type = (c.match(/ t="(\w+)"/) || [])[1];
            const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
            const inline = (c.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
            const value = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? decodeXml(inline || '') : decodeXml(v || '');
            row[ref ? colIndex(ref) : row.length] = value ?? '';
        }
        if (row.some((x) => x && String(x).trim())) rows.push(Array.from(row, (x) => (x == null ? '' : String(x))));
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Interpretazione

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
/** "Bolzano/Bozen" -> "Bolzano", "Valle d'Aosta/Vallée d'Aoste" -> "Valle d'Aosta" */
const italianPart = (s) => clean(s).split('/')[0].trim();
const provinceLabel = (s) =>
    italianPart(s).replace(/^(Città metropolitana di|Provincia di|Provincia autonoma di|Libero consorzio comunale di)\s+/i, '');

/** Trova le colonne per nome (le intestazioni ISTAT cambiano leggermente negli anni). */
export function parseIstatRows(rows) {
    const headerIndex = rows.findIndex((r) => r.some((c) => /sigla automobilistica/i.test(c)));
    if (headerIndex < 0) throw new Error('Intestazione ISTAT non trovata (manca "Sigla automobilistica")');
    const header = rows[headerIndex].map((h) => clean(h).toLowerCase());
    const find = (re) => header.findIndex((h) => re.test(h));
    const cols = {
        name: find(/^denominazione in italiano$/),
        sigla: find(/sigla automobilistica/),
        region: find(/^denominazione (della )?regione$/),
        uts: find(/^denominazione dell.unit. territoriale sovracomunale/),
        code: find(/codice comune formato alfanumerico/),
    };
    for (const [k, v] of Object.entries(cols)) if (v < 0 && k !== 'code') throw new Error(`Colonna ISTAT mancante: ${k}`);
    return rows
        .slice(headerIndex + 1)
        .map((r) => ({
            name: clean(r[cols.name]),
            sigla: clean(r[cols.sigla]).toUpperCase(),
            region: italianPart(r[cols.region]),
            province: provinceLabel(r[cols.uts]),
            code: cols.code >= 0 ? clean(r[cols.code]) : '',
        }))
        .filter((r) => r.name && /^[A-Z]{2}$/.test(r.sigla));
}

export function buildAnagrafica(records) {
    const byCode = new Map();
    const comuni = {};
    for (const r of records) {
        if (!byCode.has(r.sigla)) byCode.set(r.sigla, { code: r.sigla, name: r.province, region: r.region });
        (comuni[r.sigla] ||= []).push(r.name);
    }
    for (const list of Object.values(comuni)) {
        list.sort((a, b) => a.localeCompare(b, 'it'));
        for (let i = list.length - 1; i > 0; i--) if (list[i] === list[i - 1]) list.splice(i, 1);
    }
    const province = [...byCode.values()].sort((a, b) => a.region.localeCompare(b.region, 'it') || a.name.localeCompare(b.name, 'it'));
    return { province, comuni };
}
