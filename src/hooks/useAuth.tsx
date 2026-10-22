import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { ID } from 'appwrite';
import { account } from '@/services/appwrite';
import { databaseService } from '@/services/database';
import type { AuthenticatedUser, UserProfile, StructureProfile } from '@/types/types';

interface AuthContextType {
  user: AuthenticatedUser | null;
  authenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, userType?: 'professional' | 'structure') => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  
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
      setIsLoading(false);
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

  const register = async (email: string, password: string, name: string, userType: 'professional' | 'structure' = 'professional') => {
    if (isActionPending.current) return;
    isActionPending.current = true;
    setIsLoading(true);
    try {
      const newAccount = await account.create(ID.unique(), email, password, name);
      
      // Auto-Login immediato dopo la creazione
      await account.createEmailPasswordSession(email, password);
      
      await databaseService.initializeProfile(newAccount.$id, email, userType, name);
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