import React, { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import type { SignatureData } from '../types';

interface SignatureInputProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (signature: SignatureData) => void;
    currentSignature?: SignatureData;
    askForSignerName?: boolean;
}

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

const FONT_OPTIONS = [
    { name: 'Dancing Script', style: { fontFamily: '"Dancing Script", cursive', fontSize: '2.5rem' } },
    { name: 'Pacifico', style: { fontFamily: '"Pacifico", cursive', fontSize: '2rem' } },
    { name: 'Caveat', style: { fontFamily: '"Caveat", cursive', fontSize: '2.5rem' } },
];

export const SignatureInput: React.FC<SignatureInputProps> = ({ isOpen, onClose, onSave, currentSignature, askForSignerName = false }) => {
    const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload' | 'qr'>('draw');
    const [typedName, setTypedName] = useState('');
    const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].style.fontFamily);
    const [signerName, setSignerName] = useState('');
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const sigPadRef = useRef<SignatureCanvas>(null);

    useEffect(() => {
        if (isOpen) {
            // Reset and load current signature when modal opens
            sigPadRef.current?.clear();
            if (currentSignature) {
                setActiveTab(currentSignature.mode);
                if (currentSignature.mode === 'type') {
                    setTypedName(currentSignature.data);
                    setFontFamily(currentSignature.fontFamily || FONT_OPTIONS[0].style.fontFamily);
                } else if (currentSignature.mode === 'upload') {
                    setUploadedImage(currentSignature.data);
                }
                setSignerName(currentSignature.signedBy || '');
            } else {
                 // Reset to default state if no current signature
                setActiveTab('draw');
                setTypedName('');
                setFontFamily(FONT_OPTIONS[0].style.fontFamily);
                setUploadedImage(null);
                setSignerName('');
            }
        }
    }, [isOpen, currentSignature]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    
    const handleSave = () => {
        if (askForSignerName && !signerName.trim()) {
            alert('Por favor, ingresa el nombre del firmante.');
            return;
        }

        let signatureData: SignatureData | null = null;
        if (activeTab === 'draw' && sigPadRef.current && !sigPadRef.current.isEmpty()) {
            signatureData = {
                mode: 'draw',
                data: sigPadRef.current.getTrimmedCanvas().toDataURL('image/png')
            };
        } else if (activeTab === 'type' && typedName.trim()) {
            signatureData = {
                mode: 'type',
                data: typedName.trim(),
                fontFamily: fontFamily,
            };
        } else if (activeTab === 'upload' && uploadedImage) {
            signatureData = {
                mode: 'upload',
                data: uploadedImage
            };
        }

        if (signatureData) {
            onSave({
                ...signatureData,
                signedBy: signerName.trim() || undefined,
                signedAt: new Date().toISOString()
            });
            onClose();
        } else {
            alert('Por favor, completa la firma antes de guardar.');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await toBase64(e.target.files[0]);
            setUploadedImage(base64);
        }
    };

    if (!isOpen) return null;

    const TabButton: React.FC<{ tab: 'draw' | 'type' | 'upload' | 'qr', label: string, disabled?: boolean }> = ({ tab, label, disabled }) => (
        <button
            type="button"
            onClick={() => !disabled && setActiveTab(tab)}
            disabled={disabled}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-xl w-full mx-4">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Registrar Firma</h2>
                
                <div className="border-b border-slate-200 mb-4">
                    <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                        <TabButton tab="draw" label="Dibujar" />
                        <TabButton tab="type" label="Escribir" />
                        <TabButton tab="upload" label="Cargar" />
                        <TabButton tab="qr" label="QR" disabled={true} />
                    </nav>
                </div>

                <div className="min-h-[250px]">
                    {activeTab === 'draw' && (
                        <div>
                            <div className="bg-slate-100 border border-slate-300 rounded-md">
                                <SignatureCanvas ref={sigPadRef} canvasProps={{ className: 'w-full h-48' }} />
                            </div>
                            <button onClick={() => sigPadRef.current?.clear()} className="text-sm text-blue-600 hover:underline mt-2">Limpiar</button>
                        </div>
                    )}
                    {activeTab === 'type' && (
                        <div className="flex flex-col gap-4">
                            <input
                                type="text"
                                value={typedName}
                                onChange={e => setTypedName(e.target.value)}
                                placeholder="Escribe tu nombre completo"
                                className="block w-full text-lg text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                            <div className="bg-slate-100 border border-slate-300 rounded-md min-h-[80px] flex items-center justify-center p-4">
                                <span style={{ ...FONT_OPTIONS.find(f => f.style.fontFamily === fontFamily)?.style }}>{typedName || "Vista Previa"}</span>
                            </div>
                            <div className="flex justify-center gap-2">
                                {FONT_OPTIONS.map(font => (
                                    <button
                                        key={font.name}
                                        onClick={() => setFontFamily(font.style.fontFamily)}
                                        className={`px-3 py-1 rounded-full text-sm ${fontFamily === font.style.fontFamily ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}
                                        style={{ fontFamily: font.style.fontFamily.split(',')[0] }}
                                    >
                                        {font.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {activeTab === 'upload' && (
                         <div className="flex flex-col items-center gap-4">
                             <div className="w-full h-40 bg-slate-100 border border-slate-300 rounded-md flex items-center justify-center">
                                {uploadedImage ? <img src={uploadedImage} alt="Firma" className="max-w-full max-h-full object-contain" /> : <p className="text-slate-500">Vista Previa</p>}
                             </div>
                            <input type="file" accept="image/png, image/jpeg" onChange={handleFileUpload} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        </div>
                    )}
                     {activeTab === 'qr' && (
                        <div className="text-center p-10">
                            <p className="font-semibold text-slate-700">Firma Remota con QR (Próximamente)</p>
                            <p className="text-sm text-slate-500 mt-2">Esta función te permitirá enviar una solicitud de firma a un dispositivo móvil para una captura más fácil.</p>
                        </div>
                    )}
                </div>

                {askForSignerName && (
                     <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-600 mb-1">Nombre del Firmante</label>
                        <input
                            type="text"
                            value={signerName}
                            onChange={e => setSignerName(e.target.value)}
                            placeholder="Nombre completo de quien firma"
                            className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                )}
                
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <button onClick={onClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Guardar Firma</button>
                </div>
            </div>
        </div>
    );
};
