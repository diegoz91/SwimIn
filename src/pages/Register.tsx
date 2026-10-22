import React from 'react';
import { RegisterForm } from '@/features/auth/components/RegisterForm';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { usePageTitle } from '@/hooks/usePageTitle';

const Register: React.FC = () => {
  usePageTitle('Crea il tuo account');
  return (
    <AuthLayout
      aside={{
        title: 'Il tuo profilo da professionista del nuoto.',
        text: 'Brevetti con scadenza, competenze confermate dai colleghi e offerte di lavoro della tua zona.',
      }}
    >
      <RegisterForm />
    </AuthLayout>
  );
};

export default Register;
