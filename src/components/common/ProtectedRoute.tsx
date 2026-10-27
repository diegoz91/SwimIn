import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authenticated, isInitializing, incompleteAccount } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium animate-pulse">Caricamento SwimIn...</p>
        </div>
      </div>
    );
  }

  // Primo accesso con Google a metà: prima si completa l'iscrizione.
  if (incompleteAccount) return <Navigate to="/completa-account" state={{ returnTo: location.pathname + location.search }} replace />;

  if (!authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};