import React from 'react';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { usePageTitle } from '@/hooks/usePageTitle';
import { RegisterForm } from '@/features/auth/components/RegisterForm';

const Register: React.FC = () => {
  usePageTitle('Crea il tuo account');
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-50 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-full h-64 bg-gradient-to-b from-cyan-500/10 to-transparent pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 translate-y-1/2"></div>
      
      <div className="w-full max-w-md z-10">
        <RegisterForm />
        <PublicFooter />
      </div>
    </div>
  );
};

export default Register;