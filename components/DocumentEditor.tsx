import React, { useState, useCallback, ChangeEvent, useEffect, useMemo, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import type { DocumentState, CostCategory, Item, Totals, ColumnKey, Company, Client, Subcategory, ColumnDefinition, DocumentType, DocumentStatus, PaymentPlanConfig, PreviewFormat, LayoutConfig, Coupon, ThirdPartyTicket, InterpretedTicketData, SignatureData } from '../types';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES, CURRENCIES, PREVIEW_FORMATS, CLIENT_PREFIXES } from '../constants';
import { formatCurrency, generateFolio } from '../utils/formatters';
import { ImageImportModal } from './ImageImportModal';
import { DatePicker } from './DatePicker';
import { SignatureInput } from './SignatureInput';
import { AiAssistantOptionsModal, AiAnalysisOptions } from './AiAssistantOptionsModal';
import { AiBulkGeneratorModal, AiGeneratorOptions } from './AiBulkGeneratorModal';


interface DocumentEditorProps {
  documentState: DocumentState;
  setDocumentState: React.Dispatch<React.SetStateAction<DocumentState>>;
  totals: Totals;
  company: Company;
  uploadedTicketHashes: string[];
  setUploadedTicketHashes: React.Dispatch<React.SetStateAction<string[]>>;
  columnDefinitions: Record<string, ColumnDefinition>;
  setColumnDefinitions: React.Dispatch<React.SetStateAction<Record<string, ColumnDefinition>>>;
  savedClients: Client[];
}

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

const toBase64ForGemini = (file: File): Promise<{ data: string, mimeType: string }> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const result = reader.result as string;
        const [header, data] = result.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || file.type;
        resolve({ data, mimeType });
    };
    reader.onerror = error => reject(error);
});

const processCategoryWithGemini = async (
    prompt: string,
    images: { data: string; mimeType: string }[],
    categoryName: string,
    columnDefinitions: Record<string, ColumnDefinition>,
    options: AiAnalysisOptions,
    company: Company
): Promise<Omit<Item, 'id'>[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const itemProperties: Record<string, { type: Type, description?: string }> = {};
    const requiredProperties: string[] = [];

    // Dynamically build properties for the schema based on existing column definitions
    for (const key in columnDefinitions) {
        // Exclude calculated fields from what we ask the AI to generate
        if (key === 'total' || key === 'markup' || key === 'vat') continue;

        const def = columnDefinitions[key];
        let geminiType = Type.STRING;
        if (def.dataType === 'number') {
            geminiType = Type.NUMBER;
        } else if (def.dataType === 'boolean') {
            geminiType = Type.BOOLEAN;
        }
        itemProperties[key] = { type: geminiType, description: def.label };
    }

    // Ensure critical fields are present and correctly typed, and mark them as required
    itemProperties['description'] = { type: Type.STRING, description: 'Descripción detallada del concepto o artículo.' };
    itemProperties['quantity'] = { type: Type.NUMBER, description: 'La cantidad o número de unidades.' };
    itemProperties['unitPrice'] = { type: Type.NUMBER, description: 'El costo estimado por unidad.' };
    itemProperties['unit'] = { type: Type.STRING, description: 'La unidad de medida (ej: Pza, m², Kg, Hora, Jornal, Servicio).' };
    requiredProperties.push('description', 'quantity', 'unitPrice', 'unit');

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: itemProperties,
            required: requiredProperties
        }
    };
    
    let templateDataString = '';
    if (options.dataSource === 'template') {
        let templateData: any[] = [];
        if (categoryName.toLowerCase().includes('mano de obra')) {
            templateData = company.laborTemplates;
        } else if (categoryName.toLowerCase().includes('materiales')) {
            templateData = company.materialTemplates;
        }
        if (templateData.length > 0) {
            templateDataString = `Usa los siguientes precios de mi plantilla como referencia principal. Ajústalos si es necesario para el trabajo, pero prioriza estos valores:\n${JSON.stringify(templateData)}`;
        } else {
             templateDataString = 'El usuario eligió usar plantillas, pero no se encontraron. Realiza una evaluación de mercado.';
        }
    } else {
        templateDataString = 'Realiza una evaluación de precios de mercado actualizada para México.';
    }

    const serviceLevelDescription: Record<string, string> = {
        'Profesional': 'Implica usar materiales de alta calidad, seguir normativas estrictas y garantizar durabilidad. Los precios deben reflejar esto.',
        'Semi-profesional': 'Busca un equilibrio entre costo y calidad, usando materiales estándar y prácticas eficientes pero con cierta flexibilidad. Precios moderados.',
        'Principiante': 'El objetivo es el menor costo posible, utilizando materiales económicos y procesos básicos. Precios económicos.'
    };
    
    const fullPrompt = `
        Actúa como un asistente experto para un contratista o profesional de oficios en México.
        Tu tarea es desglosar un trabajo en conceptos detallados para una cotización, enfocándote únicamente en la categoría especificada y siguiendo las directrices del usuario.
        La moneda a utilizar es el Peso Mexicano (MXN). Los precios deben ser estimaciones realistas para el mercado mexicano.

        **Descripción del trabajo (texto e imágenes si se proporcionan):**
        "${prompt}"

        **Categoría de Costos a Desglosar:**
        "${categoryName}"
        
        **Directrices del Usuario:**
        - **Nivel de Servicio Requerido:** "${options.serviceLevel}". Esto significa: ${serviceLevelDescription[options.serviceLevel]}
        - **Fuente de Datos para Precios:** ${templateDataString}

        Basado en la descripción del trabajo y las directrices, genera una lista de conceptos o artículos que pertenecen **exclusivamente** a la categoría de "${categoryName}".
        - Si la categoría es 'Mano de Obra', incluye conceptos como "Instalación", "Supervisión", "Desgaste de herramienta", "Limpieza de área", etc. No incluyas materiales.
        - Si la categoría es 'Materiales', incluye todos los materiales necesarios, desde los principales hasta los consumibles. No incluyas mano de obra.
        - Si la categoría es 'Logística', incluye conceptos como "Flete", "Transporte de personal", "Acarreo de material", etc.

        Para cada concepto, proporciona valores para 'description', 'quantity', 'unit', y 'unitPrice'. Sé lo más detallado posible.
        La respuesta DEBE ser un arreglo JSON de objetos que siga el esquema proporcionado. No incluyas nada más en la respuesta.
    `;
    
    const contentParts: ({ text: string } | { inlineData: { data: string, mimeType: string }})[] = [{ text: fullPrompt }];
    if (images.length > 0) {
        images.forEach(image => {
            contentParts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
        });
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: contentParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const jsonText = response.text.trim();
        const cleanedJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonText);
        
        // Ensure it's an array
        if (Array.isArray(parsedJson)) {
            return parsedJson;
        }
        return [];
    } catch (error) {
        console.error("Error processing category with Gemini:", error);
        throw new Error("No se pudieron generar los artículos. Revisa la descripción o la configuración.");
    }
};

const processMultipleCategoriesWithGemini = async (
    prompt: string,
    selectedCategoryNames: string[],
    columnDefinitions: Record<string, ColumnDefinition>,
    options: AiGeneratorOptions,
    company: Company
): Promise<Record<string, Omit<Item, 'id'>[]>> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const itemProperties: Record<string, { type: Type, description?: string }> = {};
    const requiredProperties: string[] = [];

    for (const key in columnDefinitions) {
        if (key === 'total' || key === 'markup' || key === 'vat') continue;
        const def = columnDefinitions[key];
        itemProperties[key] = { type: def.dataType === 'number' ? Type.NUMBER : Type.STRING, description: def.label };
    }
    itemProperties['description'] = { type: Type.STRING };
    itemProperties['quantity'] = { type: Type.NUMBER };
    itemProperties['unitPrice'] = { type: Type.NUMBER };
    itemProperties['unit'] = { type: Type.STRING };
    requiredProperties.push('description', 'quantity', 'unitPrice', 'unit');

    const itemSchema = { type: Type.OBJECT, properties: itemProperties, required: requiredProperties };

    const rootProperties: Record<string, any> = {};
    selectedCategoryNames.forEach(name => {
        rootProperties[name] = {
            type: Type.ARRAY,
            description: `Lista de artículos para la categoría "${name}"`,
            items: itemSchema
        };
    });

    const schema = { type: Type.OBJECT, properties: rootProperties };
    
    const serviceLevelDescription: Record<string, string> = {
        'Profesional': 'Implica usar materiales de alta calidad, seguir normativas estrictas y garantizar durabilidad. Los precios deben reflejar esto.',
        'Semi-profesional': 'Busca un equilibrio entre costo y calidad, usando materiales estándar y prácticas eficientes pero con cierta flexibilidad. Precios moderados.',
        'Principiante': 'El objetivo es el menor costo posible, utilizando materiales económicos y procesos básicos. Precios económicos.'
    };

    const fullPrompt = `
        Actúa como un asistente experto para un contratista en México. Tu tarea es desglosar un trabajo en conceptos detallados para una cotización, generando partidas únicamente para las categorías especificadas. La moneda es Peso Mexicano (MXN).

        **Descripción del trabajo:**
        "${prompt}"

        **Categorías a Desglosar:**
        [${selectedCategoryNames.join(', ')}]

        **Directrices del Usuario:**
        - Nivel de Servicio: "${options.serviceLevel}". Esto significa: ${serviceLevelDescription[options.serviceLevel]}

        Basado en todo esto, genera listas de conceptos para cada una de las categorías solicitadas. Si una categoría solicitada no aplica al trabajo descrito, devuelve un arreglo vacío para esa clave.
        La respuesta DEBE ser un objeto JSON que siga el esquema proporcionado, donde cada clave es uno de los nombres de categoría solicitados.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const jsonText = response.text.trim();
        const cleanedJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleanedJsonText);
    } catch (error) {
        console.error("Error processing multiple categories with Gemini:", error);
        throw new Error("No se pudieron generar los artículos. Revisa la descripción o la configuración.");
    }
};


const AccordionSection: React.FC<{ title: string; children: React.ReactNode; isOpen: boolean; setIsOpen: (isOpen: boolean) => void; actions?: React.ReactNode; icon?: React.ReactNode }> = ({ title, children, isOpen, setIsOpen, actions, icon }) => (
    <div className="bg-white rounded-lg shadow-md transition-shadow hover:shadow-lg mb-6">
        <div className="p-4 w-full flex justify-between items-center text-left">
            <div className="flex items-center gap-3">
              {icon}
              <h3 className="text-lg font-bold text-slate-700">{title}</h3>
            </div>
            <div className="flex items-center gap-4">
                {actions}
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-expanded={isOpen}
                    className="p-1 rounded-full hover:bg-slate-100"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 text-slate-500 ${isOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
            </div>
        </div>
        {isOpen && (
            <div className="border-t p-4 bg-slate-50/70">
                {children}
            </div>
        )}
    </div>
);


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

const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
  <textarea
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

const GenericClientIcon: React.FC<{ type: Client['genericLogo'], className?: string }> = ({ type, className = "w-full h-full text-slate-400" }) => {
    const iconProps = {
        className: className,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round" as "round",
        strokeLinejoin: "round" as "round",
    };
    switch (type) {
        case 'man': return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
        case 'woman': return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 22 10"></polyline></svg>;
        case 'business': return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...iconProps}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>;
        case 'house': return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...iconProps}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
        default: return null;
    }
};

const CategoryTab: React.FC<{
  categoryName: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ categoryName, isActive, onClick }) => {
  const baseClasses = "px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 ease-in-out whitespace-nowrap";
  const activeClasses = "border-blue-600 text-blue-600 bg-blue-50";
  const inactiveClasses = "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100";
  
  return (
    <button
        type="button"
        onClick={onClick}
        className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        aria-selected={isActive}
        role="tab"
    >
        {categoryName}
    </button>
  );
};

const EditableSubcategoryTitle: React.FC<{
  name: string;
  onRename: (newName: string) => void;
}> = ({ name, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentName, setCurrentName] = useState(name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentName(name);
  }, [name]);
  
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (currentName.trim() === '') {
        setCurrentName(name);
    } else if (currentName !== name) {
        onRename(currentName);
    }
    setIsEditing(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleBlur();
    else if (e.key === 'Escape') {
      setCurrentName(name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={currentName}
        onChange={(e) => setCurrentName(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="font-semibold text-slate-800 bg-slate-100 border-0 focus:ring-1 focus:ring-blue-500 rounded-md p-1 text-sm"
      />
    );
  }

  return (
    <div className="group flex items-center gap-1">
        <h5 className="font-semibold text-slate-800 p-1 rounded-md text-sm">
            {name}
        </h5>
        <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="p-1 text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label={`Renombrar ${name}`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
    </div>
  );
};

const TermsInput: React.FC<{
  label: string;
  terms: number[];
  onTermsChange: (newTerms: number[]) => void;
  periodLabel: string;
  disabled?: boolean;
}> = ({ label, terms, onTermsChange, periodLabel, disabled }) => {
    const [newTerm, setNewTerm] = useState('');

    const handleAddTerm = () => {
        const termValue = parseInt(newTerm, 10);
        if (!isNaN(termValue) && termValue > 0 && !terms.includes(termValue)) {
            const newTerms = [...terms, termValue].sort((a, b) => a - b);
            onTermsChange(newTerms);
            setNewTerm('');
        }
    };

    const handleRemoveTerm = (termToRemove: number) => {
        onTermsChange(terms.filter(t => t !== termToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTerm();
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">{label}</label>
            <div className="flex flex-wrap gap-2 mb-2 min-h-[2.5rem] p-2 bg-white rounded-md border border-slate-300">
                {terms.map(term => (
                    <span key={term} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
                        {term} {periodLabel}
                        {!disabled && (
                           <button type="button" onClick={() => handleRemoveTerm(term)} className="text-blue-600 hover:text-blue-800 ml-1">
                               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                           </button>
                        )}
                    </span>
                ))}
                {terms.length === 0 && <p className="text-sm text-slate-500 px-2">No hay plazos definidos.</p>}
            </div>
            {!disabled && (
                <div className="flex gap-2">
                    <NumberInput
                        value={newTerm}
                        onChange={e => setNewTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ej: 18"
                    />
                    <button type="button" onClick={handleAddTerm} className="bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap text-sm">Agregar Plazo</button>
                </div>
            )}
        </div>
    );
};


const PERIOD_LABELS: Record<PaymentPlanConfig['paymentPeriod'], string> = {
    monthly: 'Meses',
    weekly: 'Semanas',
    yearly: 'Años',
    custom_days: 'Pagos'
};

const OFFER_TYPE_LABELS: Record<Coupon['offerType'], string> = {
    percentage_off: 'Porcentaje de Descuento',
    fixed_amount_off: 'Monto Fijo de Descuento',
    buy_one_get_one: '2x1 o Similar',
    free_shipping: 'Envío Gratis',
    custom: 'Personalizado',
};

const SignaturePreview: React.FC<{signature?: SignatureData, onClear: () => void}> = ({ signature, onClear }) => {
    if (!signature) return null;

    const renderSignature = () => {
        if (signature.mode === 'type') {
            return <span style={{ fontFamily: signature.fontFamily, fontSize: '2.5rem', lineHeight: '1' }}>{signature.data}</span>
        }
        return <img src={signature.data} alt="Firma" className="max-h-24 object-contain" />
    };

    return (
        <div className="p-4 bg-slate-100 rounded-lg">
            <div className="flex items-start gap-4">
                <div className="flex-grow p-2 bg-white border rounded-md flex items-center justify-center min-h-[100px]">
                    {renderSignature()}
                </div>
                <div className="flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{signature.signedBy || 'Firmante'}</p>
                    <p className="text-xs text-slate-500">
                        Firmado el: {signature.signedAt ? new Date(signature.signedAt).toLocaleString() : 'N/A'}
                    </p>
                    <button onClick={onClear} className="mt-2 text-xs text-red-600 hover:underline">
                        Eliminar Firma
                    </button>
                </div>
            </div>
        </div>
    );
};


const processTicketWithGemini = async (base64Image: string, mimeType: string): Promise<InterpretedTicketData> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

    const schema = {
        type: Type.OBJECT,
        properties: {
            storeName: { type: Type.STRING, description: "El nombre de la tienda o comercio." },
            date: { type: Type.STRING, description: "La fecha de la transacción (YYYY-MM-DD)." },
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        price: { type: Type.NUMBER, description: "El precio total del renglón (cantidad * precio unitario)." }
                    },
                    required: ["description", "quantity", "price"]
                }
            },
            subtotal: { type: Type.NUMBER, description: "El subtotal antes de impuestos." },
            tax: { type: Type.NUMBER, description: "El monto total de impuestos (IVA)." },
            total: { type: Type.NUMBER, description: "El total final de la compra." }
        },
        required: ["storeName", "date", "items", "subtotal", "tax", "total"]
    };

    const prompt = `Analiza la imagen de este ticket de compra. Extrae la información detallada y estructúrala según el esquema JSON proporcionado. Asegúrate de que todos los valores monetarios sean numéricos, sin símbolos de moneda ni comas.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: [{ inlineData: { data: base64Image, mimeType } }, { text: prompt }] },
            config: { responseMimeType: "application/json", responseSchema: schema },
        });

        const jsonText = response.text.trim();
        const cleanedJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '');
        return JSON.parse(cleanedJsonText);
    } catch(error) {
        console.error("Error processing ticket with Gemini:", error);
        throw new Error("No se pudo interpretar el ticket. Revisa la imagen o la configuración.");
    }
};

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ documentState, setDocumentState, totals, company, uploadedTicketHashes, setUploadedTicketHashes, columnDefinitions, setColumnDefinitions, savedClients }) => {
  const [openSections, setOpenSections] = useState({
    docInfo: true,
    clientInfo: false,
    aiAssistant: false,
    layout: false,
    categories: true,
    terms: false,
    paymentPlan: false,
    coupon: false,
    thirdPartyTickets: false,
  });

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(
    documentState.categories[0]?.id ?? null
  );

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClientSignatureModalOpen, setIsClientSignatureModalOpen] = useState(false);
  const [numItemsToAdd, setNumItemsToAdd] = useState<number>(1);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isGeneratingTerms, setIsGeneratingTerms] = useState(false);
  const [isGeneratingCouponTerms, setIsGeneratingCouponTerms] = useState(false);
  const [isGeneratingPaymentPlanTerms, setIsGeneratingPaymentPlanTerms] = useState(false);
  const [isGeneratingPromissoryNoteTerms, setIsGeneratingPromissoryNoteTerms] = useState(false);
  const [isAiOptionsModalOpen, setIsAiOptionsModalOpen] = useState(false);
  const [isAiBulkGeneratorModalOpen, setIsAiBulkGeneratorModalOpen] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);

  const [aiCategoryPrompt, setAiCategoryPrompt] = useState('');
  const [isGeneratingItems, setIsGeneratingItems] = useState(false);
  const [aiCategoryImages, setAiCategoryImages] = useState<{ file: File, previewUrl: string, base64Data: string, mimeType: string }[]>([]);
  const aiImageInputRef = useRef<HTMLInputElement>(null);

  const [isClientSearchVisible, setIsClientSearchVisible] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientSearchRef = useRef<HTMLDivElement>(null);
  
  const handleStateChange = useCallback((field: keyof DocumentState, value: any) => {
    setDocumentState(prev => ({ ...prev, [field]: value }));
  }, [setDocumentState]);
  
  // Effect to regenerate folio when date or docType changes, preserving sequence.
  useEffect(() => {
    const { docNumber, docType, date } = documentState;
    // Ensure date is a valid YYYY-MM-DD string
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const parts = docNumber.split('-');
    if (parts.length < 2) return; // Not a valid folio to parse sequence from

    const sequence = parseInt(parts[1], 10);
    if (isNaN(sequence)) return;

    const prefix = company.folioPrefixes?.[docType] || `${docType.substring(0, 3).toUpperCase()}-`;

    const [year, month, day] = date.split('-').map(Number);
    const docDate = new Date(Date.UTC(year, month - 1, day));
    
    const newFolio = generateFolio(prefix, sequence, docDate);

    if (newFolio !== docNumber) {
        setDocumentState(prev => ({ ...prev, docNumber: newFolio }));
    }
  }, [documentState.date, documentState.docType, company.folioPrefixes, setDocumentState, documentState.docNumber]);


  // When category changes, clear the prompt and any attached images
  useEffect(() => {
    setAiCategoryPrompt('');
    setAiCategoryImages(prevImages => {
        prevImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
        return [];
    });
  }, [activeCategoryId]);

  // Effect to enforce VAT for "Factura"
  useEffect(() => {
    if (documentState.docType === 'Factura' && !documentState.showVat) {
      handleStateChange('showVat', true);
    }
  }, [documentState.docType, documentState.showVat, handleStateChange]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (clientSearchRef.current && !clientSearchRef.current.contains(event.target as Node)) {
            setIsClientSearchVisible(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
}, []);

  const activeCategory = useMemo(() => 
    documentState.categories.find(c => c.id === activeCategoryId),
    [documentState.categories, activeCategoryId]
  );
  const activeCategoryIndex = useMemo(() => 
    documentState.categories.findIndex(c => c.id === activeCategoryId),
    [documentState.categories, activeCategoryId]
  );

  const orderedColumnKeys = useMemo(() => Object.keys(columnDefinitions) as ColumnKey[], [columnDefinitions]);
  const currencySymbol = useMemo(() => CURRENCIES[documentState.currency]?.symbol || '$', [documentState.currency]);

  const filteredClients = useMemo(() => {
    if (!clientSearchQuery) return savedClients;
    return savedClients.filter(c =>
        c.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
    );
  }, [clientSearchQuery, savedClients]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleNestedStateChange = useCallback((
    object: 'paymentPlan' | 'layout' | 'coupon', 
    field: keyof PaymentPlanConfig | keyof LayoutConfig | keyof Coupon, 
    value: any
  ) => {
    setDocumentState(prev => ({
      ...prev,
      [object]: {
        ...prev[object],
        [field]: value
      }
    }));
  }, [setDocumentState]);

   const handleClientPropertyChange = useCallback((field: keyof Client, value: any) => {
    setDocumentState(prev => ({
      ...prev,
      client: {
        ...prev.client,
        [field]: value
      }
    }));
  }, [setDocumentState]);

  const handleClientAddressChange = useCallback((field: keyof Client['address'], value: string) => {
      setDocumentState(prev => ({
          ...prev,
          client: {
              ...prev.client,
              address: {
                  ...prev.client.address,
                  [field]: value
              }
          }
      }));
  }, [setDocumentState]);

  const handleSelectSavedClient = (client: Client) => {
    handleStateChange('client', client);
    setIsClientSearchVisible(false);
    setClientSearchQuery('');
  };

  const handleCategoryChange = useCallback((field: keyof CostCategory, value: any) => {
    if (activeCategoryIndex === -1) return;
    const newCategories = [...documentState.categories];
    const categoryToUpdate = { ...newCategories[activeCategoryIndex], [field]: value };
    
    // If 'applyVat' is set to false, force the 'vat' column to be hidden
    if (field === 'applyVat' && value === false) {
        categoryToUpdate.visibleColumns = { ...categoryToUpdate.visibleColumns, vat: false };
    }
    
    newCategories[activeCategoryIndex] = categoryToUpdate;
    handleStateChange('categories', newCategories);
  }, [documentState.categories, activeCategoryIndex, handleStateChange]);

  const handleSubcategoryChange = useCallback((subIndex: number, field: keyof Subcategory, value: any) => {
    if (activeCategoryIndex === -1) return;
    const newCategories = [...documentState.categories];
    const newSubcategories = [...newCategories[activeCategoryIndex].subcategories];
    newSubcategories[subIndex] = { ...newSubcategories[subIndex], [field]: value };
    handleCategoryChange('subcategories', newSubcategories);
  }, [documentState.categories, activeCategoryIndex, handleCategoryChange]);

  const handleItemChange = useCallback((subIndex: number, itemIndex: number, field: string, value: string | number | boolean) => {
    if (activeCategoryIndex === -1) return;
    
    const category = documentState.categories[activeCategoryIndex];
    const subcategory = category.subcategories[subIndex];
    if (!subcategory) return;
    
    const newItems = [...subcategory.items];
    newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
    
    handleSubcategoryChange(subIndex, 'items', newItems);
  }, [documentState.categories, activeCategoryIndex, handleSubcategoryChange]);
  
  const handleAddItems = useCallback((subIndex: number, count: number) => {
    if (activeCategoryIndex === -1 || count <= 0) return;

    const itemsToAdd: Item[] = Array.from({ length: count }, () => {
        const newItem: Item = { id: crypto.randomUUID() };
        Object.entries(columnDefinitions).forEach(([key, def]) => {
            if (key === 'quantity') {
                newItem[key] = 1;
            } else if (def.dataType === 'number') {
                newItem[key] = 0;
            } else if (def.dataType === 'boolean') {
                newItem[key] = false;
            } else if (def.inputType === 'select') {
                newItem[key] = def.options?.[0] || '';
            } else {
                newItem[key] = '';
            }
        });
        return newItem;
    });

    const category = documentState.categories[activeCategoryIndex];
    const subcategory = category.subcategories[subIndex];
    if (subcategory) {
        const newItems = [...subcategory.items, ...itemsToAdd];
        handleSubcategoryChange(subIndex, 'items', newItems);
    }
}, [documentState.categories, activeCategoryIndex, columnDefinitions, handleSubcategoryChange]);


  const handleDeleteItem = useCallback((subIndex: number, itemIndex: number) => {
    if (activeCategoryIndex === -1) return;
    const subcategory = documentState.categories[activeCategoryIndex].subcategories[subIndex];
    const newItems = subcategory.items.filter((_, i) => i !== itemIndex);
    handleSubcategoryChange(subIndex, 'items', newItems);
  }, [documentState.categories, activeCategoryIndex, handleSubcategoryChange]);

  const handleToggleColumn = useCallback((key: ColumnKey) => {
    if (!activeCategory) return;
    const newVisibleColumns = { ...activeCategory.visibleColumns, [key]: !activeCategory.visibleColumns[key] };
    handleCategoryChange('visibleColumns', newVisibleColumns);
  }, [activeCategory, handleCategoryChange]);
  
  const handleAddSubcategory = useCallback(() => {
    if (!activeCategory) return;
    const newSubcategory: Subcategory = {
        id: crypto.randomUUID(),
        name: `Nueva Subcategoría ${activeCategory.subcategories.length + 1}`,
        items: []
    };
    handleCategoryChange('subcategories', [...activeCategory.subcategories, newSubcategory]);
  }, [activeCategory, handleCategoryChange]);

  const handleDeleteSubcategory = useCallback((subIndex: number) => {
    if (!activeCategory) return;
    if (activeCategory.subcategories.length <= 1) {
        alert("No se puede eliminar la única subcategoría. Una categoría debe tener al menos una subcategoría.");
        return;
    }
    const newSubcategories = activeCategory.subcategories.filter((_, i) => i !== subIndex);
    handleCategoryChange('subcategories', newSubcategories);
  }, [activeCategory, handleCategoryChange]);

  const handleRenameSubcategory = useCallback((subIndex: number, newName: string) => {
    handleSubcategoryChange(subIndex, 'name', newName);
  }, [handleSubcategoryChange]);

  const applyMarkup = useCallback(() => {
    if (activeCategoryIndex === -1) return;

    const category = documentState.categories[activeCategoryIndex];
    if (!category.subcategories.length) return;

    const markupApplications = category.markupApplications + 1;
    
    const categorySubtotal = category.subcategories.reduce((acc, sub) => acc + sub.items.reduce((itemAcc, item) => itemAcc + (Number(item.quantity) * Number(item.unitPrice)), 0), 0);
    const otherCategoriesSubtotal = totals.subtotal - categorySubtotal;
    const newBase = otherCategoriesSubtotal > 0 ? otherCategoriesSubtotal : totals.subtotal;

    if (newBase === 0) return;

    const markupItem: Item = {
        id: crypto.randomUUID(),
        description: `Agregado (${markupApplications}) sobre subtotal de otras categorías`,
        quantity: 1,
        unitPrice: newBase,
        unit: 'Agregado',
        concept: 'Agregado',
    };
    
    const newCategories = [...documentState.categories];
    const categoryToUpdate = newCategories[activeCategoryIndex];
    const subcategoriesToUpdate = [...categoryToUpdate.subcategories];
    const firstSubcategory = { ...subcategoriesToUpdate[0] };
    firstSubcategory.items = [...firstSubcategory.items, markupItem];
    subcategoriesToUpdate[0] = firstSubcategory;
    
    newCategories[activeCategoryIndex] = { 
        ...categoryToUpdate, 
        subcategories: subcategoriesToUpdate,
        markupApplications: markupApplications,
    };
    
    handleStateChange('categories', newCategories);

  }, [activeCategoryIndex, documentState.categories, totals.subtotal, handleStateChange]);

  const handlePaymentPeriodChange = (newPeriod: PaymentPlanConfig['paymentPeriod']) => {
      setDocumentState(prev => ({
          ...prev,
          paymentPlan: {
              ...prev.paymentPlan,
              paymentPeriod: newPeriod,
          }
      }));
  };

  const handleAddItemsFromImage = useCallback((items: (Omit<Item, 'id'> & { category: string })[], pricesIncludeVat: boolean, imageHashes: string[]) => {
    setDocumentState(prev => {
        const newCategories = JSON.parse(JSON.stringify(prev.categories));
        const vatRatePercent = prev.vatRate;

        // Create a map for quick category lookup
        const categoryMap: Record<string, CostCategory> = {};
        newCategories.forEach((cat: CostCategory) => {
            categoryMap[cat.name.toLowerCase()] = cat;
        });

        // Find the index of the fallback category, e.g., 'Agregados'
        const fallbackCategory = categoryMap['agregados'] || newCategories[newCategories.length - 1];

        items.forEach(item => {
            const { category: categoryName, ...itemData } = item;
            
            const targetCategory = categoryMap[categoryName.toLowerCase()] || fallbackCategory;
            
            if (targetCategory && targetCategory.subcategories.length > 0) {
                 const newItem: Item = { id: crypto.randomUUID() };
                 Object.entries(columnDefinitions).forEach(([key, def]) => {
                    if (key === 'quantity') newItem[key] = 1;
                    else if (def.dataType === 'number') newItem[key] = 0;
                    else if (def.dataType === 'boolean') newItem[key] = false;
                    else if (def.inputType === 'select') newItem[key] = def.options?.[0] || '';
                    else newItem[key] = '';
                 });
                
                const importedItemData = { ...itemData };
                 if (pricesIncludeVat && vatRatePercent > 0) {
                    const originalPrice = Number(importedItemData.unitPrice) || 0;
                    importedItemData.unitPrice = originalPrice / (1 + (vatRatePercent / 100));
                }

                const finalItem = { ...newItem, ...importedItemData };
                 targetCategory.subcategories[0].items.push(finalItem);

                 if (pricesIncludeVat) {
                     targetCategory.applyVat = true;
                 }
            }
        });
        return { ...prev, categories: newCategories };
    });
    
    const newUniqueHashes = imageHashes.filter(hash => hash && !uploadedTicketHashes.includes(hash));
    if (newUniqueHashes.length > 0) {
        setUploadedTicketHashes(prev => [...prev, ...newUniqueHashes]);
    }

    setIsImportModalOpen(false);
  }, [setDocumentState, uploadedTicketHashes, setUploadedTicketHashes, columnDefinitions]);
  
  const handleGenerateDescription = async () => {
    setIsGeneratingDescription(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const materialsCategory = documentState.categories.find(c => c.name.toLowerCase().includes('materiales'));
        const laborCategory = documentState.categories.find(c => c.name.toLowerCase().includes('mano de obra'));

        const materialsSummary = materialsCategory?.subcategories.flatMap(s => s.items.map(i => i.description)).filter(Boolean).join(', ') || 'No especificados';
        const laborSummary = laborCategory?.subcategories.flatMap(s => s.items.map(i => i.description)).filter(Boolean).join(', ') || 'No especificados';

        const prompt = `
            Basado en los siguientes datos de una cotización y el texto de descripción actual, redacta un párrafo descriptivo profesional y conciso para el documento.
            El párrafo debe resumir el alcance del trabajo o proyecto. Si el cuadro de descripción actual ya tiene texto, úsalo como base para mejorarlo o completarlo. Sé amable y directo.

            Datos:
            - Título del Documento: "${documentState.title}"
            - Cliente: "${documentState.client.name}"
            - Descripción actual: "${documentState.description || ' (Vacío)'}"
            - Resumen de Mano de Obra: "${laborSummary}"
            - Resumen de Materiales: "${materialsSummary}"
            - Total General: "${formatCurrency(totals.total, currencySymbol)}"

            Genera solo el párrafo de descripción mejorado, sin saludos ni despedidas.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        
        handleStateChange('description', response.text);

    } catch (error) {
        console.error("Error generating description:", error);
        alert("No se pudo generar la descripción. Inténtalo de nuevo.");
    } finally {
        setIsGeneratingDescription(false);
    }
  };

    const handleGenerateTerms = async () => {
        setIsGeneratingTerms(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            
            const prompt = `
                Basado en el siguiente resumen de un documento comercial, genera una lista de "Términos y Condiciones" generales y apropiados.
                Si ya existen términos, úsalos como base y mejóralos. Si no, crea una lista estándar.
                Considera aspectos como la validez de la oferta, condiciones de pago, garantías, tiempos de entrega y políticas de cancelación.
                Formatea la respuesta como una lista numerada (1., 2., 3., etc.).

                Resumen del Documento:
                - Tipo de Documento: "${documentState.docType}"
                - Título: "${documentState.title}"
                - Total: "${formatCurrency(totals.total, currencySymbol)}"
                - Términos Generales Actuales: "${documentState.termsAndConditions || '(Vacío)'}"

                Genera solo la lista de términos generales, sin encabezados ni despedidas.
            `;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });

            handleStateChange('termsAndConditions', response.text);

        } catch (error) {
            console.error("Error generating terms:", error);
            alert("No se pudieron generar los términos y condiciones. Inténtalo de nuevo.");
        } finally {
            setIsGeneratingTerms(false);
        }
    };

    const handleGenerateCouponTerms = async () => {
        setIsGeneratingCouponTerms(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            const { title, offerValue, terms, validityStartDate, validityEndDate } = documentState.coupon;
            
            let validityInfo = '';
            if (validityStartDate && validityEndDate) {
                validityInfo = `El cupón es válido desde ${validityStartDate} hasta ${validityEndDate}.`;
            } else if (validityStartDate) {
                validityInfo = `El cupón es válido a partir de ${validityStartDate}.`;
            } else if (validityEndDate) {
                validityInfo = `El cupón es válido hasta ${validityEndDate}.`;
            }

            const prompt = `
                Basado en la siguiente información de un cupón y los términos actuales, genera un texto de "Términos y Condiciones" más completo y profesional para dicho cupón.
                Si el cuadro de términos actual ya tiene texto, úsalo como base y mejóralo. Si está vacío, crea un texto estándar.

                Información del Cupón:
                - Título: "${title}"
                - Oferta: "${offerValue}"
                - Vigencia: "${validityInfo || 'No especificada'}"
                - Términos Actuales: "${terms || '(Vacío)'}"

                Genera solo el texto de los términos y condiciones, sin encabezados adicionales.
                Ejemplos de cláusulas a considerar: no acumulable con otras promociones, válido en ciertos productos/servicios, una redención por cliente, no aplica en productos ya rebajados, sujeto a disponibilidad.
            `;
            
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });

            handleNestedStateChange('coupon', 'terms', response.text);

        } catch (error) {
            console.error("Error generating coupon terms:", error);
            alert("No se pudieron generar los términos y condiciones. Inténtalo de nuevo.");
        } finally {
            setIsGeneratingCouponTerms(false);
        }
    };
    
    const handleGeneratePaymentPlanTerms = async () => {
        setIsGeneratingPaymentPlanTerms(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const { downPayment, terms } = documentState.paymentPlan;
            const prompt = `
                Para un documento comercial con un total de ${formatCurrency(totals.total, currencySymbol)}, se ofrece un plan de pagos.
                El cliente dará un enganche de ${formatCurrency(downPayment, currencySymbol)}.
                Los plazos ofrecidos son de ${terms.join(', ')} meses.
                
                Redacta un párrafo de "Términos y Condiciones" para este plan de pagos.
                Considera cláusulas sobre aprobación de crédito, puntualidad en los pagos, y posibles cargos por mora.
                Usa el texto actual como base si existe: "${documentState.paymentPlan.customTerms || '(Vacío)'}"

                Genera solo el párrafo de los términos, sin encabezados adicionales.
            `;
            
            const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
            handleNestedStateChange('paymentPlan', 'customTerms', response.text);

        } catch (error) {
            console.error("Error generating payment plan terms:", error);
            alert("No se pudieron generar los términos y condiciones. Inténtalo de nuevo.");
        } finally {
            setIsGeneratingPaymentPlanTerms(false);
        }
    };
    
    const handleGeneratePromissoryNoteTerms = async () => {
        setIsGeneratingPromissoryNoteTerms(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const prompt = `
                Redacta un texto legal estándar para un pagaré en español (México).
                El texto debe ser formal e incluir los placeholders {companyName}, {companyAddress}, y {totalAmount} para ser reemplazados después.
                Usa el texto actual como base y mejóralo: "${documentState.promissoryNoteTerms || '(Vacío)'}"

                Genera solo el texto del pagaré, sin encabezados adicionales.
            `;
            
            const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
            handleStateChange('promissoryNoteTerms', response.text);

        } catch (error) {
            console.error("Error generating promissory note terms:", error);
            alert("No se pudieron generar las condiciones del pagaré. Inténtalo de nuevo.");
        } finally {
            setIsGeneratingPromissoryNoteTerms(false);
        }
    };


  const handleTicketUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
        const files = Array.from(e.target.files);
        const newTickets: ThirdPartyTicket[] = await Promise.all(
            files.map(async (file, index) => {
                const { data, mimeType } = await toBase64ForGemini(file);
                return {
                    id: crypto.randomUUID(),
                    title: `Ticket ${documentState.thirdPartyTickets.length + index + 1}`,
                    imageData: data,
                    mimeType: mimeType,
                    displayMode: 'image',
                    isProcessing: false,
                };
            })
        );
        setDocumentState(prev => ({
            ...prev,
            thirdPartyTickets: [...prev.thirdPartyTickets, ...newTickets]
        }));
    }
  };

  const handleThirdPartyTicketChange = (id: string, field: keyof ThirdPartyTicket, value: any) => {
    setDocumentState(prev => ({
        ...prev,
        thirdPartyTickets: prev.thirdPartyTickets.map(t => t.id === id ? { ...t, [field]: value } : t)
    }));
  };

  const handleDeleteThirdPartyTicket = (id: string) => {
    setDocumentState(prev => ({
        ...prev,
        thirdPartyTickets: prev.thirdPartyTickets.filter(t => t.id !== id)
    }));
  };

  const handleInterpretTicket = async (ticketId: string) => {
    const ticket = documentState.thirdPartyTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    handleThirdPartyTicketChange(ticketId, 'isProcessing', true);

    try {
        const interpretedData = await processTicketWithGemini(ticket.imageData, ticket.mimeType);
        handleThirdPartyTicketChange(ticketId, 'interpretedData', interpretedData);
    } catch (error) {
        console.error("Error interpreting ticket:", error);
        alert("No se pudo interpretar el ticket. Por favor, inténtalo de nuevo o déjalo como imagen.");
        handleThirdPartyTicketChange(ticketId, 'displayMode', 'image');
    } finally {
        handleThirdPartyTicketChange(ticketId, 'isProcessing', false);
    }
  };
  
  const handleBulkGenerateItems = async (selectedCategories: string[], options: AiGeneratorOptions) => {
    setIsAiBulkGeneratorModalOpen(false);
    setIsBulkGenerating(true);
    try {
        const generatedData = await processMultipleCategoriesWithGemini(
            aiPrompt,
            selectedCategories,
            columnDefinitions,
            options,
            company
        );

        setDocumentState(prev => {
            const newCategories = JSON.parse(JSON.stringify(prev.categories));
            
            Object.entries(generatedData).forEach(([categoryName, items]) => {
                const category = newCategories.find((c: CostCategory) => c.name === categoryName);
                if (category && Array.isArray(items) && items.length > 0) {
                    const newItemsWithIds = items.map((item: Omit<Item, 'id'>) => ({ ...item, id: crypto.randomUUID() }));
                    
                    if (category.subcategories.length === 0) {
                        category.subcategories.push({ id: crypto.randomUUID(), name: 'General', items: [] });
                    }
                    
                    category.subcategories[0].items.push(...newItemsWithIds);
                }
            });

            return { ...prev, categories: newCategories };
        });
        
    } catch (error) {
        alert(error instanceof Error ? error.message : "Ocurrió un error al generar los artículos.");
    } finally {
        setIsBulkGenerating(false);
    }
  };

  
  const renderItemInput = useCallback((subIndex: number, itemIndex: number, item: Item, columnKey: ColumnKey) => {
      const columnDef = columnDefinitions[columnKey];
      const value = item[columnKey];
      const commonClasses = "w-full border-0 focus:ring-1 focus:ring-blue-500 rounded-md p-1 bg-white text-slate-900 text-sm";

      switch (columnDef.inputType) {
          case 'textarea':
              return <textarea value={(value as string) || ''} onChange={e => handleItemChange(subIndex, itemIndex, columnKey, e.target.value)} rows={1} className={commonClasses} />;
          case 'select':
              return (
                  <select
                      value={(value as string) || ''}
                      onChange={e => handleItemChange(subIndex, itemIndex, columnKey, e.target.value)}
                      className={commonClasses}
                  >
                      {(!columnDef.options?.includes(value as string)) && <option value="" disabled>Selecciona...</option>}
                      {columnDef.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
              );
          case 'number':
               return <NumberInput value={(value as number) || 0} onChange={e => handleItemChange(subIndex, itemIndex, columnKey, parseFloat(e.target.value) || 0)} onFocus={e => e.target.select()} className={commonClasses} />;
          case 'date':
              return <DatePicker value={(value as string) || ''} onChange={date => handleItemChange(subIndex, itemIndex, columnKey, date)} />
          case 'time':
                return <input type="time" value={(value as string) || ''} onChange={e => handleItemChange(subIndex, itemIndex, columnKey, e.target.value)} className={commonClasses} />
          case 'checkbox':
              return <div className="flex justify-center items-center h-full"><input type="checkbox" checked={!!value} onChange={e => handleItemChange(subIndex, itemIndex, columnKey, e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></div>
          case 'file':
            const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
                if (e.target.files && e.target.files[0]) {
                    const base64 = await toBase64(e.target.files[0]);
                    handleItemChange(subIndex, itemIndex, columnKey, base64);
                }
            };
            return (
                <div className="flex items-center gap-2">
                    <label className="cursor-pointer text-xs bg-slate-100 text-slate-600 font-semibold py-1 px-2 rounded-md hover:bg-slate-200 transition-colors">
                        <span>{value ? 'Cambiar' : 'Subir'}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                    {value && <img src={value as string} alt="preview" className="w-12 h-12 object-contain rounded" />}
                </div>
            );
          case 'text':
          default:
               return <TextInput value={(value as string) || ''} onChange={e => handleItemChange(subIndex, itemIndex, columnKey, e.target.value)} className={commonClasses} />;
      }
  }, [columnDefinitions, handleItemChange]);
    
    const executeAiAnalysis = async (options: AiAnalysisOptions) => {
        if ((!aiCategoryPrompt.trim() && aiCategoryImages.length === 0) || !activeCategory) return;
        setIsGeneratingItems(true);
        try {
            const imagePayloads = aiCategoryImages.map(img => ({
                data: img.base64Data,
                mimeType: img.mimeType
            }));

            const generatedItems = await processCategoryWithGemini(
                aiCategoryPrompt,
                imagePayloads,
                activeCategory.name,
                columnDefinitions,
                options,
                company
            );
            
            if (generatedItems && Array.isArray(generatedItems) && generatedItems.length > 0) {
                // Add items to the first subcategory
                setDocumentState(prev => {
                    const newCategories = [...prev.categories];
                    const catIndex = newCategories.findIndex(c => c.id === activeCategoryId);
                    if (catIndex === -1) return prev; // Should not happen

                    const categoryToUpdate = { ...newCategories[catIndex] };
                    
                    // Ensure there's at least one subcategory
                    if (categoryToUpdate.subcategories.length === 0) {
                         categoryToUpdate.subcategories.push({ id: crypto.randomUUID(), name: 'General', items: [] });
                    }
                    
                    const subcategoriesToUpdate = [...categoryToUpdate.subcategories];
                    const firstSubcategory = { ...subcategoriesToUpdate[0] };
                    
                    const newItemsWithIds = generatedItems.map(item => ({
                        ...item,
                        id: crypto.randomUUID(),
                    }));

                    firstSubcategory.items = [...firstSubcategory.items, ...newItemsWithIds];
                    subcategoriesToUpdate[0] = firstSubcategory;
                    categoryToUpdate.subcategories = subcategoriesToUpdate;
                    newCategories[catIndex] = categoryToUpdate;
                    
                    return { ...prev, categories: newCategories };
                });
                setAiCategoryPrompt(''); // Clear prompt on success
                setAiCategoryImages(prev => { // Clear images on success
                    prev.forEach(img => URL.revokeObjectURL(img.previewUrl));
                    return [];
                });
            } else {
                alert("La IA no generó ningún artículo. Intenta ser más descriptivo.");
            }

        } catch (error) {
            console.error("Error generating items with Gemini:", error);
            alert(error instanceof Error ? error.message : "Ocurrió un error al generar los artículos. Por favor, inténtalo de nuevo.");
        } finally {
            setIsGeneratingItems(false);
        }
    };
    
    const handleAiImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
    
            const imagePromises = files.map(async file => {
                const { data, mimeType } = await toBase64ForGemini(file);
                const previewUrl = URL.createObjectURL(file);
                return { file, previewUrl, base64Data: data, mimeType };
            });
    
            const newImages = await Promise.all(imagePromises);
            setAiCategoryImages(prev => [...prev, ...newImages]);
        }
        if (e.target) {
            e.target.value = '';
        }
    };

    const handleRemoveAiImage = (fileName: string) => {
        setAiCategoryImages(prev => {
            const imageToRemove = prev.find(img => img.file.name === fileName);
            if (imageToRemove) {
                URL.revokeObjectURL(imageToRemove.previewUrl);
            }
            return prev.filter(img => img.file.name !== fileName);
        });
    };


  const activeCategoryRawSubtotal = useMemo(() => {
    if (!activeCategory) return 0;
    return activeCategory.subcategories.reduce((total, sub) => {
        return total + sub.items.reduce((subTotal, item) => {
            return subTotal + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        }, 0);
    }, 0);
  }, [activeCategory]);

  return (
    <div className="space-y-6">
      <AccordionSection title="Información del Documento" isOpen={openSections.docInfo} setIsOpen={() => toggleSection('docInfo')}>
        <div className="space-y-4">
          <FormField label="Título del Documento">
            <TextInput value={documentState.title} onChange={e => handleStateChange('title', e.target.value)} placeholder="Ej: Cocina integral para Sra. Pérez" />
          </FormField>
          
          <div>
              <FormField label="Descripción del Proyecto">
                  <TextArea value={documentState.description || ''} onChange={e => handleStateChange('description', e.target.value)} rows={3} placeholder="Un breve resumen del alcance del proyecto o servicio." />
              </FormField>
              <div className="text-right mt-2">
                  <button 
                      type="button" 
                      onClick={handleGenerateDescription}
                      disabled={isGeneratingDescription}
                      className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingDescription ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                    {isGeneratingDescription ? 'Generando...' : 'Generar con IA'}
                  </button>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Fecha de Emisión">
                <DatePicker value={documentState.date} onChange={date => handleStateChange('date', date)} />
            </FormField>
            <FormField label="Inicio de Vigencia">
                <DatePicker value={documentState.validityStartDate} onChange={date => handleStateChange('validityStartDate', date)} />
            </FormField>
            <FormField label="Fin de Vigencia">
                <DatePicker value={documentState.validityEndDate} onChange={date => handleStateChange('validityEndDate', date)} />
            </FormField>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Tipo de Documento">
               <select 
                  value={documentState.docType} 
                  onChange={e => handleStateChange('docType', e.target.value as DocumentType)}
                  className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {Object.entries(DOCUMENT_TYPES).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
            </FormField>
            <FormField label="Estado del Documento">
               <select 
                  value={documentState.status} 
                  onChange={e => handleStateChange('status', e.target.value as DocumentStatus)}
                  className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {Object.entries(DOCUMENT_STATUSES).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
            </FormField>
          </div>

          <FormField label="Folio">
              <TextInput value={documentState.docNumber} readOnly className="bg-slate-100 font-mono text-slate-500" />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Moneda">
              <select
                value={documentState.currency}
                onChange={e => handleStateChange('currency', e.target.value)}
                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {Object.entries(CURRENCIES).map(([code, { name }]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Formato de Vista Previa">
              <select
                value={documentState.previewFormat}
                onChange={e => handleStateChange('previewFormat', e.target.value as PreviewFormat)}
                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                {Object.entries(PREVIEW_FORMATS).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
            </FormField>
          </div>
           
           <FormField label="Nombre del Emisor/Vendedor">
            <TextInput value={documentState.issuerName} onChange={e => handleStateChange('issuerName', e.target.value)} />
          </FormField>
          
          <FormField label={`Anticipo Recibido (${currencySymbol})`}>
            <NumberInput 
                value={documentState.advancePayment || 0} 
                onChange={e => handleStateChange('advancePayment', parseFloat(e.target.value) || 0)} 
                onFocus={e => e.target.select()}
            />
          </FormField>

          <div>
            <div className="flex items-end gap-2">
              <div className="flex-grow">
                <FormField label="Tasa de IVA (%)">
                  <NumberInput 
                    value={documentState.vatRate} 
                    onChange={e => handleStateChange('vatRate', parseFloat(e.target.value) || 0)}
                    disabled={!documentState.showVat}
                    className="disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                </FormField>
              </div>
              <label className="flex items-center gap-2 pb-2 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={documentState.showVat}
                  onChange={e => handleStateChange('showVat', e.target.checked)}
                  disabled={documentState.docType === 'Factura'}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:bg-slate-200 disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-slate-600">Aplicar IVA</span>
              </label>
            </div>
          </div>
          
          <div>
            <div className={`p-2 rounded-md ${!company.signature ? 'bg-slate-100' : ''}`}>
                <label className={`flex items-center gap-2 whitespace-nowrap ${!company.signature ? 'cursor-not-allowed' : ''}`}>
                  <input
                    type="checkbox"
                    checked={documentState.includeSignature}
                    onChange={e => handleStateChange('includeSignature', e.target.checked)}
                    disabled={!company.signature}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:bg-slate-200 disabled:cursor-not-allowed"
                  />
                  <span className={`text-sm font-medium ${!company.signature ? 'text-slate-400' : 'text-slate-600'}`}>Incluir Firma de Empresa</span>
                </label>
                {!company.signature && (
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                        Sube una firma en la página de Configuración para habilitar esta opción.
                    </p>
                )}
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Información del Cliente" isOpen={openSections.clientInfo} setIsOpen={() => toggleSection('clientInfo')}>
        <div className="relative mb-4" ref={clientSearchRef}>
            <button
                type="button"
                onClick={() => setIsClientSearchVisible(!isClientSearchVisible)}
                className="flex items-center gap-2 text-sm bg-slate-100 text-slate-600 font-semibold py-2 px-3 rounded-lg hover:bg-slate-200 transition-colors w-full justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                Buscar y seleccionar cliente existente
            </button>
            {isClientSearchVisible && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-72 overflow-y-auto">
                    <div className="p-2 border-b">
                        <TextInput
                            autoFocus
                            value={clientSearchQuery}
                            onChange={e => setClientSearchQuery(e.target.value)}
                            placeholder="Buscar por nombre..."
                        />
                    </div>
                    {filteredClients.length > 0 ? (
                        <ul>
                            {filteredClients.map(client => (
                                <li key={client.id}>
                                    <button
                                        onClick={() => handleSelectSavedClient(client)}
                                        className="w-full text-left p-2 hover:bg-blue-50 text-slate-700"
                                    >
                                        <p className="font-medium">{client.name}</p>
                                        <p className="text-xs text-slate-500">{client.address.formattedAddress}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="p-3 text-sm text-slate-500 text-center">No se encontraron clientes.</p>
                    )}
                </div>
            )}
        </div>

        <p className="text-center text-sm text-slate-500 mb-4">- O -</p>
        <h4 className="text-md font-semibold text-slate-700 mb-2">Ingresar datos manualmente</h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
                <FormField label="Nombre del Cliente">
                    <div className="flex gap-2">
                        <select value={documentState.client.prefix} onChange={e => handleClientPropertyChange('prefix', e.target.value)} className="block w-1/3 text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                            {CLIENT_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <TextInput
                            value={documentState.client.name}
                            onChange={e => handleClientPropertyChange('name', e.target.value)}
                            placeholder="Nombre o Razón Social"
                        />
                    </div>
                </FormField>
                <FormField label="Dirección del Cliente">
                    <TextArea
                        value={documentState.client.address.formattedAddress}
                        onChange={e => handleClientAddressChange('formattedAddress', e.target.value)}
                        rows={3}
                        placeholder="Escriba la dirección completa del cliente..."
                    />
                </FormField>
            </div>
            <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-600 mb-1">Logo / Icono</label>
                <div className="w-24 h-24 mx-auto bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                    {documentState.client.logo ? (
                        <img src={documentState.client.logo} alt="Client Logo" className="w-full h-full object-contain" />
                    ) : (
                        <GenericClientIcon type={documentState.client.genericLogo} />
                    )}
                </div>
                <p className="text-xs text-slate-500 text-center">
                    Para subir un logo, guarda el cliente desde la página de "Mi Perfil".
                </p>
                <FormField label="Icono Genérico">
                    <select value={documentState.client.genericLogo} onChange={e => handleClientPropertyChange('genericLogo', e.target.value)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                        <option value="none">Ninguno</option>
                        <option value="man">Persona (Hombre)</option>
                        <option value="woman">Persona (Mujer)</option>
                        <option value="business">Empresa</option>
                        <option value="house">Residencia</option>
                    </select>
                </FormField>
            </div>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-200">
            <h4 className="text-md font-semibold text-slate-700 mb-3">Firma del Cliente</h4>
            <label className="flex items-center gap-2 mb-4 p-3 bg-slate-50 rounded-md">
                <input
                    type="checkbox"
                    checked={documentState.requestClientSignature}
                    onChange={e => handleStateChange('requestClientSignature', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Solicitar Firma del Cliente en el Documento</span>
            </label>

            {documentState.requestClientSignature && (
                <div className="pl-2 space-y-4 animate-fade-in">
                    {documentState.clientSignature ? (
                        <SignaturePreview 
                            signature={documentState.clientSignature}
                            onClear={() => handleStateChange('clientSignature', undefined)}
                        />
                    ) : (
                        <div className="text-center p-4 bg-slate-100 rounded-md">
                            <p className="text-slate-600">No se ha capturado la firma del cliente.</p>
                        </div>
                    )}
                    
                    <div className="flex items-center gap-4">
                         <button 
                            onClick={() => setIsClientSignatureModalOpen(true)} 
                            className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {documentState.clientSignature ? 'Editar Firma' : 'Capturar Firma Digital'}
                        </button>
                        <p className="text-sm text-slate-500">Si no se captura una firma digital, se mostrará un espacio para firma manual.</p>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-2">Ubicación de la Firma</label>
                        <div className="flex items-center gap-6 text-sm">
                            <label className="flex items-center gap-2">
                                <input type="radio" name="clientSigPlacement" value="default" checked={documentState.clientSignaturePlacement === 'default'} onChange={e => handleStateChange('clientSignaturePlacement', e.target.value as DocumentState['clientSignaturePlacement'])} className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500" />
                                Pie de página (Estándar)
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="clientSigPlacement" value="left_margin" checked={documentState.clientSignaturePlacement === 'left_margin'} onChange={e => handleStateChange('clientSignaturePlacement', e.target.value as DocumentState['clientSignaturePlacement'])} className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500" />
                                Margen Izquierdo
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="radio" name="clientSigPlacement" value="right_margin" checked={documentState.clientSignaturePlacement === 'right_margin'} onChange={e => handleStateChange('clientSignaturePlacement', e.target.value as DocumentState['clientSignaturePlacement'])} className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500" />
                                Margen Derecho
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
         <style>{`
            @keyframes fade-in {
                0% { opacity: 0; transform: translateY(-10px); }
                100% { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in {
                animation: fade-in 0.3s ease-out forwards;
            }
        `}</style>
      </AccordionSection>

      <AccordionSection
        title="Asistente IA para Cotizaciones"
        isOpen={openSections.aiAssistant}
        setIsOpen={() => toggleSection('aiAssistant')}
        icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8 9c0 1 .4 2.5 2 2.5S12 10 12 9s.4-2.5 2-2.5a3.6 3.6 0 0 0-1-4.3c-.6-1.1-1.8-1.7-3-1.7Z"/><path d="m12 11 1.5 2.8L16 15l-2.2 2.2L15 20l-2.8-1.5L11 21l-1.2-2.8L7.6 16l2.2-2.2L8.5 11l2.8 1.5L12 11Z"/></svg>}
      >
        <div className="space-y-4">
            <FormField label="Describe el trabajo a cotizar">
                <TextArea
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    rows={4}
                    placeholder="Ej: Instalación de una cocina integral de 3 metros en melamina, con cubierta de granito."
                />
            </FormField>
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={() => setIsAiBulkGeneratorModalOpen(true)}
                    disabled={isBulkGenerating || !aiPrompt.trim()}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-wait"
                >
                    {isBulkGenerating ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8 9c0 1 .4 2.5 2 2.5S12 10 12 9s.4-2.5 2-2.5a3.6 3.6 0 0 0-1-4.3c-.6-1.1-1.8-1.7-3-1.7Z"/><path d="m12 11 1.5 2.8L16 15l-2.2 2.2L15 20l-2.8-1.5L11 21l-1.2-2.8L7.6 16l2.2-2.2L8.5 11l2.8 1.5L12 11Z"/></svg>
                    )}
                    <span>{isBulkGenerating ? 'Generando...' : 'Generar Artículos'}</span>
                </button>
            </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Encabezado, Pie y Paginación" isOpen={openSections.layout} setIsOpen={() => toggleSection('layout')}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Header Settings */}
            <div className="space-y-4 p-4 bg-slate-100 rounded-lg">
              <h4 className="text-md font-semibold text-slate-800">Encabezado</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="headerMode" value="all_pages" checked={documentState.layout.headerMode === 'all_pages'} onChange={() => handleNestedStateChange('layout', 'headerMode', 'all_pages')} className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" /> <span>Todas las páginas igual</span></label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="headerMode" value="first_page_different" checked={documentState.layout.headerMode === 'first_page_different'} onChange={() => handleNestedStateChange('layout', 'headerMode', 'first_page_different')} className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" /> <span>Primera página diferente</span></label>
              </div>
              {documentState.layout.headerMode === 'first_page_different' && (
                <FormField label="Contenido del Encabezado (Primera Página)">
                  <TextArea value={documentState.layout.headerFirstPageContent} onChange={e => handleNestedStateChange('layout', 'headerFirstPageContent', e.target.value)} rows={2} placeholder="Ej: Reporte Confidencial" />
                </FormField>
              )}
              <FormField label={`Contenido del Encabezado (${documentState.layout.headerMode === 'first_page_different' ? 'Otras Páginas' : 'Todas as Páginas'})`}>
                <TextArea value={documentState.layout.headerContent} onChange={e => handleNestedStateChange('layout', 'headerContent', e.target.value)} rows={2} placeholder="Ej: Propuesta Técnica" />
              </FormField>
            </div>
            {/* Footer Settings */}
            <div className="space-y-4 p-4 bg-slate-100 rounded-lg">
              <h4 className="text-md font-semibold text-slate-800">Pie de Página</h4>
               <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="footerMode" value="all_pages" checked={documentState.layout.footerMode === 'all_pages'} onChange={() => handleNestedStateChange('layout', 'footerMode', 'all_pages')} className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" /> <span>Todas las páginas igual</span></label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="footerMode" value="last_page_different" checked={documentState.layout.footerMode === 'last_page_different'} onChange={() => handleNestedStateChange('layout', 'footerMode', 'last_page_different')} className="h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" /> <span>Última página diferente</span></label>
              </div>
               {documentState.layout.footerMode === 'last_page_different' && (
                <FormField label="Contenido del Pie de Página (Última Página)">
                  <TextArea value={documentState.layout.footerLastPageContent} onChange={e => handleNestedStateChange('layout', 'footerLastPageContent', e.target.value)} rows={2} placeholder="Ej: Gracias por su preferencia." />
                </FormField>
              )}
              <FormField label={`Contenido del Pie de Página (${documentState.layout.footerMode === 'last_page_different' ? 'Otras Páginas' : 'Todas las Páginas'})`}>
                <TextArea value={documentState.layout.footerContent} onChange={e => handleNestedStateChange('layout', 'footerContent', e.target.value)} rows={2} placeholder="Página {page}" />
              </FormField>
            </div>
          </div>
           {/* General Layout Settings */}
          <div className="space-y-4 p-4 bg-slate-100 rounded-lg">
            <h4 className="text-md font-semibold text-slate-800">Paginación y Contenido</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField label="Formato de Numeración de Página">
                  <select value={documentState.layout.pageNumbering} onChange={e => handleNestedStateChange('layout', 'pageNumbering', e.target.value)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                    <option value="none">Ninguna</option>
                    <option value="arabic">Números (1, 2, 3)</option>
                    <option value="roman">Romanos (i, ii, iii)</option>
                  </select>
                </FormField>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={documentState.layout.includeTOC} onChange={e => handleNestedStateChange('layout', 'includeTOC', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-medium text-slate-600">Incluir Tabla de Contenido</span>
                  </label>
                </div>
            </div>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection 
          title="Categorías y Artículos" 
          isOpen={openSections.categories} 
          setIsOpen={() => toggleSection('categories')}
          actions={
              <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 bg-blue-100 text-blue-700 font-bold py-2 px-3 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  title="Importar y clasificar automáticamente los conceptos de una imagen o PDF"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Importar Conceptos (Imagen/PDF)
              </button>
          }
      >
        <div className="border-b border-slate-200">
            <div className="flex items-center space-x-2" role="tablist" aria-label="Categorías">
                {documentState.categories.map(category => (
                    <CategoryTab
                        key={category.id}
                        categoryName={category.name}
                        isActive={category.id === activeCategoryId}
                        onClick={() => setActiveCategoryId(category.id)}
                    />
                ))}
            </div>
        </div>
        
        {activeCategory ? (
            <div className="pt-4" role="tabpanel">
                 <div className="mb-4 p-3 bg-slate-100 rounded-md">
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">Opciones de Categoría</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        <label className="flex items-center text-sm">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={activeCategory.applyVat}
                                onChange={(e) => handleCategoryChange('applyVat', e.target.checked)}
                            />
                            <span className="ml-2 text-slate-700">Aplicar IVA a esta categoría</span>
                        </label>
                    </div>
                    <hr className="my-3"/>
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">Aumento sobre Subtotal de Categoría</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <FormField label="Tipo de Aumento">
                            <select
                                value={activeCategory.markupType}
                                onChange={e => handleCategoryChange('markupType', e.target.value as CostCategory['markupType'])}
                                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                <option value="none">Ninguno</option>
                                <option value="percentage">Porcentaje (%)</option>
                                <option value="fixed">Monto Fijo ({currencySymbol})</option>
                            </select>
                        </FormField>
                        <FormField label="Valor">
                            <NumberInput
                                value={activeCategory.markupValue}
                                onChange={e => handleCategoryChange('markupValue', parseFloat(e.target.value) || 0)}
                                disabled={activeCategory.markupType === 'none'}
                                className="disabled:bg-slate-200 disabled:cursor-not-allowed"
                            />
                        </FormField>
                        {activeCategory.markupType === 'percentage' && (
                            <FormField label="Distribución">
                                <select
                                    value={activeCategory.markupDistribution}
                                    onChange={e => handleCategoryChange('markupDistribution', e.target.value as CostCategory['markupDistribution'])}
                                    className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                >
                                    <option value="proportional">Proporcional al precio</option>
                                    <option value="per-item">Aplicar a cada artículo</option>
                                </select>
                            </FormField>
                        )}
                    </div>
                     <hr className="my-3"/>
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">Columnas Visibles</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {Object.entries(columnDefinitions).map(([key, { label }]) => {
                        const isVatColumn = key === 'vat';
                        const isDisabled = isVatColumn && !activeCategory.applyVat;

                        return (
                        <label key={key} className={`flex items-center text-sm transition-opacity ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}>
                          <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-200"
                              checked={activeCategory.visibleColumns[key as ColumnKey]}
                              onChange={() => handleToggleColumn(key as ColumnKey)}
                              disabled={isDisabled}
                          />
                          <span className="ml-2 text-slate-700">{label}</span>
                        </label>
                        );
                    })}
                    </div>
                </div>

                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-md font-semibold text-slate-700 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8 9c0 1 .4 2.5 2 2.5S12 10 12 9s.4-2.5 2-2.5a3.6 3.6 0 0 0-1-4.3c-.6-1.1-1.8-1.7-3-1.7Z"></path><path d="m12 11 1.5 2.8L16 15l-2.2 2.2L15 20l-2.8-1.5L11 21l-1.2-2.8L7.6 16l2.2-2.2L8.5 11l2.8 1.5L12 11Z"></path></svg>
                        Asistente IA para "{activeCategory.name}"
                    </h4>
                    <p className="text-sm text-slate-600 mt-1 mb-3">
                        Describe un trabajo y la IA sugerirá los artículos, cantidades y precios para esta categoría.
                    </p>
                    <TextArea
                        value={aiCategoryPrompt}
                        onChange={e => setAiCategoryPrompt(e.target.value)}
                        rows={3}
                        placeholder={`Ej: Construir un muro de tablaroca de 3x2 metros.`}
                    />
                    {aiCategoryImages.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                            {aiCategoryImages.map((image, index) => (
                                <div key={`${image.file.name}-${index}`} className="relative group">
                                    <img src={image.previewUrl} alt={image.file.name} className="w-full h-20 object-cover rounded-md border" />
                                    <button
                                        onClick={() => handleRemoveAiImage(image.file.name)}
                                        className="absolute top-1 right-1 bg-black bg-opacity-50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                                        aria-label="Eliminar imagen"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-between items-center mt-2">
                        <div>
                            <input 
                                type="file" 
                                ref={aiImageInputRef} 
                                onChange={handleAiImageUpload} 
                                multiple 
                                accept="image/*" 
                                className="hidden" 
                            />
                            <button
                                type="button"
                                onClick={() => aiImageInputRef.current?.click()}
                                className="flex items-center gap-2 bg-slate-100 text-slate-600 font-semibold py-2 px-3 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                                <span>Adjuntar Fotos</span>
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsAiOptionsModalOpen(true)}
                            disabled={isGeneratingItems || (!aiCategoryPrompt.trim() && aiCategoryImages.length === 0)}
                            className="flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-400 disabled:cursor-wait text-sm"
                        >
                            {isGeneratingItems ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c-1.2 0-2.4.6-3 1.7A3.6 3.6 0 0 0 8 9c0 1 .4 2.5 2 2.5S12 10 12 9s.4-2.5 2-2.5a3.6 3.6 0 0 0-1-4.3c-.6-1.1-1.8-1.7-3-1.7Z"></path><path d="m12 11 1.5 2.8L16 15l-2.2 2.2L15 20l-2.8-1.5L11 21l-1.2-2.8L7.6 16l2.2-2.2L8.5 11l2.8 1.5L12 11Z"></path></svg>
                            )}
                            <span>{isGeneratingItems ? 'Generando...' : 'Generar Artículos'}</span>
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                  {activeCategory.subcategories.map((subcategory, subIndex) => (
                    <div key={subcategory.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <EditableSubcategoryTitle name={subcategory.name} onRename={(newName) => handleRenameSubcategory(subIndex, newName)} />
                        <button onClick={() => handleDeleteSubcategory(subIndex)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                          <thead className="text-left text-slate-600 bg-slate-100">
                              <tr>
                                  {orderedColumnKeys
                                      .filter((key) => activeCategory.visibleColumns[key])
                                      .map((key) => (
                                          <th key={key} className="p-2 font-semibold">{columnDefinitions[key].label}</th>
                                  ))}
                                  <th className="p-2 w-10"></th>
                              </tr>
                          </thead>
                          <tbody>
                            {subcategory.items.map((item, itemIndex) => (
                              <tr key={item.id} className="border-b last:border-b-0">
                                {orderedColumnKeys
                                  .filter(key => activeCategory.visibleColumns[key])
                                  .map(key => {
                                    const colDef = columnDefinitions[key];
                                    if (!colDef.isEditable) {
                                      let content = '';
                                      const itemSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                                      
                                      if (key === 'vat') {
                                        let itemMarkup = 0;
                                        if (activeCategory.markupType === 'percentage') {
                                            itemMarkup = itemSubtotal * ((activeCategory.markupValue || 0) / 100);
                                        } else if (activeCategory.markupType === 'fixed') {
                                            if (activeCategoryRawSubtotal > 0) {
                                                itemMarkup = (itemSubtotal / activeCategoryRawSubtotal) * (activeCategory.markupValue || 0);
                                            }
                                        }
                                        const itemVat = documentState.showVat && activeCategory.applyVat ? (itemSubtotal + itemMarkup) * (documentState.vatRate / 100) : 0;
                                        content = formatCurrency(itemVat, currencySymbol);
                                      } else if (key === 'total') {
                                        content = formatCurrency(itemSubtotal, currencySymbol);
                                      } else if (key === 'markup') {
                                         let itemMarkup = 0;
                                         if (activeCategory.markupType === 'percentage') {
                                             itemMarkup = itemSubtotal * ((activeCategory.markupValue || 0) / 100);
                                         } else if (activeCategory.markupType === 'fixed') {
                                             if (activeCategoryRawSubtotal > 0) {
                                                 itemMarkup = (itemSubtotal / activeCategoryRawSubtotal) * (activeCategory.markupValue || 0);
                                             }
                                         }
                                         content = formatCurrency(itemMarkup, currencySymbol);
                                      }
                                      return <td key={key} className="p-1 text-right pr-2 text-slate-600 font-medium align-top">{content}</td>;
                                    }
                                    return (
                                      <td key={key} className="p-1 align-top">
                                        {renderItemInput(subIndex, itemIndex, item, key)}
                                      </td>
                                    );
                                })}
                                <td className="p-1 text-center align-top">
                                  <button onClick={() => handleDeleteItem(subIndex, itemIndex)} className="text-slate-400 hover:text-red-600 p-1 rounded-full hover:bg-red-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          </table>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                          <div className="flex items-center gap-1 rounded-lg border border-slate-300 p-0.5 bg-white">
                              <button
                                  type="button"
                                  onClick={() => setNumItemsToAdd(prev => Math.max(1, prev - 1))}
                                  className="p-1 text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                                  aria-label="Disminuir cantidad"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              </button>
                              <input
                                  type="number"
                                  value={numItemsToAdd}
                                  onChange={e => {
                                      const val = parseInt(e.target.value, 10);
                                      setNumItemsToAdd(isNaN(val) || val < 1 ? 1 : val);
                                  }}
                                  onFocus={e => e.target.select()}
                                  className="w-12 text-center text-sm font-medium text-slate-800 bg-transparent border-0 focus:ring-0"
                                  min="1"
                                  aria-label="Cantidad de artículos a agregar"
                              />
                              <button
                                  type="button"
                                  onClick={() => setNumItemsToAdd(prev => prev + 1)}
                                  className="p-1 text-slate-600 rounded-md hover:bg-slate-100 transition-colors"
                                  aria-label="Aumentar cantidad"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              </button>
                          </div>
                          <button
                              onClick={() => handleAddItems(subIndex, numItemsToAdd)}
                              className="flex items-center gap-1.5 bg-slate-100 text-slate-600 font-semibold py-1.5 px-3 rounded-lg hover:bg-slate-200 transition-colors text-xs"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                              <span>{`Agregar ${numItemsToAdd > 1 ? `${numItemsToAdd} Artículos` : 'Artículo'}`}</span>
                          </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t pt-4">
                    <button
                        type="button"
                        onClick={handleAddSubcategory}
                        className="flex items-center gap-2 bg-slate-100 text-slate-700 font-semibold py-2 px-3 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Agregar Subcategoría</span>
                    </button>
                </div>
            </div>
        ) : (
          <div className="pt-4 text-center text-slate-500">
            <p>Selecciona una categoría para ver sus artículos.</p>
          </div>
        )}
      </AccordionSection>
      
      <AccordionSection title="Términos y Condiciones" isOpen={openSections.terms} setIsOpen={() => toggleSection('terms')}>
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Términos Generales</label>
                <TextArea
                    value={documentState.termsAndConditions || ''}
                    onChange={e => handleStateChange('termsAndConditions', e.target.value)}
                    rows={5}
                    placeholder="Escriba aquí los términos y condiciones generales, por ejemplo: validez de la oferta, políticas de pago, garantías, etc."
                />
                <div className="text-right mt-1">
                    <button 
                        type="button" 
                        onClick={handleGenerateTerms}
                        disabled={isGeneratingTerms}
                        className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingTerms ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        {isGeneratingTerms ? 'Generando...' : 'Generar con IA'}
                    </button>
                </div>
            </div>

            {(documentState.coupon.enabled || documentState.paymentPlan.enabled || documentState.docType === 'Pagaré') && (
                <div className="space-y-4 pt-4 border-t border-slate-200">
                    {documentState.coupon.enabled && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Términos del Cupón</label>
                            <TextArea 
                               value={documentState.coupon.terms} 
                               onChange={e => handleNestedStateChange('coupon', 'terms', e.target.value)} 
                               rows={3} 
                               placeholder="Ej: Válido solo en su próxima compra. No acumulable con otras promociones."
                            />
                            <div className="text-right mt-1">
                                <button 
                                    type="button" 
                                    onClick={handleGenerateCouponTerms}
                                    disabled={isGeneratingCouponTerms}
                                    className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingCouponTerms ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                  {isGeneratingCouponTerms ? 'Generando...' : 'Generar con IA'}
                                </button>
                            </div>
                        </div>
                    )}

                    {documentState.paymentPlan.enabled && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Términos del Plan de Pagos</label>
                            <TextArea 
                               value={documentState.paymentPlan.customTerms || ''} 
                               onChange={e => handleNestedStateChange('paymentPlan', 'customTerms', e.target.value)} 
                               rows={3}
                            />
                             <div className="text-right mt-1">
                                <button 
                                    type="button" 
                                    onClick={handleGeneratePaymentPlanTerms}
                                    disabled={isGeneratingPaymentPlanTerms}
                                    className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingPaymentPlanTerms ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                  {isGeneratingPaymentPlanTerms ? 'Generando...' : 'Generar con IA'}
                                </button>
                             </div>
                        </div>
                    )}

                    {documentState.docType === 'Pagaré' && (
                         <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Condiciones del Pagaré</label>
                            <TextArea 
                               value={documentState.promissoryNoteTerms || ''} 
                               onChange={e => handleStateChange('promissoryNoteTerms', e.target.value)} 
                               rows={4}
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Puedes usar placeholders: <strong>{'{companyName}'}</strong>, <strong>{'{companyAddress}'}</strong>, <strong>{'{totalAmount}'}</strong>.
                            </p>
                            <div className="text-right mt-1">
                                <button 
                                    type="button" 
                                    onClick={handleGeneratePromissoryNoteTerms}
                                    disabled={isGeneratingPromissoryNoteTerms}
                                    className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingPromissoryNoteTerms ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                  {isGeneratingPromissoryNoteTerms ? 'Generando...' : 'Generar con IA'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </AccordionSection>

      <AccordionSection title="Plan de Pagos a Plazos" isOpen={openSections.paymentPlan} setIsOpen={() => toggleSection('paymentPlan')}>
        <div className="space-y-4">
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={documentState.paymentPlan.enabled}
                    onChange={e => handleNestedStateChange('paymentPlan', 'enabled', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Habilitar Plan de Pagos</span>
            </label>

            {documentState.paymentPlan.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t mt-2">
                     <FormField label={`Enganche (${currencySymbol})`}>
                        <NumberInput value={documentState.paymentPlan.downPayment} onChange={e => handleNestedStateChange('paymentPlan', 'downPayment', parseFloat(e.target.value) || 0)} />
                    </FormField>
                     <FormField label="Periodo de Pago">
                        <select
                            value={documentState.paymentPlan.paymentPeriod}
                            onChange={e => handlePaymentPeriodChange(e.target.value as PaymentPlanConfig['paymentPeriod'])}
                            className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </FormField>
                    {documentState.paymentPlan.paymentPeriod === 'custom_days' && (
                         <FormField label="Días por Periodo">
                            <NumberInput value={documentState.paymentPlan.customPeriodDays} onChange={e => handleNestedStateChange('paymentPlan', 'customPeriodDays', parseInt(e.target.value, 10) || 1)} />
                        </FormField>
                    )}
                    <div className="md:col-span-2">
                        <TermsInput 
                            label="Plazos Disponibles"
                            terms={documentState.paymentPlan.terms}
                            onTermsChange={newTerms => handleNestedStateChange('paymentPlan', 'terms', newTerms)}
                            periodLabel={PERIOD_LABELS[documentState.paymentPlan.paymentPeriod]}
                        />
                    </div>
                     <FormField label="Tasa de Interés Base (%)">
                        <NumberInput value={documentState.paymentPlan.baseInterestRate} onChange={e => handleNestedStateChange('paymentPlan', 'baseInterestRate', parseFloat(e.target.value) || 0)} />
                    </FormField>
                     <FormField label="Incremento por Plazo (%)">
                        <NumberInput value={documentState.paymentPlan.termIncrementRate} onChange={e => handleNestedStateChange('paymentPlan', 'termIncrementRate', parseFloat(e.target.value) || 0)} />
                    </FormField>
                     <FormField label="Factor de Riesgo (%)">
                        <NumberInput value={documentState.paymentPlan.riskFactor} onChange={e => handleNestedStateChange('paymentPlan', 'riskFactor', parseFloat(e.target.value) || 0)} />
                    </FormField>
                </div>
            )}
        </div>
      </AccordionSection>

      <AccordionSection title="Cupón de Descuento" isOpen={openSections.coupon} setIsOpen={() => toggleSection('coupon')}>
        <div className="space-y-4">
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={documentState.coupon.enabled}
                    onChange={e => handleNestedStateChange('coupon', 'enabled', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium text-slate-700">Habilitar Cupón</span>
            </label>

            {documentState.coupon.enabled && (
                <div className="space-y-4 pt-4 border-t mt-4">
                    <FormField label="Título del Cupón">
                        <TextInput value={documentState.coupon.title} onChange={e => handleNestedStateChange('coupon', 'title', e.target.value)} placeholder="Ej: 20% de Descuento en Mano de Obra"/>
                    </FormField>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <FormField label="Tipo de Oferta">
                            <select
                                value={documentState.coupon.offerType}
                                onChange={e => handleNestedStateChange('coupon', 'offerType', e.target.value as Coupon['offerType'])}
                                className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            >
                                {Object.entries(OFFER_TYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="Valor de la Oferta">
                            <TextInput value={documentState.coupon.offerValue} onChange={e => handleNestedStateChange('coupon', 'offerValue', e.target.value)} placeholder="Ej: 20% o $100.00"/>
                        </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField label="Inicio de Vigencia del Cupón">
                            <DatePicker value={documentState.coupon.validityStartDate} onChange={date => handleNestedStateChange('coupon', 'validityStartDate', date)} />
                        </FormField>
                        <FormField label="Fin de Vigencia del Cupón">
                             <DatePicker value={documentState.coupon.validityEndDate} onChange={date => handleNestedStateChange('coupon', 'validityEndDate', date)} />
                        </FormField>
                    </div>
                    <div>
                        <FormField label="Términos y Condiciones">
                            <TextArea value={documentState.coupon.terms} onChange={e => handleNestedStateChange('coupon', 'terms', e.target.value)} rows={3} placeholder="Ej: Válido solo en su próxima compra. No acumulable con otras promociones."/>
                        </FormField>
                        <div className="text-right mt-2">
                             <button 
                                type="button" 
                                onClick={handleGenerateCouponTerms}
                                disabled={isGeneratingCouponTerms}
                                className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isGeneratingCouponTerms ? 'animate-spin' : ''}><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                              {isGeneratingCouponTerms ? 'Generando...' : 'Generar con IA'}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Imagen del Cupón (Opcional)</label>
                        <div className="mt-1 flex items-center gap-4">
                            <div className="w-24 h-24 bg-slate-100 rounded-md flex items-center justify-center border">
                                {documentState.coupon.image && <img src={documentState.coupon.image} alt="Coupon Preview" className="max-w-full max-h-full object-contain" />}
                            </div>
                            <input 
                                type="file" 
                                accept="image/*" 
                                onChange={async e => {
                                    if (e.target.files && e.target.files[0]) {
                                        const base64 = await toBase64(e.target.files[0]);
                                        handleNestedStateChange('coupon', 'image', base64);
                                    }
                                }} 
                                className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
      </AccordionSection>

      <AccordionSection title="Tickets de Terceros (Anexos)" isOpen={openSections.thirdPartyTickets} setIsOpen={() => toggleSection('thirdPartyTickets')}>
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Subir Tickets</label>
                <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    multiple 
                    onChange={handleTicketUpload}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-slate-500 mt-1">Sube imágenes de tickets que se adjuntarán al final del documento como anexos.</p>
            </div>
            {documentState.thirdPartyTickets.length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                    {documentState.thirdPartyTickets.map((ticket) => (
                        <div key={ticket.id} className="p-3 bg-slate-100 rounded-lg">
                           <div className="flex items-start gap-4">
                                <img src={`data:${ticket.mimeType};base64,${ticket.imageData}`} alt={ticket.title} className="w-20 h-20 object-contain bg-white rounded-md border flex-shrink-0" />
                                <div className="flex-grow space-y-3">
                                    <TextInput value={ticket.title} onChange={e => handleThirdPartyTicketChange(ticket.id, 'title', e.target.value)} />
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-slate-600">Modo:</span>
                                            <div className="flex items-center rounded-full bg-slate-200 p-0.5 text-xs">
                                                <button onClick={() => handleThirdPartyTicketChange(ticket.id, 'displayMode', 'image')} className={`px-2 py-0.5 rounded-full ${ticket.displayMode === 'image' ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500'}`}>Imagen</button>
                                                <button onClick={() => handleThirdPartyTicketChange(ticket.id, 'displayMode', 'interpret')} className={`px-2 py-0.5 rounded-full ${ticket.displayMode === 'interpret' ? 'bg-white shadow-sm font-semibold text-slate-800' : 'text-slate-500'}`}>Interpretar</button>
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteThirdPartyTicket(ticket.id)} className="p-1 text-slate-400 hover:text-red-600 rounded-full hover:bg-red-50" title="Eliminar ticket">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        </button>
                                    </div>
                                </div>
                           </div>
                           {ticket.displayMode === 'interpret' && (
                                <div className="mt-2 text-right">
                                    <button
                                      onClick={() => handleInterpretTicket(ticket.id)}
                                      disabled={ticket.isProcessing}
                                      className="flex items-center gap-2 ml-auto bg-blue-50 text-blue-700 font-semibold py-1 px-3 rounded-lg hover:bg-blue-100 transition-colors text-xs disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-wait"
                                    >
                                       {ticket.isProcessing ? (
                                           <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                       ) : (
                                           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                       )}
                                       {ticket.isProcessing ? 'Procesando...' : (ticket.interpretedData ? 'Volver a Procesar' : 'Procesar con IA')}
                                    </button>
                                </div>
                           )}
                        </div>
                    ))}
                </div>
            )}
        </div>
      </AccordionSection>

      <ImageImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onAddItems={handleAddItemsFromImage}
        uploadedTicketHashes={uploadedTicketHashes}
        categoryNames={documentState.categories.map(c => c.name)}
        columnDefinitions={columnDefinitions}
        setColumnDefinitions={setColumnDefinitions}
      />
      <SignatureInput
        isOpen={isClientSignatureModalOpen}
        onClose={() => setIsClientSignatureModalOpen(false)}
        onSave={(signature) => handleStateChange('clientSignature', signature)}
        currentSignature={documentState.clientSignature}
        askForSignerName={true}
      />
      {activeCategory && <AiAssistantOptionsModal
        isOpen={isAiOptionsModalOpen}
        onClose={() => setIsAiOptionsModalOpen(false)}
        onConfirm={(options) => {
            executeAiAnalysis(options);
            setIsAiOptionsModalOpen(false);
        }}
        company={company}
        activeCategoryName={activeCategory.name}
      />}
      <AiBulkGeneratorModal
        isOpen={isAiBulkGeneratorModalOpen}
        onClose={() => setIsAiBulkGeneratorModalOpen(false)}
        onConfirm={handleBulkGenerateItems}
        company={company}
        allCategoryNames={documentState.categories.map(c => c.name)}
      />
    </div>
  );
};