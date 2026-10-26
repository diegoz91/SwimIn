import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Providers
import { ToastProvider } from '@/context/ToastContext';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { SavedProvider } from '@/context/SavedContext';
import { BlocksProvider } from '@/context/BlocksContext';
import { ErrorReporter } from '@/components/common/ErrorReporter';
import { PushBridge } from '@/components/common/PushBridge';
import { PremiumPrompt } from '@/features/premium/PremiumPrompt';

// Layout & Common
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import { AppFooter } from '@/components/layout/AppFooter';
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
const JobPage = lazy(() => import('@/pages/JobPage'));
const MyJobs = lazy(() => import('@/pages/MyJobs'));
const MyApplications = lazy(() => import('@/pages/MyApplications'));
const Network = lazy(() => import('@/pages/Network'));
const Profile = lazy(() => import('@/pages/Profile'));
const Chat = lazy(() => import('@/pages/Chat'));
const Live = lazy(() => import('@/pages/Live'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Landing = lazy(() => import('@/pages/Landing'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const PostPage = lazy(() => import('@/pages/PostPage'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Search = lazy(() => import('@/pages/Search'));
const Saved = lazy(() => import('@/pages/Saved'));
const Stats = lazy(() => import('@/pages/Stats'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const Privacy = lazy(() => import('@/pages/legal/Privacy'));
const Structures = lazy(() => import('@/pages/Structures'));
const Talent = lazy(() => import('@/pages/Talent'));
const Premium = lazy(() => import('@/pages/Premium'));
const Hashtag = lazy(() => import('@/pages/Hashtag'));
const Groups = lazy(() => import('@/pages/Groups'));
const GroupPage = lazy(() => import('@/pages/GroupPage'));
const Events = lazy(() => import('@/pages/Events'));
const EventPage = lazy(() => import('@/pages/EventPage'));
const PublicProfile = lazy(() => import('@/pages/PublicProfile'));
const PublicJob = lazy(() => import('@/pages/PublicJob'));
const MyShifts = lazy(() => import('@/pages/MyShifts'));
const Admin = lazy(() => import('@/pages/Admin'));
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

/** La home: feed per chi ha effettuato l'accesso, pagina di presentazione per gli altri. */
const HomeGate: React.FC = () => {
  const { authenticated, isInitializing } = useAuth();
  if (isInitializing) return <PageLoader />;
  return authenticated ? <Home /> : <Landing />;
};

/** Pagine a schermo intero, senza header e navigazione (es. onboarding). */
const CHROMELESS = ['/benvenuto'];
const FULL_HEIGHT = ['/messages'];

/** L'area che scorre tra intestazione e menu in basso; a ogni cambio di pagina riparte dall'alto. */
const ScrollRoot: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) => {
  const { pathname } = useLocation();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (enabled) ref.current?.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [pathname, enabled]);
  if (!enabled) return <>{children}</>;
  return (
    <div id="scroll-root" ref={ref} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col">
      {children}
    </div>
  );
};

const AppContent: React.FC = () => {
  const { authenticated } = useAuth();
  const { pathname } = useLocation();
  const showChrome = authenticated && !CHROMELESS.includes(pathname);

  return (
    // Con l'intestazione e il menu in basso la pagina è un "guscio": intestazione in alto, menu in basso e
    // solo il contenuto in mezzo scorre (#scroll-root). Così le due barre restano sempre al loro posto,
    // anche sui browser degli smartphone che nascondono o spostano la barra degli indirizzi.
    <div
      className={`bg-piastrella font-sans text-abisso flex flex-col relative ${showChrome ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
      style={showChrome ? { height: '100dvh' } : undefined}
    >
      <a
        href="#contenuto"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:font-bold"
      >
        Vai al contenuto
      </a>

      <PushBridge />
      <PremiumPrompt />
      {showChrome && <Header />}

      <ScrollRoot enabled={showChrome}>
      <main
        id="contenuto"
        className={`flex-1 w-full flex flex-col ${showChrome ? 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-6 md:pb-10' : ''}`}
      >
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            {/* Ogni cambio di pagina entra con una breve dissolvenza dal basso. */}
            <div key={pathname} className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none">
            <Routes>
              {/* Rotte pubbliche */}
              <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
              <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verifica-email" element={<VerifyEmail />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/termini" element={<Terms />} />
              <Route path="/cookie" element={<Cookies />} />
              <Route path="/u/:id" element={<PublicProfile />} />
              <Route path="/offerte/:id" element={<PublicJob />} />

              {/* Rotte protette */}
              <Route path="/" element={<HomeGate />} />
              <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
              <Route path="/jobs/annunci" element={<ProtectedRoute><MyJobs /></ProtectedRoute>} />
              <Route path="/jobs/candidature" element={<ProtectedRoute><MyApplications /></ProtectedRoute>} />
              <Route path="/jobs/:id" element={<ProtectedRoute><JobPage /></ProtectedRoute>} />
              <Route path="/network" element={<ProtectedRoute><Network /></ProtectedRoute>} />
              <Route path="/profile/:id?" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
              <Route path="/live" element={<ProtectedRoute><Live /></ProtectedRoute>} />
              <Route path="/post/:id" element={<ProtectedRoute><PostPage /></ProtectedRoute>} />
              <Route path="/notifiche" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
              <Route path="/cerca" element={<ProtectedRoute><Search /></ProtectedRoute>} />
              <Route path="/benvenuto" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
              <Route path="/salvati" element={<ProtectedRoute><Saved /></ProtectedRoute>} />
              <Route path="/statistiche" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
              <Route path="/strutture" element={<ProtectedRoute><Structures /></ProtectedRoute>} />
              <Route path="/talenti" element={<ProtectedRoute><Talent /></ProtectedRoute>} />
              <Route path="/premium" element={<ProtectedRoute><Premium /></ProtectedRoute>} />
              <Route path="/hashtag/:tag" element={<ProtectedRoute><Hashtag /></ProtectedRoute>} />
              <Route path="/gruppi" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
              <Route path="/gruppi/:id" element={<ProtectedRoute><GroupPage /></ProtectedRoute>} />
              <Route path="/eventi" element={<ProtectedRoute><Events /></ProtectedRoute>} />
              <Route path="/eventi/:id" element={<ProtectedRoute><EventPage /></ProtectedRoute>} />
              <Route path="/turni" element={<ProtectedRoute><MyShifts /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />

              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      {/* Le pagine a tutta altezza (la chat) non hanno il piè di pagina: occupano lo spazio tra le due barre. */}
      {showChrome && !FULL_HEIGHT.some((p) => pathname.startsWith(p)) && <AppFooter />}
      </ScrollRoot>

      {showChrome && <BottomNav />}
      {showChrome && (
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
          <SavedProvider>
            <BlocksProvider>
              <ErrorReporter />
              <AppContent />
            </BlocksProvider>
          </SavedProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>
  );
};

export default App;
