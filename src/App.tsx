import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Providers
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

// Layout & Common
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageLoader } from '@/components/common/PageLoader';

// Widget Chat (sempre presente da loggati, caricato a parte)
const GlobalChatWidget = lazy(() =>
  import('@/features/messaging/components/GlobalChatWidget').then((m) => ({ default: m.GlobalChatWidget }))
);

// Pagine: ognuna è un chunk separato, scaricato solo quando serve.
const Home = lazy(() => import('@/pages/Home'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Jobs = lazy(() => import('@/pages/Jobs'));
const Network = lazy(() => import('@/pages/Network'));
const Profile = lazy(() => import('@/pages/Profile'));
const Chat = lazy(() => import('@/pages/Chat'));
const Live = lazy(() => import('@/pages/Live'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const Privacy = lazy(() => import('@/pages/legal/Privacy'));
const Terms = lazy(() => import('@/pages/legal/Terms'));
const Cookies = lazy(() => import('@/pages/legal/Cookies'));

/** Login e registrazione non hanno senso da loggati: si torna alla pagina richiesta o al feed. */
const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authenticated, isInitializing } = useAuth();
  const location = useLocation();
  if (isInitializing) return <PageLoader />;
  if (authenticated) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { authenticated } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-200 selection:text-blue-900 flex flex-col relative">
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-bold"
      >
        Vai al contenuto
      </a>

      {authenticated && <Header />}

      <main
        id="contenuto"
        className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col ${authenticated ? 'pt-16 pb-24 md:pb-10' : ''}`}
      >
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Rotte pubbliche */}
              <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
              <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verifica-email" element={<VerifyEmail />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/termini" element={<Terms />} />
              <Route path="/cookie" element={<Cookies />} />

              {/* Rotte protette */}
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
              <Route path="/network" element={<ProtectedRoute><Network /></ProtectedRoute>} />
              <Route path="/profile/:id?" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/live" element={<ProtectedRoute><Live /></ProtectedRoute>} />
              <Route path="/post/:id" element={<ProtectedRoute><PostPage /></ProtectedRoute>} />
              <Route path="/notifiche" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />

              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {authenticated && <BottomNav />}
      {authenticated && (
        <Suspense fallback={null}>
          <GlobalChatWidget />
        </Suspense>
      )}
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
