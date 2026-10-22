import React from 'react';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { usePageTitle } from '@/hooks/usePageTitle';

const Login: React.FC = () => {
  usePageTitle('Accedi');
  return (
    <AuthLayout aside={{ title: 'Bentornato in vasca.', text: 'Messaggi, offerte e richieste di sostituzione ti aspettano.' }}>
      <LoginForm />
    </AuthLayout>
  );
};

export default Login;
