import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import type { Item, ColumnDefinition } from '../types';

interface ImageImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItems: (items: (Omit<Item, 'id'> & { category: string })[], pricesIncludeVat: boolean, imageHashes: string[]) => void;
  uploadedTicketHashes: string[];
  categoryNames: string[];
  columnDefinitions: Record<string, ColumnDefinition>;
  setColumnDefinitions: React.Dispatch<React.SetStateAction<Record<string, ColumnDefinition>>>;
}

const toBase64 = (file: File): Promise<{ data: string, mimeType: string }> => new Promise((resolve, reject) => {
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

async function calculateHash(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface GeminiResponse {
    items: (Omit<Item, 'id'> & { category: string })[];
    pricesIncludeVat: boolean;
}

const processImageWithGemini = async (
    base64Image: string,
    mimeType: string,
    categoryNames: string[],
    columnDefinitions: Record<string, ColumnDefinition>
): Promise<GeminiResponse> => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const itemProperties: Record<string, { type: Type, description?: string }> = {};
        
        // Dynamically build properties for the schema based on existing column definitions
        for (const key in columnDefinitions) {
            const def = columnDefinitions[key];
            let geminiType = Type.STRING;
            if (def.dataType === 'number') {
                geminiType = Type.NUMBER;
            } else if (def.dataType === 'boolean') {
                geminiType = Type.BOOLEAN;
            }
            itemProperties[key] = { type: geminiType, description: def.label };
        }
        
        // Ensure critical numeric fields are explicitly typed as NUMBER, overriding any other setting.
        itemProperties['quantity'] = { type: Type.NUMBER, description: 'La cantidad del artículo.' };
        itemProperties['unitPrice'] = { type: Type.NUMBER, description: 'El precio por unidad del artículo.' };
        itemProperties['category'] = { type: Type.STRING, description: `La categoría más apropiada de esta lista: [${categoryNames.join(', ')}]`};

        const schema = {
            type: Type.OBJECT,
            properties: {
                pricesIncludeVat: {
                    type: Type.BOOLEAN,
                    description: 'Verdadero si los precios de los artículos ya incluyen impuestos como IVA.'
                },
                items: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: itemProperties,
                    }
                }
            },
            required: ['pricesIncludeVat', 'items']
        };

        const prompt = `
            Analiza la imagen de este recibo, factura o ticket. Extrae todos los artículos listados.
            Tu respuesta DEBE seguir estrictamente el esquema JSON proporcionado.

            **Instrucciones críticas para la extracción de datos:**
            1.  **NÚMEROS:** Para los campos 'quantity' y 'unitPrice', y cualquier otro campo de precio o cantidad, DEBES devolver un valor numérico (JSON NUMBER type).
                -   **Elimina** cualquier símbolo de moneda ($, €, MXN, etc.).
                -   **Elimina** las comas de los miles.
                -   Usa un punto como separador decimal.
                -   **Ejemplo 1:** Si el ticket dice "$1,250.50", el valor JSON debe ser \`1250.50\`.
                -   **Ejemplo 2:** Si dice "50.00 MXN", el valor debe ser \`50.00\`.
                -   Si no puedes determinar un valor numérico, usa \`0\`.
            2.  **COLUMNAS:** Asigna los datos a las claves de propiedad definidas en el esquema. Usa el 'description' de cada propiedad del esquema como guía para mapear las columnas del ticket (ej. 'P.U.' o 'Precio Unit.' mapea a 'unitPrice').
            3.  **NUEVAS COLUMNAS:** Si encuentras columnas en el ticket que no existen en el esquema (como 'SKU', 'codigo_barra', etc.), inclúyelas como propiedades adicionales en cada objeto de 'item'.
            4.  **CATEGORÍA:** Para la clave 'category', asigna la categoría más lógica para cada artículo de la lista proporcionada en la descripción del esquema.
            5.  **IMPUESTOS:** Determina si los precios unitarios ya incluyen impuestos (IVA). Si es así, establece 'pricesIncludeVat' en \`true\`, de lo contrario, en \`false\`.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { data: base64Image, mimeType: mimeType } },
                    { text: prompt },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        
        const jsonText = response.text.trim();
        const cleanedJsonText = jsonText.replace(/^```json\s*|```\s*$/g, '');
        const parsedJson = JSON.parse(cleanedJsonText);
        
        if (!parsedJson.items || !Array.isArray(parsedJson.items)) {
            parsedJson.items = [];
        }
        
        // Post-processing to ensure numeric types are correct
        parsedJson.items.forEach((item: any) => {
            if (item.quantity !== undefined && typeof item.quantity !== 'number') {
                item.quantity = parseFloat(String(item.quantity).replace(/[^0-9.-]/g, '')) || 0;
            }
            if (item.unitPrice !== undefined && typeof item.unitPrice !== 'number') {
                item.unitPrice = parseFloat(String(item.unitPrice).replace(/[^0-9.-]/g, '')) || 0;
            }
        });

        return parsedJson;

    } catch (error) {
        console.error("Error processing image with Gemini:", error);
        throw new Error("No se pudieron extraer los artículos del archivo. Intenta con un archivo más claro o un formato diferente.");
    }
};

export const ImageImportModal: React.FC<ImageImportModalProps> = ({ isOpen, onClose, onAddItems, uploadedTicketHashes, categoryNames, columnDefinitions, setColumnDefinitions }) => {
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [filePreviews, setFilePreviews] = useState<{name: string, url: string, type: string}[]>([]);
    const [extractedItems, setExtractedItems] = useState<(Omit<Item, 'id'> & {id: string, category: string})[]>([]);
    const [pricesIncludeVat, setPricesIncludeVat] = useState<boolean>(false);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [step, setStep] = useState<'idle' | 'processing' | 'columns' | 'review' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [currentImageHashes, setCurrentImageHashes] = useState<Record<string, string>>({});
    const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
    const [processingProgress, setProcessingProgress] = useState<{ total: number; current: number; fileName: string } | null>(null);

    const [discoveredItems, setDiscoveredItems] = useState<(Omit<Item, 'id'> & { category: string })[]>([]);
    const [newKeys, setNewKeys] = useState<string[]>([]);

    useEffect(() => {
        const urlsToRevoke = filePreviews.map(p => p.url).filter(Boolean);
        return () => {
            urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
        };
    }, [filePreviews]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        if (isOpen) document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const resetState = useCallback(() => {
        setImageFiles([]);
        setFilePreviews([]);
        setExtractedItems([]);
        setDiscoveredItems([]);
        setNewKeys([]);
        setPricesIncludeVat(false);
        setSelectedItemIds(new Set());
        setStep('idle');
        setErrorMessage('');
        setCurrentImageHashes({});
        setDuplicateFileNames([]);
        setProcessingProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        if (files.length > 0) {
            resetState();
            setImageFiles(files);

            const previews = files.map(file => ({
                name: file.name,
                url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
                type: file.type
            }));
            setFilePreviews(previews);

            const newHashes: Record<string, string> = {};
            const duplicates: string[] = [];
            
            await Promise.all(files.map(async (file) => {
                try {
                    const hash = await calculateHash(file);
                    newHashes[file.name] = hash;
                    if (uploadedTicketHashes.includes(hash)) {
                        duplicates.push(file.name);
                    }
                } catch (error) {
                    console.error(`Error calculating hash for ${file.name}:`, error);
                }
            }));
            
            setCurrentImageHashes(newHashes);
            setDuplicateFileNames(duplicates);
        }
    };

    const handleProcessImage = async () => {
        if (imageFiles.length === 0) return;
        setStep('processing');
        setErrorMessage('');
        
        let allItems: (Omit<Item, 'id'> & { category: string })[] = [];
        let anyPriceIncludesVat = false;
        const allNewKeys = new Set<string>();
        const existingKeys = new Set(Object.keys(columnDefinitions));
        
        try {
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                setProcessingProgress({ total: imageFiles.length, current: i + 1, fileName: file.name });
                
                const { data, mimeType } = await toBase64(file);
                const result = await processImageWithGemini(data, mimeType, categoryNames, columnDefinitions);
                
                allItems = [...allItems, ...result.items];
                if (result.pricesIncludeVat) {
                    anyPriceIncludesVat = true;
                }

                result.items.forEach(item => {
                    Object.keys(item).forEach(key => {
                        if (key !== 'category' && !existingKeys.has(key)) {
                            allNewKeys.add(key);
                        }
                    });
                });
            }

            if (allNewKeys.size > 0) {
                setDiscoveredItems(allItems);
                setPricesIncludeVat(anyPriceIncludesVat);
                setNewKeys(Array.from(allNewKeys));
                setStep('columns');
            } else {
                const itemsWithId = allItems.map(item => ({...item, id: crypto.randomUUID()}));
                setExtractedItems(itemsWithId);
                setPricesIncludeVat(anyPriceIncludesVat);
                setSelectedItemIds(new Set(itemsWithId.map(item => item.id)));
                setStep('review');
            }
        } catch (error) {
            setStep('error');
            setErrorMessage(error instanceof Error ? error.message : 'Ocurrió un error desconocido durante el procesamiento.');
        } finally {
            setProcessingProgress(null);
        }
    };
    
    const handleAcceptNewColumns = () => {
        const newColumnDefs: Record<string, ColumnDefinition> = {};
        newKeys.forEach(key => {
            newColumnDefs[key] = {
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Title Case Label
                default: true,
                isEditable: true,
                dataType: 'string', // Default to string, user can change later
                inputType: 'text',
            };
        });
        setColumnDefinitions(prev => ({ ...prev, ...newColumnDefs }));
        const itemsWithId = discoveredItems.map(item => ({...item, id: crypto.randomUUID()}));
        setExtractedItems(itemsWithId);
        setSelectedItemIds(new Set(itemsWithId.map(item => item.id)));
        setStep('review');
    };

    const handleIgnoreNewColumns = () => {
        const existingKeys = Object.keys(columnDefinitions);
        const cleanedItems = discoveredItems.map(item => {
            const newItem: any = {};
            existingKeys.forEach(key => {
                if (item[key] !== undefined) newItem[key] = item[key];
            });
            if (item.category) newItem.category = item.category; // Preserve category
            return newItem;
        });
        const itemsWithId = cleanedItems.map(item => ({...item, id: crypto.randomUUID()}));
        setExtractedItems(itemsWithId);
        setSelectedItemIds(new Set(itemsWithId.map(item => item.id)));
        setStep('review');
    };

    const handleToggleSelection = (itemId: string) => {
        const newSelection = new Set(selectedItemIds);
        if (newSelection.has(itemId)) newSelection.delete(itemId);
        else newSelection.add(itemId);
        setSelectedItemIds(newSelection);
    };

    const handleToggleSelectAll = () => {
        if (selectedItemIds.size === extractedItems.length) setSelectedItemIds(new Set());
        else setSelectedItemIds(new Set(extractedItems.map(item => item.id)));
    };

    const handleAddSelectedItems = () => {
        const itemsToAdd = extractedItems.filter(item => selectedItemIds.has(item.id));
        const hashesToAdd = Object.values(currentImageHashes);
        onAddItems(itemsToAdd, pricesIncludeVat, hashesToAdd);
        handleClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print" role="dialog" aria-modal="true" aria-labelledby="image-import-title">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-3xl w-full mx-4 transform transition-all flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center border-b pb-3">
                    <h2 id="image-import-title" className="text-xl font-bold text-slate-800">Importar y Clasificar Artículos</h2>
                    <button onClick={handleClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100">&times;</button>
                </div>

                <div className="py-4 flex-grow overflow-y-auto">
                    {step === 'idle' && (
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-lg text-center">
                            <input type="file" accept="image/*,application/pdf" capture="environment" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple />
                            {imageFiles.length > 0 ? (
                                <div className="w-full p-2 border rounded-md max-h-64 overflow-y-auto mb-4">
                                    <ul className="divide-y">
                                        {filePreviews.map((file, index) => (
                                            <li key={index} className="flex items-center gap-3 p-2">
                                                {file.type.startsWith('image/') ? (
                                                    <img src={file.url} alt={file.name} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
                                                ) : (
                                                    <div className="w-12 h-12 bg-slate-200 rounded-md flex items-center justify-center flex-shrink-0">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                                    </div>
                                                )}
                                                <span className="text-sm text-slate-700 truncate">{file.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 mb-3"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                    <p className="text-slate-600 mb-2">Arrastra imágenes o PDFs o haz clic para seleccionar</p>
                                </>
                            )}
                             {duplicateFileNames.length > 0 && (
                                <div className="p-2 my-3 text-sm text-center bg-yellow-50 text-yellow-800 rounded-md border border-yellow-200">
                                    <p><strong>Advertencia:</strong> {duplicateFileNames.length > 1 ? 'Los siguientes archivos ya han sido procesados' : 'El siguiente archivo ya ha sido procesado'}:</p>
                                    <ul className="list-disc list-inside text-left mt-1">
                                        {duplicateFileNames.map(name => <li key={name}>{name}</li>)}
                                    </ul>
                                    <p className="mt-1">¿Deseas continuar de todos modos?</p>
                                </div>
                            )}
                            <button onClick={() => fileInputRef.current?.click()} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors text-sm">
                                {imageFiles.length > 0 ? 'Cambiar Archivos' : 'Seleccionar Archivos'}
                            </button>
                        </div>
                    )}
                    
                    {step === 'error' && <p className="text-red-600 mt-4 text-center">{errorMessage}</p>}

                    {step === 'processing' && (
                        <div className="flex flex-col items-center justify-center p-10">
                            <svg className="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            {processingProgress ? (
                                <p className="mt-4 text-slate-600 text-center">
                                    Analizando archivo {processingProgress.current} de {processingProgress.total}:
                                    <span className="font-semibold block mt-1 truncate max-w-sm">{processingProgress.fileName}</span>
                                </p>
                            ) : (
                                <p className="mt-4 text-slate-600">Preparando para procesar...</p>
                            )}
                        </div>
                    )}
                    
                    {step === 'columns' && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <h3 className="text-lg font-semibold text-slate-800">Nuevos Campos Detectados</h3>
                            <p className="mt-1 text-sm text-slate-600">Uno o más archivos contienen campos que no existen en tu configuración actual. ¿Qué deseas hacer?</p>
                            <div className="mt-3 bg-white p-3 rounded-md">
                                <p className="text-sm font-medium text-slate-500 mb-2">Nuevos campos:</p>
                                <div className="flex flex-wrap gap-2">
                                    {newKeys.map(key => (
                                        <span key={key} className="px-2.5 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">{key}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-4 flex gap-4">
                                <button onClick={handleAcceptNewColumns} className="w-full flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">
                                    Crear Nuevas Columnas y Continuar
                                </button>
                                <button onClick={handleIgnoreNewColumns} className="w-full flex-1 bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">
                                    Ignorar Nuevos Campos
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {step === 'review' && (
                        <div>
                             {pricesIncludeVat && (
                                <div className="p-2 mb-3 text-sm text-center bg-blue-50 text-blue-800 rounded-md border border-blue-200">
                                    <p>La IA detectó que los precios en uno o más tickets <strong>ya incluyen IVA</strong>. Se calculará el precio base automáticamente.</p>
                                </div>
                            )}
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-md font-semibold text-slate-700">Artículos Encontrados ({extractedItems.length})</h3>
                                <button onClick={handleToggleSelectAll} className="text-sm text-blue-600 font-medium hover:underline">
                                    {selectedItemIds.size === extractedItems.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                </button>
                            </div>
                            <div className="overflow-auto border rounded-lg max-h-80">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th className="p-2 w-10 text-center"><input type="checkbox" checked={selectedItemIds.size === extractedItems.length && extractedItems.length > 0} onChange={handleToggleSelectAll} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></th>
                                            <th className="p-2 text-left font-semibold text-slate-600">Descripción</th>
                                            <th className="p-2 w-40 text-left font-semibold text-slate-600">Categoría Sugerida</th>
                                            <th className="p-2 w-24 text-right font-semibold text-slate-600">Cantidad</th>
                                            <th className="p-2 w-28 text-right font-semibold text-slate-600">Precio Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {extractedItems.map(item => (
                                            <tr key={item.id}>
                                                <td className="p-2 text-center"><input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => handleToggleSelection(item.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /></td>
                                                <td className="p-2 text-slate-800">{item.description || 'N/A'}</td>
                                                <td className="p-2 text-slate-600"><span className="px-2 py-0.5 text-xs font-medium text-purple-800 bg-purple-100 rounded-full">{item.category}</span></td>
                                                <td className="p-2 text-right text-slate-600">{typeof item.quantity === 'number' ? item.quantity : 'N/A'}</td>
                                                <td className="p-2 text-right text-slate-600 font-medium">{typeof item.unitPrice === 'number' ? item.unitPrice.toFixed(2) : 'N/A'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t pt-4 mt-auto">
                    <button onClick={handleClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors">Cancelar</button>
                    {step === 'idle' || step === 'error' ? (
                        <button onClick={handleProcessImage} disabled={imageFiles.length === 0} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed">
                            Procesar Archivo(s)
                        </button>
                    ) : step === 'review' ? (
                        <button onClick={handleAddSelectedItems} disabled={selectedItemIds.size === 0} className="bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed">
                            Agregar {selectedItemIds.size} Artículo(s)
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
};