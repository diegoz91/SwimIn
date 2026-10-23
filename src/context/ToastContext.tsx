import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { isRecentPremiumMessage } from '@/services/premiumPrompt';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast deve essere utilizzato all\'interno di un ToastProvider');
    }
    return context;
};

interface ToastProviderProps {
    children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        // Già mostrato nell'invito a Premium: niente doppione.
        if (isRecentPremiumMessage(message)) return;
        const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
        
        setToasts((prev) => [...prev, { id, type, message }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 4000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            
            <div className="fixed top-20 right-4 sm:top-24 sm:right-6 z-[100] flex flex-col gap-3 pointer-events-none w-full max-w-sm px-4 sm:px-0">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`flex items-start gap-3 px-4 py-4 rounded-2xl shadow-xl border pointer-events-auto transition-all animate-in slide-in-from-top-8 fade-in duration-300
                            ${toast.type === 'success' ? 'bg-white border-green-100' : ''}
                            ${toast.type === 'error' ? 'bg-white border-red-100' : ''}
                            ${toast.type === 'info' ? 'bg-white border-blue-100' : ''}
                        `}
                    >
                        <div className={`mt-0.5 rounded-full p-1 
                            ${toast.type === 'success' ? 'bg-green-100 text-green-600' : ''}
                            ${toast.type === 'error' ? 'bg-red-100 text-red-600' : ''}
                            ${toast.type === 'info' ? 'bg-blue-100 text-blue-600' : ''}
                        `}>
                            <Icon 
                                type={toast.type === 'success' ? 'check-double' : toast.type === 'error' ? 'x' : 'info'} 
                                className="w-5 h-5 flex-shrink-0" 
                            />
                        </div>
                        
                        <p className={`text-sm font-semibold flex-1 mt-1
                            ${toast.type === 'success' ? 'text-slate-800' : ''}
                            ${toast.type === 'error' ? 'text-slate-800' : ''}
                            ${toast.type === 'info' ? 'text-slate-800' : ''}
                        `}>
                            {toast.message}
                        </p>
                        
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="text-slate-400 hover:text-slate-700 transition-colors p-1 bg-slate-50 hover:bg-slate-100 rounded-full"
                            aria-label="Chiudi notifica"
                        >
                            <Icon type="x" className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};