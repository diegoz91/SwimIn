import { describe, expect, it } from 'vitest';
import { PULL_THRESHOLD, pullDistance } from './usePullToRefresh';

describe('pullDistance', () => {
    it('niente verso l’alto, metà del gesto verso il basso, con un massimo', () => {
        expect(pullDistance(-30)).toBe(0);
        expect(pullDistance(100)).toBe(50);
        expect(pullDistance(1000)).toBe(110);
    });
    it('la soglia si raggiunge con un gesto deciso', () => {
        expect(pullDistance(PULL_THRESHOLD * 2)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
        expect(pullDistance(PULL_THRESHOLD)).toBeLessThan(PULL_THRESHOLD);
    });
});
