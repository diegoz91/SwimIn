import React from 'react';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { usePageTitle } from '@/hooks/usePageTitle';
import { LoginForm } from '@/features/auth/components/LoginForm';

const Login: React.FC = () => {
  usePageTitle('Accedi');
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2"></div>
      
      <div className="w-full max-w-md z-10">
        <LoginForm />
        <PublicFooter />
      </div>
    </div>
  );
};

export default Login;