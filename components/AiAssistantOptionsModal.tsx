import React, { useState, useEffect } from 'react';
import type { Company } from '../types';

export type AiAnalysisOptions = {
    dataSource: 'template' | 'market';
    serviceLevel: 'Profesional' | 'Semi-profesional' | 'Principiante';
};

interface AiAssistantOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (options: AiAnalysisOptions) => void;
    company: Company;
    activeCategoryName: string;
}

const RadioOption: React.FC<{
    name: string;
    value: string;
    label: string;
    description: string;
    checked: boolean;
    onChange: (value: string) => void;
}> = ({ name, value, label, description, checked, onChange }) => (
    <label className={`block p-4 border rounded-lg cursor-pointer transition-all ${checked ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white hover:bg-slate-50 border-slate-300'}`}>
        <div className="flex items-center">
            <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={(e) => onChange(e.target.value)}
                className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500"
            />
            <div className="ml-3">
                <p className="font-semibold text-slate-800">{label}</p>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
        </div>
    </label>
);

export const AiAssistantOptionsModal: React.FC<AiAssistantOptionsModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    company,
    activeCategoryName
}) => {
    const [options, setOptions] = useState<AiAnalysisOptions>({
        dataSource: 'market',
        serviceLevel: 'Semi-profesional',
    });

    const hasLaborTemplates = company.laborTemplates && company.laborTemplates.length > 0;
    const hasMaterialTemplates = company.materialTemplates && company.materialTemplates.length > 0;
    
    const showDataSourceOptions = (
        (activeCategoryName.toLowerCase().includes('mano de obra') && hasLaborTemplates) ||
        (activeCategoryName.toLowerCase().includes('materiales') && hasMaterialTemplates)
    );
    
    useEffect(() => {
        // Reset to default if the option becomes hidden
        if (!showDataSourceOptions) {
            setOptions(prev => ({ ...prev, dataSource: 'market' }));
        }
    }, [showDataSourceOptions]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const handleConfirm = () => {
        onConfirm(options);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print" role="dialog" aria-modal="true" aria-labelledby="ai-options-title">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4 transform transition-all">
                <div className="flex justify-between items-center border-b pb-3">
                    <h2 id="ai-options-title" className="text-xl font-bold text-slate-800">Configurar Asistente IA</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100">&times;</button>
                </div>

                <div className="py-4 space-y-6">
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600 flex-shrink-0 mt-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        <div>
                            <h4 className="font-semibold text-yellow-800">Revisa los resultados</h4>
                            <p className="text-sm text-yellow-700">
                                La IA puede cometer errores. Asegúrate de revisar los artículos, cantidades y precios generados para garantizar que tu cotización sea precisa.
                            </p>
                        </div>
                    </div>
                    {showDataSourceOptions && (
                        <fieldset>
                            <legend className="text-md font-semibold text-slate-700 mb-2">Fuente de Datos para Precios</legend>
                            <div className="space-y-3">
                                <RadioOption
                                    name="dataSource"
                                    value="template"
                                    label="Usar mis plantillas de precios"
                                    description="La IA usará tus costos guardados como referencia principal."
                                    checked={options.dataSource === 'template'}
                                    onChange={(val) => setOptions(prev => ({ ...prev, dataSource: val as 'template' | 'market' }))}
                                />
                                <RadioOption
                                    name="dataSource"
                                    value="market"
                                    label="Evaluación de mercado (IA)"
                                    description="La IA generará precios actualizados basados en el mercado."
                                    checked={options.dataSource === 'market'}
                                    onChange={(val) => setOptions(prev => ({ ...prev, dataSource: val as 'template' | 'market' }))}
                                />
                            </div>
                        </fieldset>
                    )}

                    <fieldset>
                        <legend className="text-md font-semibold text-slate-700 mb-2">Nivel de Servicio</legend>
                        <div className="space-y-3">
                             <RadioOption
                                name="serviceLevel"
                                value="Profesional"
                                label="Profesional"
                                description="Resultados apegados a normas. Precios más altos."
                                checked={options.serviceLevel === 'Profesional'}
                                onChange={(val) => setOptions(prev => ({ ...prev, serviceLevel: val as AiAnalysisOptions['serviceLevel'] }))}
                            />
                            <RadioOption
                                name="serviceLevel"
                                value="Semi-profesional"
                                label="Semi-profesional"
                                description="Balance entre costo y calidad. Precios moderados."
                                checked={options.serviceLevel === 'Semi-profesional'}
                                onChange={(val) => setOptions(prev => ({ ...prev, serviceLevel: val as AiAnalysisOptions['serviceLevel'] }))}
                            />
                             <RadioOption
                                name="serviceLevel"
                                value="Principiante"
                                label="Principiante"
                                description="Enfoque en el menor costo posible. Precios económicos."
                                checked={options.serviceLevel === 'Principiante'}
                                onChange={(val) => setOptions(prev => ({ ...prev, serviceLevel: val as AiAnalysisOptions['serviceLevel'] }))}
                            />
                        </div>
                    </fieldset>
                </div>

                <div className="flex justify-end gap-3 border-t pt-4">
                    <button onClick={onClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleConfirm} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Generar</button>
                </div>
            </div>
        </div>
    );
};