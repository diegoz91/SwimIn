import React from 'react';
import { Link } from 'react-router';

/** Link legali mostrati nelle pagine pubbliche (accesso e registrazione). */
export const PublicFooter: React.FC = () => (
    <footer className="mt-8 text-center text-xs text-slate-500 space-x-4">
        <span>© {new Date().getFullYear()} SwimIn</span>
        <Link to="/privacy" className="hover:text-blue-600">Privacy</Link>
        <Link to="/termini" className="hover:text-blue-600">Termini</Link>
        <Link to="/cookie" className="hover:text-blue-600">Cookie</Link>
    </footer>
);
