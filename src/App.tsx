import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Providers
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

// Layout & Common
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

// Widget Chat
import { GlobalChatWidget } from '@/features/messaging/components/GlobalChatWidget';

// Pagine
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Jobs from '@/pages/Jobs';
import Network from '@/pages/Network';
import Profile from '@/pages/Profile';
import Chat from '@/pages/Chat';
import Live from '@/pages/Live';
import ResetPassword from '@/pages/ResetPassword';

const AppContent: React.FC = () => {
  const { authenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-200 selection:text-blue-900 flex flex-col relative">
      
      {/* VISIBILE SOLO SE LOGGATO */}
      {authenticated && <Header />}
      
      <main className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col ${authenticated ? 'pt-20 pb-20 md:pb-8' : 'py-10'}`}>
        <Routes>
          {/* Rotte Pubbliche */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Rotte Protette */}
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
          <Route path="/network" element={<ProtectedRoute><Network /></ProtectedRoute>} />
          <Route path="/profile/:id?" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          
          {/* Bordo Vasca Live */}
          <Route path="/live" element={<ProtectedRoute><Live /></ProtectedRoute>} />

          {/* Rotta di Fallback */}
          <Route path="*" element={<Navigate to={authenticated ? "/" : "/login"} replace />} />
        </Routes>
      </main>

      {/* VISIBILI SOLO SE LOGGATO */}
      {authenticated && <BottomNav />}
      {authenticated && <GlobalChatWidget />}
      
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
};

export default App;