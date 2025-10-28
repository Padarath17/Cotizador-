import React, { useState, useEffect, useMemo } from 'react';
import type { LaborTemplate, MaterialTemplate, Tool } from '../types';

export type AiSuggestionData = {
    labor: Omit<LaborTemplate, 'id'>[];
    materials: Omit<MaterialTemplate, 'id'>[];
    tools: Omit<Tool, 'id' | 'purchaseDate'>[];
}

interface AiTemplateSuggestionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selected: AiSuggestionData) => void;
    suggestions: AiSuggestionData;
}

export const AiTemplateSuggestionsModal: React.FC<AiTemplateSuggestionsModalProps> = ({ isOpen, onClose, onConfirm, suggestions }) => {
    const [activeTab, setActiveTab] = useState<'labor' | 'materials' | 'tools'>('labor');
    const [selectedLabor, setSelectedLabor] = useState<Set<number>>(new Set());
    const [selectedMaterials, setSelectedMaterials] = useState<Set<number>>(new Set());
    const [selectedTools, setSelectedTools] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            // Pre-select all suggestions when modal opens
            setSelectedLabor(new Set(suggestions.labor.map((_, i) => i)));
            setSelectedMaterials(new Set(suggestions.materials.map((_, i) => i)));
            setSelectedTools(new Set(suggestions.tools.map((_, i) => i)));
        }
    }, [isOpen, suggestions]);

    const handleConfirm = () => {
        onConfirm({
            labor: suggestions.labor.filter((_, i) => selectedLabor.has(i)),
            materials: suggestions.materials.filter((_, i) => selectedMaterials.has(i)),
            tools: suggestions.tools.filter((_, i) => selectedTools.has(i)),
        });
    };

    const handleToggleSelection = (type: 'labor' | 'materials' | 'tools', index: number) => {
        const updater = {
            labor: setSelectedLabor,
            materials: setSelectedMaterials,
            tools: setSelectedTools,
        }[type];

        updater(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };
    
    const handleToggleSelectAll = (type: 'labor' | 'materials' | 'tools') => {
        const items = suggestions[type];
        const selectedSet = {
            labor: selectedLabor,
            materials: selectedMaterials,
            tools: selectedTools,
        }[type];
         const updater = {
            labor: setSelectedLabor,
            materials: setSelectedMaterials,
            tools: setSelectedTools,
        }[type];

        if (selectedSet.size === items.length) {
            updater(new Set());
        } else {
            updater(new Set(items.map((_, i) => i)));
        }
    };


    const TabButton: React.FC<{ tab: 'labor' | 'materials' | 'tools', label: string, count: number }> = ({ tab, label, count }) => (
        <button
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            {label}
            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{count}</span>
        </button>
    );
    
    const renderTable = (type: 'labor' | 'materials' | 'tools') => {
        const items = suggestions[type];
        if (!items || items.length === 0) return <p className="text-center text-slate-500 py-6">No hay sugerencias para esta categoría.</p>;
        
        const selectedSet = { labor: selectedLabor, materials: selectedMaterials, tools: selectedTools }[type];
        const isAllSelected = selectedSet.size === items.length;

        const headers = {
            labor: ["Descripción", "Unidad", "Precio Unit."],
            materials: ["Descripción", "Unidad", "Precio Unit."],
            tools: ["Nombre", "Calidad"],
        }[type];

        return (
            <div className="overflow-auto border rounded-lg max-h-80">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                        <tr>
                            <th className="p-2 w-10 text-center"><input type="checkbox" checked={isAllSelected} onChange={() => handleToggleSelectAll(type)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></th>
                            {headers.map(h => <th key={h} className="p-2 text-left font-semibold text-slate-600">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {items.map((item, index) => (
                            <tr key={index}>
                                <td className="p-2 text-center"><input type="checkbox" checked={selectedSet.has(index)} onChange={() => handleToggleSelection(type, index)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></td>
                                {/* FIX: Explicitly cast `value` to a string before rendering. `Object.values(item)` on a union-typed `item` results in `value` having an `unknown` type, which cannot be directly rendered by React. Converting it to a string resolves the type error. */}
                                {Object.values(item).map((value, vIndex) => <td key={vIndex} className="p-2 text-slate-700">{String(value)}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-3xl w-full mx-4 flex flex-col max-h-[90vh]">
                 <div className="flex justify-between items-center border-b pb-3 flex-shrink-0">
                    <h2 className="text-xl font-bold text-slate-800">Sugerencias de la IA</h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100">&times;</button>
                </div>

                <div className="py-4 flex-grow overflow-hidden flex flex-col">
                    <div className="border-b border-slate-200 mb-4 flex-shrink-0">
                        <nav className="-mb-px flex space-x-4" aria-label="Suggestion Tabs">
                            <TabButton tab="labor" label="Mano de Obra" count={suggestions.labor.length} />
                            <TabButton tab="materials" label="Materiales" count={suggestions.materials.length} />
                            <TabButton tab="tools" label="Herramientas" count={suggestions.tools.length} />
                        </nav>
                    </div>

                    <div className="flex-grow overflow-y-auto">
                        {activeTab === 'labor' && renderTable('labor')}
                        {activeTab === 'materials' && renderTable('materials')}
                        {activeTab === 'tools' && renderTable('tools')}
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t pt-4 flex-shrink-0">
                    <button onClick={onClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleConfirm} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">
                        Agregar Seleccionados a Mis Plantillas
                    </button>
                </div>
            </div>
        </div>
    );
};
