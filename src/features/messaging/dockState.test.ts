import { describe, expect, it } from 'vitest';
import { EMPTY_DOCK, closeWindow, maxWindowsFor, openWindow, toggleWindow } from './dockState';

describe('finestre del widget dei messaggi', () => {
    it('2 finestre sul portatile, 3 su schermo largo, nessuna sotto 1280 px', () => {
        expect([maxWindowsFor(1024), maxWindowsFor(1280), maxWindowsFor(1440), maxWindowsFor(1920)]).toEqual([0, 2, 2, 3]);
    });
    it('la più recente accanto all’elenco, senza doppioni; oltre il massimo esce la più vecchia', () => {
        let s = openWindow(EMPTY_DOCK, 'a', 2);
        s = openWindow(s, 'b', 2);
        s = openWindow(s, 'a', 2);
        expect(s.windows.map((w) => w.userId)).toEqual(['a', 'b']);
        s = openWindow(s, 'c', 2);
        expect(s.windows.map((w) => w.userId)).toEqual(['c', 'a']);
    });
    it('riaprire una finestra ridotta la riporta aperta; chiudere la toglie', () => {
        let s = toggleWindow(openWindow(EMPTY_DOCK, 'a', 2), 'a');
        expect(s.windows[0].minimized).toBe(true);
        s = openWindow(s, 'a', 2);
        expect(s.windows[0].minimized).toBe(false);
        expect(closeWindow(s, 'a').windows).toEqual([]);
    });
});
