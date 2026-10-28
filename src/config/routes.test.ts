import { describe, expect, it } from 'vitest';
import { EVENTS_PATH, GROUPS_PATH, networkPath, networkTabOf } from './routes';

describe('schede della Rete', () => {
    it('indirizzi delle schede', () => {
        expect(networkPath()).toBe('/network');
        expect(GROUPS_PATH).toBe('/network?tab=gruppi');
        expect(EVENTS_PATH).toBe('/network?tab=eventi');
    });
    it('scheda dall’indirizzo, con ripiego sui collegamenti', () => {
        expect(networkTabOf('eventi')).toBe('eventi');
        expect(networkTabOf('gruppi')).toBe('gruppi');
        expect(networkTabOf(null)).toBe('collegamenti');
        expect(networkTabOf('altro')).toBe('collegamenti');
    });
});
