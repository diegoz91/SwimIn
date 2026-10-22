import { useEffect } from 'react';

const APP_NAME = 'SwimIn';

/** Imposta il titolo della scheda del browser per la pagina corrente. */
export const usePageTitle = (title?: string | null) => {
    useEffect(() => {
        document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} - Il network dei professionisti del nuoto`;
    }, [title]);
};
