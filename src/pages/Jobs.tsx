import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { LavoroView } from '@/features/jobs/components/LavoroView';
import { useApplyFlow } from '@/features/jobs/useApplyFlow';
import { useManagedStructures } from '@/features/jobs/useManagedStructures';

/** Bacheca lavoro (/jobs). Ogni annuncio ha la sua pagina: /jobs/:id. */
const Jobs: React.FC = () => {
    usePageTitle('Lavoro');
    const location = useLocation();
    const navigate = useNavigate();
    const apply = useApplyFlow();
    const managed = useManagedStructures();

    // Link vecchi (notifiche già inviate, segnalibri): /jobs?annuncio=… → /jobs/…
    useEffect(() => {
        const old = new URLSearchParams(location.search).get('annuncio') || (location.state as { selectedJobId?: string } | null)?.selectedJobId;
        if (old) navigate(`/jobs/${encodeURIComponent(old)}`, { replace: true });
    }, [location.search, location.state, navigate]);

    return (
        <div className="pt-4 w-full">
            <LavoroView apply={apply} isManager={!!managed?.length} />
            {apply.modal}
        </div>
    );
};

export default Jobs;
