import React, { useState, useEffect } from 'react';
import type { DocumentState } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentState: DocumentState;
  onExportToPdf: (filename: string) => void;
  onExportToDoc: (filename: string) => void;
}

const ExportOptionButton: React.FC<{
    // FIX: Changed JSX.Element to React.ReactNode to resolve namespace error.
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick: () => void;
    disabled?: boolean;
}> = ({ icon, title, description, onClick, disabled }) => {
    const baseClasses = "flex items-center w-full p-4 rounded-lg border text-left transition-all duration-200";
    const enabledClasses = "bg-white hover:bg-slate-50 hover:border-blue-500 hover:shadow-md cursor-pointer";
    const disabledClasses = "bg-slate-100 border-slate-200 cursor-not-allowed opacity-60";

    return (
        <button onClick={onClick} disabled={disabled} className={`${baseClasses} ${disabled ? disabledClasses : enabledClasses}`}>
            <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center mr-4 ${disabled ? 'bg-slate-200' : 'bg-blue-100'}`}>
                {icon}
            </div>
            <div>
                <h3 className={`font-semibold ${disabled ? 'text-slate-500' : 'text-slate-800'}`}>{title}</h3>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
        </button>
    );
};


export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  documentState,
  onExportToPdf,
  onExportToDoc,
}) => {
    const [fileName, setFileName] = useState('');

    useEffect(() => {
        if (documentState) {
            const safeTitle = documentState.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const folio = documentState.docNumber;
            setFileName(`${safeTitle}_${folio}`);
        }
    }, [documentState]);
    
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);


    if (!isOpen) return null;

    const handlePdfClick = () => {
        onExportToPdf(fileName.trim() || 'documento');
        onClose();
    };

    const handleDocClick = () => {
        onExportToDoc(fileName.trim() || 'documento');
        onClose();
    };
    
    const handleDriveClick = () => {
        alert('La función para guardar en Google Drive estará disponible próximamente.');
    };

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4 transform transition-all animate-fade-in-up">
                <div className="flex justify-between items-center border-b pb-3">
                    <h2 id="export-modal-title" className="text-xl font-bold text-slate-800">Exportar Documento</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <div className="py-4 space-y-4">
                    <div>
                        <label htmlFor="fileName" className="block text-sm font-medium text-slate-600 mb-1">Nombre del Archivo</label>
                        <div className="flex items-center">
                            <input
                                id="fileName"
                                type="text"
                                value={fileName}
                                onChange={(e) => setFileName(e.target.value)}
                                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        </div>
                         <p className="text-xs text-slate-500 mt-1">La extensión (.pdf o .doc) se agregará automáticamente.</p>
                    </div>

                    <div className="space-y-3 pt-2">
                        <ExportOptionButton
                            onClick={handlePdfClick}
                            title="Descargar como PDF"
                            description="Genera un archivo PDF para guardar o compartir."
                            icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>}
                        />
                        <ExportOptionButton
                            onClick={handleDocClick}
                            title="Microsoft Word (.doc)"
                            description="Descarga el documento en formato .doc compatible con Word."
                            icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>}
                        />
                        <ExportOptionButton
                            onClick={handleDriveClick}
                            title="Guardar en Google Drive"
                            description="Próximamente: Guarda tu documento directamente en la nube."
                            disabled={true}
                            icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M21.1,9.9l-7.5,12.2L3.3,9.8L8.1,1L15.6,1L21.1,9.9z"></path><path d="M9.4,15.2L12,10.2l4.8,0l-2.5,4.9"></path></svg>}
                        />
                    </div>
                </div>

                 <div className="flex justify-end gap-3 border-t pt-4">
                    <button onClick={onClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors">Cerrar</button>
                </div>
                 <style>{`
                    @keyframes fade-in-up {
                        0% { opacity: 0; transform: translateY(20px) scale(0.95); }
                        100% { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .animate-fade-in-up {
                        animation: fade-in-up 0.3s ease-out forwards;
                    }
                `}</style>
            </div>
        </div>
    );
};