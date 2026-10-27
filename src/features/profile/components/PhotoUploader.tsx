import React, { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';

type MediaFile = { file: File, preview: string, alt: string };

interface PhotoUploaderProps {
    files: MediaFile[];
    setFiles: React.Dispatch<React.SetStateAction<MediaFile[]>>;
    disabled?: boolean;
}

export const PhotoUploader: React.FC<PhotoUploaderProps> = ({ files, setFiles, disabled = false }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && !disabled) {
            const selectedFiles = Array.from(event.target.files);
            
            const newFiles = selectedFiles.map(file => ({
                file,
                preview: URL.createObjectURL(file),
                alt: ''
            }));
            
            setFiles(prev => [...prev, ...newFiles].slice(0, 10)); // Limite a 10 foto
        }
    };

    const removeFile = (index: number) => {
        if (disabled) return;
        const fileToRemove = files[index];
        URL.revokeObjectURL(fileToRemove.preview);
        
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const updateAltText = (index: number, text: string) => {
        setFiles(prev => prev.map((item, i) => i === index ? { ...item, alt: text } : item));
    };

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-700 text-sm">Foto Allegabili ({files.length}/10)</h3>
            </div>

            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/jpeg, image/png, image/webp" 
                multiple 
                className="hidden" 
            />

            {files.length === 0 ? (
                <div 
                    onClick={() => !disabled && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                        disabled ? 'border-slate-200 bg-slate-100 opacity-50 cursor-not-allowed' : 'border-blue-300 bg-blue-50 hover:bg-blue-100 cursor-pointer'
                    }`}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label="Aggiungi foto"
                >
                    <Icon type="photo" className={`w-10 h-10 mx-auto mb-2 ${disabled ? 'text-slate-400' : 'text-blue-500'}`} />
                    <p className={`font-semibold ${disabled ? 'text-slate-500' : 'text-blue-700'}`}>Clicca per caricare le foto</p>
                    <p className="text-xs text-slate-500 mt-1">JPEG, PNG o WEBP (Max 5MB)</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {files.map((item, index) => (
                        <div key={index} className="flex gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-xs items-start animate-in zoom-in-95 duration-200">
                           <img src={item.preview} alt="Preview" className="w-20 h-20 object-cover rounded-md border border-slate-100 shrink-0" />
                           <div className="flex-1 flex flex-col gap-2">
                                <input 
                                    type="text" 
                                    value={item.alt}
                                    onChange={(e) => updateAltText(index, e.target.value)}
                                    placeholder="Aggiungi una descrizione (Alt text)"
                                    className="w-full text-sm p-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-hidden bg-slate-50 focus:bg-white transition-colors"
                                    disabled={disabled}
                                />
                           </div>
                           <button 
                               onClick={() => removeFile(index)} 
                               disabled={disabled}
                               className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed outline-hidden focus-visible:ring-2 focus-visible:ring-red-500 transition-colors"
                               title="Rimuovi foto"
                           >
                               <Icon type="x" className="w-5 h-5"/>
                           </button>
                        </div>
                    ))}
                    {files.length < 10 && (
                         <button
                            onClick={() => !disabled && fileInputRef.current?.click()}
                            disabled={disabled}
                            className={`w-full p-3 rounded-lg border-2 border-dashed text-slate-600 flex items-center justify-center font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
                                disabled 
                                    ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-50' 
                                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 cursor-pointer'
                            }`}
                        >
                            <Icon type="plus" className="w-5 h-5 mr-2" />
                            Aggiungi altre foto
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};