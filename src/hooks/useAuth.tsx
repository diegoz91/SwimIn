import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { ID } from 'appwrite';
import { account, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { emitNetworkChange } from '@/utils/networkEvents';
import { useSignal } from '@/hooks/useSignal';
import { databaseService } from '@/services/database';
import type { AuthenticatedUser, UserProfile, StructureProfile } from '@/types/types';
import { completeLoginChallenge, createLoginChallenge, isMfaRequired } from '@/services/mfa';

export interface RegistrationData {
  userType: 'professional' | 'structure';
  /** Solo persone: lavora nel nuoto o lo pratica per passione. */
  personType?: 'professional' | 'enthusiast';
  firstName?: string;
  lastName?: string;
  structureName?: string;
  /** Termini e Privacy accettati (con l'età minima): la Function registra data e versione. */
  acceptedTerms?: boolean;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  authenticated: boolean;
  /** Un'azione di login/registrazione/logout è in corso. */
  isLoading: boolean;
  /** Primo controllo della sessione all'apertura dell'app non ancora concluso. */
  isInitializing: boolean;
  /** 'mfa' se serve anche il codice della verifica in due passaggi (poi `completeMfa`). */
  login: (email: string, password: string) => Promise<'ok' | 'mfa'>;
  /** Conclude l'accesso con il codice dell'app o un codice di recupero. */
  completeMfa: (code: string, useRecovery?: boolean) => Promise<void>;
  register: (email: string, password: string, data: RegistrationData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile | StructureProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Account senza profilo (es. primo accesso con Google): va completato scegliendo il tipo di account. */
  incompleteAccount: { $id: string; email: string; name: string } | null;
  /** Ricontrolla la sessione (dopo l'accesso con Google). Restituisce 'ok', 'incomplete', 'mfa' o 'none'. */
  reloadSession: () => Promise<'ok' | 'incomplete' | 'mfa' | 'none'>;
  /** Crea il profilo per un account già esistente (accesso con Google). */
  completeAccount: (data: RegistrationData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve essere utilizzato all'interno di un AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [incompleteAccount, setIncompleteAccount] = useState<AuthContextType['incompleteAccount']>(null);
  
  const isActionPending = useRef<boolean>(false);

  const loadUserProfile = async (accountData: any): Promise<AuthenticatedUser | null> => {
    try {
      const profile = await databaseService.getProfile(accountData.$id);
      // L'email viene dall'account (sul profilo pubblico non c'è più).
      return { ...accountData, ...profile, email: accountData.email } as AuthenticatedUser;
    } catch (error) {
      // Solo "non trovato" vuol dire account senza profilo; gli altri errori (rete) non vanno confusi.
      if ((error as { code?: number })?.code !== 404) throw error;
      console.warn('Account senza profilo: va completato.');
      return null;
    }
  };

  const checkAuth = async (): Promise<'ok' | 'incomplete' | 'mfa' | 'none'> => {
    try {
      const accountData = await account.get();
      const fullProfile = await loadUserProfile(accountData);
      setUser(fullProfile);
      setIncompleteAccount(fullProfile ? null : { $id: accountData.$id, email: accountData.email, name: accountData.name || '' });
      return fullProfile ? 'ok' : 'incomplete';
    } catch (error) {
      setUser(null);
      setIncompleteAccount(null);
      return isMfaRequired(error) ? 'mfa' : 'none';
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Il profilo può cambiare per azioni di altri (es. una richiesta di collegamento
  // accettata): lo teniamo allineato in tempo reale.
  const userId = user?.$id;
  useEffect(() => {
    if (!userId) return;
    const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.profiles}.documents.${userId}`;
    const unsubscribe = client.subscribe(channel, (event) => {
      const payload = event.payload as Record<string, unknown> & { connections?: string[] };
      setUser((prev) => {
        if (!prev) return prev;
        const before = (prev.connections || []).join(',');
        const after = (payload.connections || prev.connections || []).join(',');
        if (before !== after) window.setTimeout(() => emitNetworkChange({ type: 'remote' }), 0);
        return { ...prev, ...payload, $id: prev.$id, email: prev.email } as AuthenticatedUser;
      });
    });
    return () => unsubscribe();
  }, [userId]);

  // Richieste di collegamento ricevute, rifiutate o ritirate: arrivano con i segnali della Function.
  useSignal(userId ? 'network:*' : null, () => emitNetworkChange({ type: 'remote' }));

  const mfaChallenge = useRef<{ id: string; recovery: boolean } | null>(null);

  const login = async (email: string, password: string): Promise<'ok' | 'mfa'> => {
    if (isActionPending.current) return 'ok';
    isActionPending.current = true;
    setIsLoading(true);
    try {
      try {
        await account.createEmailPasswordSession(email, password);
      } catch (error) {
        // Sessione rimasta aperta (es. accesso a metà con la verifica in due passaggi): la chiudiamo e riproviamo.
        if ((error as { type?: string })?.type !== 'user_session_already_exists') throw error;
        await account.deleteSession('current');
        await account.createEmailPasswordSession(email, password);
      }
      try {
        await account.get();
      } catch (error) {
        if (!isMfaRequired(error)) throw error;
        mfaChallenge.current = { id: await createLoginChallenge(false), recovery: false };
        return 'mfa';
      }
      await checkAuth();
      return 'ok';
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
      isActionPending.current = false;
    }
  };

  const completeMfa = async (code: string, useRecovery = false) => {
    setIsLoading(true);
    try {
      if (!mfaChallenge.current || mfaChallenge.current.recovery !== useRecovery) {
        mfaChallenge.current = { id: await createLoginChallenge(useRecovery), recovery: useRecovery };
      }
      await completeLoginChallenge(mfaChallenge.current.id, code);
      // Se la sessione chiede ancora un fattore, account.get() fallisce: l'errore arriva al form invece di un falso accesso.
      await account.get();
      mfaChallenge.current = null;
      await checkAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const reloadSession = () => checkAuth();

  const completeAccount = async (data: RegistrationData) => {
    if (!incompleteAccount) throw new Error('Nessun account da completare.');
    setIsLoading(true);
    try {
      await databaseService.initializeProfile(incompleteAccount.$id, incompleteAccount.email, data);
      await checkAuth();
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, data: RegistrationData) => {
    if (isActionPending.current) return;
    isActionPending.current = true;
    setIsLoading(true);
    try {
      const displayName = data.userType === 'structure'
        ? (data.structureName || '').trim()
        : `${data.firstName || ''} ${data.lastName || ''}`.trim();
      const newAccount = await account.create(ID.unique(), email, password, displayName);
      
      // Auto-Login immediato dopo la creazione
      await account.createEmailPasswordSession(email, password);
      
      await databaseService.initializeProfile(newAccount.$id, email, data);

      // Email di verifica: se il servizio email non è configurato non blocchiamo la registrazione.
      account.createVerification(`${window.location.origin}/verifica-email`).catch((e) =>
        console.warn('Email di verifica non inviata:', e)
      );

      await checkAuth();
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setIsLoading(false);
      isActionPending.current = false;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIncompleteAccount(null);
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile | StructureProfile>) => {
    if (!user) throw new Error('Nessun utente loggato');
    try {
      await databaseService.updateProfile(user.$id, updates);
      await refreshProfile();
    } catch (error) {
      console.error('updateProfile error:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const accountData = await account.get();
      const updatedProfile = await loadUserProfile(accountData);
      setUser(updatedProfile);
    } catch (error) {
      console.error('refreshProfile error:', error);
      // Sessione scaduta: si esce; un errore di rete invece lascia l'utente dov'è.
      if ((error as { code?: number })?.code === 401) setUser(null);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    authenticated: !!user, 
    isLoading,
    isInitializing,
    login,
    completeMfa,
    register,
    logout,
    updateProfile,
    refreshProfile,
    incompleteAccount,
    reloadSession,
    completeAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};