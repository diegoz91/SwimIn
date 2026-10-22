import { describe, expect, it } from 'vitest';
import { AppwriteException } from 'appwrite';
import { authErrorMessage } from '@/utils/authErrors';

const appwriteError = (type: string, code = 400, message = '') => new AppwriteException(message, code, type);

describe('authErrorMessage', () => {
    it('traduce le credenziali errate', () => {
        expect(authErrorMessage(appwriteError('user_invalid_credentials', 401))).toBe('Email o password non corretti.');
    });

    it('riconosce l\'email già registrata', () => {
        expect(authErrorMessage(appwriteError('user_already_exists', 409))).toMatch(/Esiste già un account/);
    });

    it('spiega i limiti di frequenza', () => {
        expect(authErrorMessage(appwriteError('general_rate_limit_exceeded', 429))).toMatch(/Troppi tentativi/);
    });

    it('usa il messaggio di riserva per errori sconosciuti', () => {
        expect(authErrorMessage(new Error('boom'), 'Riprova')).toBe('Riprova');
    });
});
