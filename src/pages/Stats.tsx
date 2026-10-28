import React from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Icon } from '@/components/ui/Icon';
import { isPremium } from '@/utils/premium';
import { StatsDashboard } from '@/features/premium/StatsDashboard';

/** Statistiche del proprio profilo e dei post: visibili solo a chi le guarda. */
const Stats: React.FC = () => {
    usePageTitle('Statistiche');
    const { user } = useAuth();
    if (!user) return null;
    return (
        <div className="max-w-5xl mx-auto w-full pt-4 pb-10">
            <Link to="/profile" className="inline-flex items-center gap-1.5 py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">
                <Icon type="arrow-left" className="w-4 h-4" /> Il tuo profilo
            </Link>
            <header className="mt-3 mb-6">
                <h1 className="text-3xl font-bold text-abisso">Statistiche</h1>
                <p className="text-slate-500 mt-1 flex items-center gap-1.5"><Icon type="lock-closed" className="w-4 h-4" /> Ultimi 30 giorni, visibili solo a te.</p>
            </header>
            <StatsDashboard premium={isPremium(user)} showViewers={user.userType !== 'structure'} />
        </div>
    );
};

export default Stats;
