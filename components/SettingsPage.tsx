import React, { useCallback, useState, ChangeEvent, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import type { DocumentState, ColumnKey, ColumnDefinition, CostCategory, Company, FiscalProfile, DocumentType, SignatureData, LaborTemplate, MaterialTemplate, Tool, ToolQuality } from '../types';
import { SignatureInput } from './SignatureInput';
import { AiTemplateSuggestionsModal, AiSuggestionData } from './AiTemplateSuggestionsModal';
import { INITIAL_COLUMN_DEFINITIONS, INITIAL_COMPANY_STATE, DOCUMENT_TYPES, TOOL_QUALITIES } from '../constants';
import { DatePicker } from './DatePicker';

interface SettingsPageProps {
  documentState: DocumentState;
  setDocumentState: React.Dispatch<React.SetStateAction<DocumentState>>;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  setCurrentView: (view: 'editor' | 'profile' | 'settings') => void;
  columnDefinitions: Record<string, ColumnDefinition>;
  setColumnDefinitions: React.Dispatch<React.SetStateAction<Record<string, ColumnDefinition>>>;
}

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

const fileContentToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        const data = result.split(',')[1]; // Get only the base64 part
        resolve(data);
    };
    reader.onerror = error => reject(error);
});

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
        {children}
    </div>
);

const TextInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        type="text"
        {...props}
        className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
    />
);

const NumberInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        type="number"
        {...props}
        className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
    />
);

const TagInput: React.FC<{ value: string[], onChange: (value: string[]) => void, disabled?: boolean }> = ({ value, onChange, disabled }) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = inputValue.trim();
            if (newTag && !value.includes(newTag)) {
                onChange([...value, newTag]);
            }
            setInputValue('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        onChange(value.filter(tag => tag !== tagToRemove));
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-2">
                {value.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                        {tag}
                        {!disabled && (
                           <button type="button" onClick={() => handleRemoveTag(tag)} className="text-blue-600 hover:text-blue-800">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                           </button>
                        )}
                    </span>
                ))}
            </div>
            <TextInput
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={disabled ? '' : "Escribe una opción y presiona Enter"}
            />
        </div>
    );
};


const COMPATIBLE_INPUT_TYPES: Record<ColumnDefinition['dataType'], ColumnDefinition['inputType'][]> = {
  string: ['text', 'textarea', 'select'],
  number: ['number', 'select'],
  date: ['date'],
  time: ['time'],
  boolean: ['checkbox'],
  image: ['file'],
};


export const SettingsPage: React.FC<SettingsPageProps> = ({ 
    documentState, 
    setDocumentState, 
    companies,
    setCompanies,
    activeCompanyId,
    setActiveCompanyId,
    setCurrentView, 
    columnDefinitions, 
    setColumnDefinitions 
}) => {
    const [activeColumnKey, setActiveColumnKey] = useState<ColumnKey>(
        Object.keys(columnDefinitions)[0] as ColumnKey
    );
    const [editingCompanyId, setEditingCompanyId] = useState<string | null>(activeCompanyId);
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
    const [isAddColModalOpen, setIsAddColModalOpen] = useState(false);
    const [newColumnData, setNewColumnData] = useState({ label: '', dataType: 'string' });
    const [activeTemplateTab, setActiveTemplateTab] = useState<'labor' | 'materials' | 'tools'>('labor');

    const [aiProfession, setAiProfession] = useState('');
    const [aiServiceLevel, setAiServiceLevel] = useState<ToolQuality>('Semi-profesional');
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<AiSuggestionData | null>(null);
    
    const editingCompany = companies.find(c => c.id === editingCompanyId);

    useEffect(() => {
        const keys = Object.keys(columnDefinitions);
        if (!keys.includes(activeColumnKey)) {
            setActiveColumnKey(keys[0] || '');
        }
    }, [columnDefinitions, activeColumnKey]);
    
    useEffect(() => {
        // If the active company is deleted, select another one
        if (!companies.some(c => c.id === editingCompanyId)) {
            setEditingCompanyId(companies[0]?.id || null);
        }
    }, [companies, editingCompanyId]);

    const handleColumnDefinitionChange = useCallback((key: ColumnKey, field: keyof ColumnDefinition, value: any) => {
        setColumnDefinitions(prev => {
            const newColumnDefinitions = { ...prev };
            const oldDef = newColumnDefinitions[key];
            newColumnDefinitions[key] = { ...oldDef, [field]: value };
    
            if (field === 'dataType') {
                const newDataType = value as ColumnDefinition['dataType'];
                const compatibleInputs = COMPATIBLE_INPUT_TYPES[newDataType];
                if (!compatibleInputs.includes(oldDef.inputType)) {
                    newColumnDefinitions[key].inputType = compatibleInputs[0];
                }
            }
            
            return newColumnDefinitions;
        });
    }, [setColumnDefinitions]);
    
    const handleAddCategory = () => {
        const newCategoryName = `Nueva Categoría ${documentState.categories.length + 1}`;
        const defaultVisibleColumns = Object.fromEntries(
            Object.entries(columnDefinitions).map(([key, { default: isDefault }]) => [key, isDefault])
        ) as Record<ColumnKey, boolean>;

        const newCategory: CostCategory = {
          id: crypto.randomUUID(),
          name: newCategoryName,
          subcategories: [{ id: crypto.randomUUID(), name: 'General', items: [] }],
          showItems: true,
          visibleColumns: defaultVisibleColumns,
          markupApplications: 0,
          applyVat: false,
          markupType: 'none',
          markupValue: 0,
          markupDistribution: 'proportional',
        };

        setDocumentState(prev => ({
            ...prev,
            categories: [...prev.categories, newCategory]
        }));
    };

    const handleRenameCategory = (index: number, newName: string) => {
        if (!newName.trim()) return;
        const newCategories = [...documentState.categories];
        newCategories[index].name = newName;
        setDocumentState(prev => ({ ...prev, categories: newCategories }));
    };

    const handleDeleteCategory = (index: number) => {
        if (window.confirm(`¿Estás seguro de que quieres eliminar la categoría "${documentState.categories[index].name}"?`)) {
            const newCategories = documentState.categories.filter((_, i) => i !== index);
            setDocumentState(prev => ({ ...prev, categories: newCategories }));
        }
    };
    
    const handleCompanyChange = (field: keyof Company, value: any) => {
        if (!editingCompanyId) return;
        setCompanies(prev => prev.map(c => c.id === editingCompanyId ? { ...c, [field]: value } : c));
    };

    const handleFiscalProfileChange = (field: keyof FiscalProfile, value: string) => {
        if (!editingCompanyId) return;
        setCompanies(prev => prev.map(c => 
            c.id === editingCompanyId 
            ? { ...c, fiscalProfile: { ...c.fiscalProfile, [field]: value } } 
            : c
        ));
    };

    const handleFolioChange = useCallback((docType: DocumentType, field: 'prefix' | 'counter', value: string | number) => {
        if (!editingCompanyId) return;
        setCompanies(prev => prev.map(c => {
            if (c.id === editingCompanyId) {
                const newCompany = { ...c };
                if (field === 'prefix') {
                    newCompany.folioPrefixes = { ...newCompany.folioPrefixes, [docType]: String(value) };
                } else {
                    newCompany.folioCounters = { ...newCompany.folioCounters, [docType]: Number(value) };
                }
                return newCompany;
            }
            return c;
        }));
    }, [editingCompanyId, setCompanies]);


    const handleCompanyFileChange = async (e: ChangeEvent<HTMLInputElement>, field: 'logo') => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await toBase64(e.target.files[0]);
            handleCompanyChange(field, base64);
        }
    };

    const handleFiscalFileChange = async (e: ChangeEvent<HTMLInputElement>, field: 'certificateCer' | 'privateKey') => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await fileContentToBase64(e.target.files[0]);
            handleFiscalProfileChange(field, base64);
        }
    };

    const handleSaveSignature = (signature: SignatureData) => {
        handleCompanyChange('signature', signature);
    };
    
    const handleAddNewCompany = () => {
        const newCompany = { ...INITIAL_COMPANY_STATE, id: crypto.randomUUID(), name: `Nueva Empresa ${companies.length + 1}` };
        setCompanies(prev => [...prev, newCompany]);
        setEditingCompanyId(newCompany.id);
    };

    const handleDeleteCompany = (idToDelete: string) => {
        if (companies.length <= 1) {
            alert("No puedes eliminar la única empresa.");
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres eliminar esta empresa?`)) {
            setCompanies(prev => prev.filter(c => c.id !== idToDelete));
        }
    };

    const handleAddColumn = () => {
        if (!newColumnData.label.trim()) {
            alert('El nombre de la columna no puede estar vacío.');
            return;
        }
        const newKey = newColumnData.label.trim().toLowerCase().replace(/[^a-z0-9]/gi, '_');
        if (columnDefinitions[newKey]) {
            alert('Ya existe una columna con un nombre similar.');
            return;
        }
        
        const compatibleInputs = COMPATIBLE_INPUT_TYPES[newColumnData.dataType as ColumnDefinition['dataType']];

        setColumnDefinitions(prev => ({
            ...prev,
            [newKey]: {
                label: newColumnData.label.trim(),
                default: false,
                isEditable: true,
                dataType: newColumnData.dataType as ColumnDefinition['dataType'],
                inputType: compatibleInputs[0],
                options: newColumnData.dataType === 'string' || newColumnData.dataType === 'number' ? [] : undefined,
            }
        }));
        
        setIsAddColModalOpen(false);
        setNewColumnData({ label: '', dataType: 'string' });
        setActiveColumnKey(newKey);
    };

    const handleDeleteColumn = (keyToDelete: ColumnKey) => {
        if (Object.keys(columnDefinitions).length <= 1) {
            alert('Debe haber al menos una columna.');
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres eliminar la columna "${columnDefinitions[keyToDelete].label}"?`)) {
            setColumnDefinitions(prev => {
                const newDefs = { ...prev };
                delete newDefs[keyToDelete];
                return newDefs;
            });
        }
    };
    
    type TemplateType = 'laborTemplates' | 'materialTemplates' | 'tools';
    type TemplateItem = LaborTemplate | MaterialTemplate | Tool;

    const handleAddTemplate = (type: TemplateType) => {
        if (!editingCompanyId) return;

        let newItem: TemplateItem;
        if (type === 'laborTemplates') {
            newItem = { id: crypto.randomUUID(), description: 'Nuevo Servicio', unit: 'Servicio', unitPrice: 0 };
        } else if (type === 'materialTemplates') {
            newItem = { id: crypto.randomUUID(), description: 'Nuevo Material', unit: 'Pza', unitPrice: 0 };
        } else { // tools
            newItem = { id: crypto.randomUUID(), name: 'Nueva Herramienta', quality: 'Semi-profesional', purchaseDate: new Date().toISOString().split('T')[0] };
        }

        setCompanies(prev => prev.map(c => 
            c.id === editingCompanyId 
            ? { ...c, [type]: [...(c[type] || []), newItem] }
            : c
        ));
    };
    
    // FIX: Changed `field: keyof TemplateItem` to `field: string` to accommodate different property names 
    // from different template types (LaborTemplate, MaterialTemplate, Tool). The original type resolved to 
    // only the common key ('id'), causing type errors.
    const handleTemplateChange = (type: TemplateType, index: number, field: string, value: any) => {
        if (!editingCompanyId) return;
        setCompanies(prev => prev.map(c => {
            if (c.id === editingCompanyId) {
                const newItems = [...(c[type] || [])];
                newItems[index] = { ...newItems[index], [field]: value };
                return { ...c, [type]: newItems };
            }
            return c;
        }));
    };

    const handleDeleteTemplate = (type: TemplateType, index: number) => {
        if (!editingCompanyId) return;
        setCompanies(prev => prev.map(c => 
            c.id === editingCompanyId 
            ? { ...c, [type]: (c[type] || []).filter((_: any, i: number) => i !== index) }
            : c
        ));
    };

    const generateTemplateSuggestions = async (profession: string, serviceLevel: ToolQuality): Promise<AiSuggestionData> => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const schema = {
          type: Type.OBJECT,
          properties: {
              labor: {
                  type: Type.ARRAY,
                  description: "Sugerencias para la plantilla de Mano de Obra.",
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          description: { type: Type.STRING },
                          unit: { type: Type.STRING },
                          unitPrice: { type: Type.NUMBER }
                      },
                      required: ["description", "unit", "unitPrice"]
                  }
              },
              materials: {
                  type: Type.ARRAY,
                  description: "Sugerencias para la plantilla de Materiales.",
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          description: { type: Type.STRING },
                          unit: { type: Type.STRING },
                          unitPrice: { type: Type.NUMBER }
                      },
                      required: ["description", "unit", "unitPrice"]
                  }
              },
              tools: {
                  type: Type.ARRAY,
                  description: "Sugerencias para la plantilla de Herramientas.",
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          name: { type: Type.STRING },
                          quality: {
                              type: Type.STRING,
                              enum: ['Profesional', 'Semi-profesional', 'Principiante']
                          }
                      },
                      required: ["name", "quality"]
                  }
              }
          },
          required: ["labor", "materials", "tools"]
      };

      const prompt = `
          Actúa como un asesor experto para contratistas y profesionales de oficios en México.
          Tu tarea es generar una lista de plantillas base para un profesional, basadas en su oficio y el nivel de calidad de servicio que ofrece. La moneda a utilizar es el Peso Mexicano (MXN).

          Oficio del Profesional: "${profession}"
          Nivel de Servicio Ofrecido: "${serviceLevel}"

          Descripción de los Niveles de Servicio:
          - Profesional: Utiliza materiales de alta calidad, sigue normativas, ofrece garantías. Precios altos.
          - Semi-profesional: Equilibrio costo-calidad, materiales estándar, prácticas eficientes. Precios moderados.
          - Principiante: Enfocado en el menor costo, materiales económicos, procesos básicos. Precios bajos.

          Instrucciones:
          Basado en el oficio y el nivel de servicio, genera 3 listas de sugerencias en formato JSON:
          1.  labor: Una lista de al menos 5 servicios comunes de mano de obra. Para cada servicio, proporciona 'description', 'unit' (ej: Salida, Punto, m², Hora, Servicio), y un 'unitPrice' estimado y realista para el mercado mexicano y el nivel de servicio.
          2.  materials: Una lista de al menos 5 materiales básicos y consumibles que este profesional debería considerar. Para cada material, proporciona 'description', 'unit' (ej: Pza, Kg, Rollo, Caja), y un 'unitPrice' estimado.
          3.  tools: Una lista de al menos 5 herramientas esenciales para el oficio. Para cada herramienta, proporciona 'name' y 'quality' (debe ser el mismo que el nivel de servicio de entrada).

          La respuesta DEBE ser un objeto JSON que siga el esquema proporcionado. No incluyas nada más en la respuesta.
      `;

      try {
          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: prompt,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: schema,
              },
          });
          const jsonText = response.text.trim();
          const cleanedJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '');
          const parsedJson = JSON.parse(cleanedJsonText);
          return {
              labor: parsedJson.labor || [],
              materials: parsedJson.materials || [],
              tools: parsedJson.tools || [],
          };
      } catch (error) {
          console.error("Error generating template suggestions:", error);
          throw new Error("No se pudieron generar las sugerencias. Inténtalo de nuevo.");
      }
    };

    const handleGenerateSuggestions = async () => {
        if (!aiProfession.trim() || !editingCompany) return;
        setIsGeneratingSuggestions(true);
        try {
            const suggestions = await generateTemplateSuggestions(aiProfession, aiServiceLevel);
            setAiSuggestions(suggestions);
            setIsSuggestionsModalOpen(true);
        } catch (error) {
            alert(error instanceof Error ? error.message : "Ocurrió un error desconocido.");
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    const handleConfirmSuggestions = (selected: { labor: Omit<LaborTemplate, 'id'>[], materials: Omit<MaterialTemplate, 'id'>[], tools: Omit<Tool, 'id' | 'purchaseDate'>[] }) => {
        if (!editingCompanyId) return;

        setCompanies(prev => prev.map(c => {
            if (c.id === editingCompanyId) {
                const newCompany = { ...c };

                const existingLabor = new Set(newCompany.laborTemplates.map(t => t.description.toLowerCase()));
                const newLabor = selected.labor
                    .filter(l => !existingLabor.has(l.description.toLowerCase()))
                    .map(l => ({ ...l, id: crypto.randomUUID() }));
                newCompany.laborTemplates = [...newCompany.laborTemplates, ...newLabor];

                const existingMaterials = new Set(newCompany.materialTemplates.map(t => t.description.toLowerCase()));
                const newMaterials = selected.materials
                    .filter(m => !existingMaterials.has(m.description.toLowerCase()))
                    .map(m => ({ ...m, id: crypto.randomUUID() }));
                newCompany.materialTemplates = [...newCompany.materialTemplates, ...newMaterials];

                const existingTools = new Set(newCompany.tools.map(t => t.name.toLowerCase()));
                const newTools = selected.tools
                    .filter(t => !existingTools.has(t.name.toLowerCase()))
                    .map(t => ({ ...t, id: crypto.randomUUID(), purchaseDate: new Date().toISOString().split('T')[0] }));
                newCompany.tools = [...newCompany.tools, ...newTools];

                return newCompany;
            }
            return c;
        }));
        setIsSuggestionsModalOpen(false);
    };


    const activeColumn = columnDefinitions[activeColumnKey];

    const SignaturePreview: React.FC<{signature?: SignatureData}> = ({ signature }) => {
        if (!signature) return <p className="text-slate-500">Sin firma</p>;
        if (signature.mode === 'type') {
            return <span style={{ fontFamily: signature.fontFamily, fontSize: '1.5rem' }}>{signature.data}</span>
        }
        return <img src={signature.data} alt="Signature" className="max-w-full max-h-full object-contain" />
    };

    const TemplateTabButton: React.FC<{ tab: 'labor' | 'materials' | 'tools', label: string }> = ({ tab, label }) => (
        <button
            type="button"
            onClick={() => setActiveTemplateTab(tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTemplateTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            {label}
        </button>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-slate-800">Configuración</h1>
                <button
                    onClick={() => setCurrentView('editor')}
                    className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                    Volver al Editor
                </button>
            </div>

            <div className="grid grid-cols-1 gap-8">
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-bold text-slate-700 mb-4">Perfiles de Empresa</h2>
                        <div className="space-y-2">
                           {companies.map(company => (
                               <div key={company.id} className={`p-2 rounded-md flex justify-between items-center ${editingCompanyId === company.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                    <button onClick={() => setEditingCompanyId(company.id)} className="flex-1 text-left font-medium text-slate-700">
                                        {company.name}
                                        {activeCompanyId === company.id && <span className="text-xs text-blue-600 ml-2">(Activa)</span>}
                                    </button>
                                    <button onClick={() => handleDeleteCompany(company.id)} className="p-1 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-100" title="Eliminar empresa">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                               </div>
                           ))}
                        </div>
                        <button onClick={handleAddNewCompany} className="mt-4 flex items-center gap-2 text-sm bg-slate-100 text-slate-600 font-semibold py-2 px-3 rounded-lg hover:bg-slate-200 transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Agregar Empresa
                        </button>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-bold text-slate-700 mb-4">Categorías de Costos</h2>
                        <ul className="space-y-2">
                        {documentState.categories.map((category, index) => (
                            <li key={category.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 group">
                                <input
                                    type="text"
                                    value={category.name}
                                    onChange={e => handleRenameCategory(index, e.target.value)}
                                    className="font-medium text-slate-700 bg-transparent border-0 focus:ring-1 focus:ring-blue-500 rounded-md p-1 w-full"
                                />
                                <button onClick={() => handleDeleteCategory(index)} className="text-slate-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </li>
                        ))}
                        </ul>
                        <button onClick={handleAddCategory} className="mt-4 flex items-center gap-2 text-sm bg-slate-100 text-slate-600 font-semibold py-2 px-3 rounded-lg hover:bg-slate-200 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Agregar Categoría
                        </button>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-md">
                         <h2 className="text-xl font-bold text-slate-700 mb-4">Plantillas de Cobro y Herramientas</h2>
                         
                         <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <h3 className="text-md font-semibold text-slate-700 flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8 9c0 1 .4 2.5 2 2.5S12 10 12 9s.4-2.5 2-2.5a3.6 3.6 0 0 0-1-4.3c-.6-1.1-1.8-1.7-3-1.7Z"></path><path d="m12 11 1.5 2.8L16 15l-2.2 2.2L15 20l-2.8-1.5L11 21l-1.2-2.8L7.6 16l2.2-2.2L8.5 11l2.8 1.5L12 11Z"></path></svg>
                                Asistente IA para Plantillas
                            </h3>
                            <p className="text-sm text-slate-600 mt-1 mb-3">
                                Acelera tu configuración. Indica tu oficio y la IA te dará una base de precios, materiales y herramientas.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                <FormField label="Profesión u Oficio">
                                    <TextInput value={aiProfession} onChange={e => setAiProfession(e.target.value)} placeholder="Ej: Electricista, Plomero, Albañil" />
                                </FormField>
                                <FormField label="Nivel de Servicio Ofrecido">
                                    <select value={aiServiceLevel} onChange={e => setAiServiceLevel(e.target.value as ToolQuality)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                        {Object.entries(TOOL_QUALITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                </FormField>
                            </div>
                            <div className="flex justify-end mt-3">
                                <button
                                    type="button"
                                    onClick={handleGenerateSuggestions}
                                    disabled={!aiProfession.trim() || isGeneratingSuggestions || !editingCompany}
                                    className="flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-wait text-sm"
                                >
                                    {isGeneratingSuggestions ? 'Generando...' : 'Generar Sugerencias con IA'}
                                </button>
                            </div>
                         </div>
                         
                         <div className="border-b border-slate-200 mb-4">
                            <nav className="-mb-px flex space-x-4" aria-label="Template Tabs">
                                <TemplateTabButton tab="labor" label="Mano de Obra" />
                                <TemplateTabButton tab="materials" label="Materiales" />
                                <TemplateTabButton tab="tools" label="Herramientas" />
                            </nav>
                        </div>

                        {editingCompany ? (
                            <div>
                                {activeTemplateTab === 'labor' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left text-slate-600 bg-slate-50">
                                                <tr>
                                                    <th className="p-2 font-semibold">Descripción</th>
                                                    <th className="p-2 font-semibold">Unidad</th>
                                                    <th className="p-2 font-semibold">Precio Unit.</th>
                                                    <th className="p-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(editingCompany.laborTemplates || []).map((item, index) => (
                                                    <tr key={item.id} className="border-b">
                                                        <td className="p-1"><TextInput value={item.description} onChange={e => handleTemplateChange('laborTemplates', index, 'description', e.target.value)} /></td>
                                                        <td className="p-1"><TextInput value={item.unit} onChange={e => handleTemplateChange('laborTemplates', index, 'unit', e.target.value)} /></td>
                                                        <td className="p-1"><NumberInput value={item.unitPrice} onChange={e => handleTemplateChange('laborTemplates', index, 'unitPrice', parseFloat(e.target.value) || 0)} /></td>
                                                        <td className="p-1 text-center"><button onClick={() => handleDeleteTemplate('laborTemplates', index)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100">&times;</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <button onClick={() => handleAddTemplate('laborTemplates')} className="mt-2 text-sm text-blue-600 hover:underline">+ Agregar Servicio</button>
                                    </div>
                                )}
                                 {activeTemplateTab === 'materials' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left text-slate-600 bg-slate-50">
                                                <tr>
                                                    <th className="p-2 font-semibold">Descripción</th>
                                                    <th className="p-2 font-semibold">Unidad</th>
                                                    <th className="p-2 font-semibold">Precio Unit.</th>
                                                    <th className="p-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(editingCompany.materialTemplates || []).map((item, index) => (
                                                    <tr key={item.id} className="border-b">
                                                        <td className="p-1"><TextInput value={item.description} onChange={e => handleTemplateChange('materialTemplates', index, 'description', e.target.value)} /></td>
                                                        <td className="p-1"><TextInput value={item.unit} onChange={e => handleTemplateChange('materialTemplates', index, 'unit', e.target.value)} /></td>
                                                        <td className="p-1"><NumberInput value={item.unitPrice} onChange={e => handleTemplateChange('materialTemplates', index, 'unitPrice', parseFloat(e.target.value) || 0)} /></td>
                                                        <td className="p-1 text-center"><button onClick={() => handleDeleteTemplate('materialTemplates', index)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100">&times;</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <button onClick={() => handleAddTemplate('materialTemplates')} className="mt-2 text-sm text-blue-600 hover:underline">+ Agregar Material</button>
                                    </div>
                                )}
                                {activeTemplateTab === 'tools' && (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="text-left text-slate-600 bg-slate-50">
                                                <tr>
                                                    <th className="p-2 font-semibold">Nombre de Herramienta</th>
                                                    <th className="p-2 font-semibold">Fecha de Compra</th>
                                                    <th className="p-2 font-semibold">Calidad</th>
                                                    <th className="p-2 w-10"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(editingCompany.tools || []).map((item, index) => (
                                                    <tr key={item.id} className="border-b">
                                                        <td className="p-1"><TextInput value={item.name} onChange={e => handleTemplateChange('tools', index, 'name', e.target.value)} /></td>
                                                        <td className="p-1"><DatePicker value={item.purchaseDate} onChange={date => handleTemplateChange('tools', index, 'purchaseDate', date)} /></td>
                                                        <td className="p-1">
                                                            <select value={item.quality} onChange={e => handleTemplateChange('tools', index, 'quality', e.target.value as ToolQuality)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                                                {Object.entries(TOOL_QUALITIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                                            </select>
                                                        </td>
                                                        <td className="p-1 text-center"><button onClick={() => handleDeleteTemplate('tools', index)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100">&times;</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <button onClick={() => handleAddTemplate('tools')} className="mt-2 text-sm text-blue-600 hover:underline">+ Agregar Herramienta</button>
                                    </div>
                                )}
                            </div>
                        ) : (
                           <p className="text-center text-slate-500 py-6">Selecciona o crea una empresa para gestionar sus plantillas.</p>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    {editingCompany && (
                        <div className="bg-white p-6 rounded-lg shadow-md">
                            <div className="flex justify-between items-center mb-4">
                               <h2 className="text-xl font-bold text-slate-700">Editar Perfil de Empresa</h2>
                               {activeCompanyId !== editingCompany.id && (
                                   <button onClick={() => setActiveCompanyId(editingCompany.id)} className="text-sm bg-blue-500 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-600">
                                       Marcar como activa
                                   </button>
                               )}
                            </div>
                            <div className="space-y-4">
                                <FormField label="Nombre de la Empresa (Comercial)">
                                    <TextInput value={editingCompany.name} onChange={e => handleCompanyChange('name', e.target.value)} />
                                </FormField>
                                <FormField label="Dirección (Comercial)">
                                    <textarea value={editingCompany.address} onChange={e => handleCompanyChange('address', e.target.value)} rows={3} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                                </FormField>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <FormField label="Teléfono">
                                      <TextInput value={editingCompany.phone} onChange={e => handleCompanyChange('phone', e.target.value)} />
                                  </FormField>
                                  <FormField label="Email">
                                      <TextInput value={editingCompany.email} onChange={e => handleCompanyChange('email', e.target.value)} />
                                  </FormField>
                                </div>
                                <FormField label="Sitio Web">
                                    <TextInput value={editingCompany.website} onChange={e => handleCompanyChange('website', e.target.value)} />
                                </FormField>
                                 <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Logo</label>
                                    <div className="mt-1 flex items-center gap-4">
                                        <div className="w-16 h-16 bg-slate-100 rounded-md flex items-center justify-center">
                                            {editingCompany.logo && <img src={editingCompany.logo} alt="Logo" className="max-w-full max-h-full object-contain" />}
                                        </div>
                                        <input type="file" accept="image/*" onChange={e => handleCompanyFileChange(e, 'logo')} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                    </div>
                                </div>
                                 <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Firma Digital</label>
                                    <div className="mt-1 flex items-center gap-4">
                                        <div className="w-24 h-16 bg-slate-100 rounded-md flex items-center justify-center p-1">
                                            <SignaturePreview signature={editingCompany.signature} />
                                        </div>
                                        <button onClick={() => setIsSignatureModalOpen(true)} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors text-sm">
                                            {editingCompany.signature ? 'Cambiar Firma' : 'Agregar Firma'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-6 pt-4 border-t">
                                <h3 className="text-lg font-semibold text-slate-600 mb-3">Perfil Fiscal (para Facturación)</h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormField label="RFC">
                                            <TextInput value={editingCompany.fiscalProfile?.rfc || ''} onChange={e => handleFiscalProfileChange('rfc', e.target.value)} />
                                        </FormField>
                                        <FormField label="Régimen Fiscal">
                                            <TextInput value={editingCompany.fiscalProfile?.taxRegime || ''} onChange={e => handleFiscalProfileChange('taxRegime', e.target.value)} />
                                        </FormField>
                                    </div>
                                    <FormField label="Razón Social (Nombre Legal)">
                                        <TextInput value={editingCompany.fiscalProfile?.legalName || ''} onChange={e => handleFiscalProfileChange('legalName', e.target.value)} />
                                    </FormField>
                                    <FormField label="Domicilio Fiscal">
                                        <textarea value={editingCompany.fiscalProfile?.fiscalAddress || ''} onChange={e => handleFiscalProfileChange('fiscalAddress', e.target.value)} rows={3} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                                    </FormField>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-600 mb-1">Certificado (.cer)</label>
                                            <div className="flex items-center gap-2">
                                                <input type="file" accept=".cer" onChange={e => handleFiscalFileChange(e, 'certificateCer')} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"/>
                                                {editingCompany.fiscalProfile?.certificateCer && <span className="text-green-600 text-2xl">✓</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-600 mb-1">Llave Privada (.key)</label>
                                            <div className="flex items-center gap-2">
                                                <input type="file" accept=".key" onChange={e => handleFiscalFileChange(e, 'privateKey')} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"/>
                                                {editingCompany.fiscalProfile?.privateKey && <span className="text-green-600 text-2xl">✓</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <FormField label="Contraseña de la Llave Privada">
                                        <TextInput type="password" value={editingCompany.fiscalProfile?.privateKeyPassword || ''} onChange={e => handleFiscalProfileChange('privateKeyPassword', e.target.value)} />
                                    </FormField>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t">
                                <h3 className="text-lg font-semibold text-slate-600 mb-3">Configuración de Folios</h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-x-4 pb-1 border-b">
                                        <span className="font-semibold text-sm text-slate-500">Tipo de Documento</span>
                                        <span className="font-semibold text-sm text-slate-500">Prefijo</span>
                                        <span className="font-semibold text-sm text-slate-500">Siguiente Número</span>
                                    </div>
                                    {Object.entries(DOCUMENT_TYPES).map(([type, label]) => (
                                        <div key={type} className="grid grid-cols-3 gap-x-4 items-center">
                                            <span className="text-sm font-medium text-slate-700">{label}</span>
                                            <TextInput 
                                                value={editingCompany.folioPrefixes?.[type as DocumentType] || ''}
                                                onChange={e => handleFolioChange(type as DocumentType, 'prefix', e.target.value)}
                                            />
                                            <NumberInput 
                                                value={editingCompany.folioCounters?.[type as DocumentType] || 1}
                                                onChange={e => handleFolioChange(type as DocumentType, 'counter', parseInt(e.target.value) || 1)}
                                                min="1"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-500 mt-2">"Siguiente Número" es el número que se usará para el próximo documento de ese tipo que se cree.</p>
                            </div>
                        </div>
                    )}
                    
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-bold text-slate-700 mb-4">Columnas de Artículos</h2>
                        <div className="flex gap-6">
                            <div className="w-1/3 border-r pr-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-sm font-semibold text-slate-600">COLUMNAS</h3>
                                    <button onClick={() => setIsAddColModalOpen(true)} className="p-1 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100" title="Agregar nueva columna">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </button>
                                </div>
                                <ul className="space-y-1">
                                    {Object.entries(columnDefinitions).map(([key, { label }]) => (
                                        <li key={key}>
                                            <button 
                                                onClick={() => setActiveColumnKey(key)}
                                                className={`w-full text-left p-2 rounded-md text-sm font-medium ${activeColumnKey === key ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
                                            >
                                                {label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="w-2/3">
                                {activeColumn ? (
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-slate-800">{activeColumn.label}</h3>
                                        <FormField label="Nombre de la Columna">
                                            <TextInput value={activeColumn.label} onChange={e => handleColumnDefinitionChange(activeColumnKey, 'label', e.target.value)} />
                                        </FormField>
                                        <FormField label="Tipo de Dato">
                                            <select
                                                value={activeColumn.dataType}
                                                onChange={e => handleColumnDefinitionChange(activeColumnKey, 'dataType', e.target.value)}
                                                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            >
                                                {Object.keys(COMPATIBLE_INPUT_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                                            </select>
                                        </FormField>
                                        <FormField label="Tipo de Campo de Entrada">
                                            <select
                                                value={activeColumn.inputType}
                                                onChange={e => handleColumnDefinitionChange(activeColumnKey, 'inputType', e.target.value)}
                                                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                            >
                                                {COMPATIBLE_INPUT_TYPES[activeColumn.dataType].map(type => <option key={type} value={type}>{type}</option>)}
                                            </select>
                                        </FormField>
                                        {(activeColumn.inputType === 'select') && (
                                            <FormField label="Opciones (separadas por Enter)">
                                                <TagInput value={activeColumn.options || []} onChange={v => handleColumnDefinitionChange(activeColumnKey, 'options', v)} />
                                            </FormField>
                                        )}
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                                <input type="checkbox" checked={activeColumn.default} onChange={e => handleColumnDefinitionChange(activeColumnKey, 'default', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                                Visible por defecto
                                            </label>
                                             <label className="flex items-center gap-2 text-sm text-slate-600">
                                                <input type="checkbox" checked={activeColumn.isEditable} onChange={e => handleColumnDefinitionChange(activeColumnKey, 'isEditable', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                                Es editable
                                            </label>
                                        </div>
                                        <div className="pt-4 border-t">
                                            <button
                                                onClick={() => handleDeleteColumn(activeColumnKey)}
                                                className="text-sm text-red-600 font-semibold hover:text-red-800 hover:underline disabled:text-slate-400 disabled:cursor-not-allowed disabled:no-underline"
                                                disabled={Object.keys(INITIAL_COLUMN_DEFINITIONS).includes(activeColumnKey)}
                                            >
                                                Eliminar Columna
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-slate-500">Selecciona una columna para editar sus propiedades.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <SignatureInput
                isOpen={isSignatureModalOpen}
                onClose={() => setIsSignatureModalOpen(false)}
                onSave={handleSaveSignature}
                currentSignature={editingCompany?.signature}
            />
            
            {isAddColModalOpen && (
                 <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md w-full mx-4">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">Nueva Columna</h2>
                        <div className="space-y-4">
                             <FormField label="Nombre de la Columna">
                                <TextInput value={newColumnData.label} onChange={e => setNewColumnData(p => ({...p, label: e.target.value}))} placeholder="Ej: No. de Serie"/>
                            </FormField>
                             <FormField label="Tipo de Dato">
                                <select value={newColumnData.dataType} onChange={e => setNewColumnData(p => ({...p, dataType: e.target.value}))} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                    {Object.keys(COMPATIBLE_INPUT_TYPES).map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </FormField>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                            <button onClick={() => setIsAddColModalOpen(false)} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleAddColumn} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Agregar Columna</button>
                        </div>
                    </div>
                </div>
            )}
            {aiSuggestions && <AiTemplateSuggestionsModal
                isOpen={isSuggestionsModalOpen}
                onClose={() => setIsSuggestionsModalOpen(false)}
                suggestions={aiSuggestions}
                onConfirm={handleConfirmSuggestions}
            />}
        </div>
    );
};