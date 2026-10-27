/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Il corpo della chiamata alla Function è { action, ...parametri }: un parametro chiamato "action"
 * sovrascrive il nome dell'azione e la Function risponde "Azione sconosciuta" (è successo con
 * respondRecommendation e moderateMember). Questo test lo impedisce in tutto database.ts.
 */
describe('callApi', () => {
    it('nessuna chiamata passa un parametro "action"', () => {
        const source = readFileSync(new URL('./database.ts', import.meta.url), 'utf8');
        const calls = [...source.matchAll(/callApi(?:<[^>]*>)?\(\s*'(\w+)'\s*,\s*\{([^}]*)\}/g)];
        expect(calls.length).toBeGreaterThan(20);
        // Chiavi dell'oggetto: "action" abbreviato o "action: …" (non i valori, es. "decision: action").
        const hasActionKey = (params: string) => params.split(',').map((p) => p.trim()).some((p) => p === 'action' || /^action\s*:/.test(p) || /^['"]action['"]\s*:/.test(p));
        const offenders = calls.filter(([, , params]) => hasActionKey(params)).map(([, name]) => name);
        expect(offenders).toEqual([]);
    });
});
