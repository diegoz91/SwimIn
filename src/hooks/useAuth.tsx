import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { ID } from 'appwrite';
import { account } from '@/services/appwrite';
import { databaseService } from '@/services/database';
import type { AuthenticatedUser, UserProfile, StructureProfile } from '@/types/types';

export interface RegistrationData {
  userType: 'professional' | 'structure';
  firstName?: string;
  lastName?: string;
  structureName?: string;
}

interface AuthContextType {
  user: AuthenticatedUser | null;
  authenticated: boolean;
  /** Un'azione di login/registrazione/logout è in corso. */
  isLoading: boolean;
  /** Primo controllo della sessione all'apertura dell'app non ancora concluso. */
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, data: RegistrationData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile | StructureProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
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
  
  const isActionPending = useRef<boolean>(false);

  const loadUserProfile = async (accountData: any): Promise<AuthenticatedUser | null> => {
    try {
      const profile = await databaseService.getProfile(accountData.$id);
      return { ...accountData, ...profile } as AuthenticatedUser;
    } catch (error) {
      console.warn('Profilo non trovato nel database, ma account Auth esistente.');
      return null;
    }
  };

  const checkAuth = async () => {
    try {
      const accountData = await account.get();
      const fullProfile = await loadUserProfile(accountData);
      setUser(fullProfile);
    } catch (error) {
      setUser(null);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    if (isActionPending.current) return;
    isActionPending.current = true;
    setIsLoading(true);
    try {
      await account.createEmailPasswordSession(email, password);
      await checkAuth();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
      isActionPending.current = false;
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
      setUser(null);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    authenticated: !!user, 
    isLoading,
    isInitializing,
    login,
    register,
    logout,
    updateProfile,
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};