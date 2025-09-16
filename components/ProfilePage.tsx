import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import type { DocumentState, Client, Totals, Address } from '../types';
import { formatCurrency } from '../utils/formatters';
import { CLIENT_PREFIXES } from '../constants';

interface ProfilePageProps {
  savedDocuments: DocumentState[];
  savedClients: Client[];
  setSavedClients: React.Dispatch<React.SetStateAction<Client[]>>;
  onLoadDocument: (docId: string) => void;
  onDeleteDocument: (docId: string) => void;
  onSelectClient: (clientId: string) => void;
  onNewDocument: () => void;
  calculateTotals: (doc: DocumentState) => Totals;
  currencySymbol: string;
}

const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
});

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

const ClientEditModal: React.FC<{ client: Client; onSave: (client: Client) => void; onClose: () => void; }> = ({ client, onSave, onClose }) => {
    const [editedClient, setEditedClient] = useState<Client>(client);

    const handleChange = (field: keyof Client, value: any) => {
        setEditedClient(prev => ({ ...prev, [field]: value }));
    };

    const handleAddressChange = (field: keyof Address, value: string) => {
        setEditedClient(prev => ({ ...prev, address: { ...prev.address, [field]: value } }));
    };

    const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const base64 = await toBase64(e.target.files[0]);
            handleChange('logo', base64);
        }
    };

    const handleSave = () => {
        onSave(editedClient);
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print">
            <div className="bg-white rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4">
                <h2 className="text-xl font-bold text-slate-800 mb-4">{client.id.startsWith('new-') ? 'Nuevo Cliente' : 'Editar Cliente'}</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-slate-600 mb-1">Prefijo</label>
                            <select value={editedClient.prefix} onChange={e => handleChange('prefix', e.target.value)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                {CLIENT_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1">Nombre Completo o Razón Social</label>
                            <input type="text" value={editedClient.name} onChange={e => handleChange('name', e.target.value)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-600 mb-1">Dirección</label>
                        <textarea value={editedClient.address.formattedAddress} onChange={e => handleAddressChange('formattedAddress', e.target.value)} rows={3} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                            {editedClient.logo ? <img src={editedClient.logo} alt="Logo" className="w-full h-full object-contain"/> : <GenericClientIcon type={editedClient.genericLogo}/>}
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-slate-600 mb-1">Logo</label>
                             <input type="file" accept="image/*" onChange={handleLogoUpload} className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                        </div>
                         <div>
                             <label className="block text-sm font-medium text-slate-600 mb-1">Icono Genérico</label>
                            <select value={editedClient.genericLogo} onChange={e => handleChange('genericLogo', e.target.value)} className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                                <option value="none">Ninguno</option>
                                <option value="man">Persona (Hombre)</option>
                                <option value="woman">Persona (Mujer)</option>
                                <option value="business">Empresa</option>
                                <option value="house">Residencia</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <button onClick={onClose} className="bg-white border border-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-50">Cancelar</button>
                    <button onClick={handleSave} className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700">Guardar Cambios</button>
                </div>
            </div>
        </div>
    );
};

export const ProfilePage: React.FC<ProfilePageProps> = ({
  savedDocuments,
  savedClients,
  setSavedClients,
  onLoadDocument,
  onDeleteDocument,
  onSelectClient,
  onNewDocument,
  calculateTotals,
  currencySymbol,
}) => {
    const [editingClient, setEditingClient] = useState<Client | null>(null);

    const handleSaveClient = useCallback((clientToSave: Client) => {
        setSavedClients(prevClients => {
            const clientExists = prevClients.some(c => c.id === clientToSave.id);
            if (clientExists) {
                return prevClients.map(c => c.id === clientToSave.id ? clientToSave : c);
            }
            return [...prevClients, clientToSave];
        });
        setEditingClient(null);
    }, [setSavedClients]);

    const handleAddNewClient = useCallback(() => {
        const newClient: Client = {
            id: crypto.randomUUID(),
            name: 'Nuevo Cliente',
            prefix: 'Sr.',
            profileType: 'person',
            requiresInvoice: false,
            address: { street: '', exteriorNumber: '', interiorNumber: '', neighborhood: '', city: '', state: '', zipCode: '', country: 'México', googleMapsUrl: '', formattedAddress: '' },
            logo: '',
            genericLogo: 'man',
        };
        setEditingClient(newClient);
    }, []);
    
    const handleDeleteClient = useCallback((clientId: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este cliente? Esta acción no se puede deshacer.')) {
            setSavedClients(prev => prev.filter(c => c.id !== clientId));
        }
    }, [setSavedClients]);

    return (
        <div>
            <h1 className="text-3xl font-bold text-slate-800 mb-8">Mi Perfil</h1>
            
            <section className="bg-white p-6 rounded-lg shadow-md mb-8">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h2 className="text-xl font-bold text-slate-700">Mis Clientes</h2>
                    <button onClick={handleAddNewClient} className="flex items-center gap-2 bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600 transition-colors text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Agregar Cliente</span>
                    </button>
                </div>
                {savedClients.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {savedClients.map(client => (
                            <div key={client.id} className="bg-slate-50 border rounded-lg p-4 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-start gap-4 mb-3">
                                        <div className="w-16 h-16 flex-shrink-0 bg-slate-200 rounded-lg p-1 flex items-center justify-center">
                                            {client.logo ? <img src={client.logo} alt="Logo" className="max-w-full max-h-full object-contain"/> : <GenericClientIcon type={client.genericLogo} />}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-800">{`${client.prefix} ${client.name}`}</h3>
                                            <p className="text-sm text-slate-600 whitespace-pre-line">{client.address.formattedAddress || 'Sin dirección'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-2 mt-2 border-t pt-3">
                                    <button onClick={() => handleDeleteClient(client.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100" title="Eliminar cliente"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                    <button onClick={() => setEditingClient(client)} className="flex items-center gap-1.5 text-sm bg-white border border-slate-300 text-slate-700 font-semibold py-1.5 px-3 rounded-lg hover:bg-slate-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        Editar
                                    </button>
                                    <button onClick={() => onSelectClient(client.id)} className="flex items-center gap-1.5 text-sm bg-blue-100 text-blue-700 font-semibold py-1.5 px-3 rounded-lg hover:bg-blue-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                                        Nuevo Doc.
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-center text-slate-500 py-6">No tienes clientes guardados. ¡Agrega el primero!</p>
                )}
            </section>

            <section className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h2 className="text-xl font-bold text-slate-700">Mis Documentos Guardados</h2>
                     <button onClick={onNewDocument} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition-colors text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Nuevo Documento en Blanco</span>
                    </button>
                </div>
                {savedDocuments.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-slate-500 bg-slate-50">
                                <tr>
                                    <th className="p-3 font-semibold">Título / Folio</th>
                                    <th className="p-3 font-semibold">Cliente</th>
                                    <th className="p-3 font-semibold">Fecha</th>
                                    <th className="p-3 font-semibold">Total</th>
                                    <th className="p-3 font-semibold">Estado</th>
                                    <th className="p-3 font-semibold text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {savedDocuments.map(doc => (
                                    <tr key={doc.id} className="hover:bg-slate-50">
                                        <td className="p-3">
                                            <p className="font-medium text-slate-800">{doc.title}</p>
                                            <p className="text-xs text-slate-500 font-mono">{doc.docNumber}</p>
                                        </td>
                                        <td className="p-3 text-slate-600">{doc.client.name}</td>
                                        <td className="p-3 text-slate-600">{new Date(doc.date).toLocaleDateString()}</td>
                                        <td className="p-3 font-medium text-slate-700">{formatCurrency(calculateTotals(doc).total, currencySymbol)}</td>
                                        <td className="p-3"><span className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">{doc.status}</span></td>
                                        <td className="p-3 text-right">
                                            <button onClick={() => onDeleteDocument(doc.id)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100" title="Eliminar documento"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                                            <button onClick={() => onLoadDocument(doc.id)} className="ml-2 flex items-center gap-1.5 text-sm bg-white border border-slate-300 text-slate-700 font-semibold py-1.5 px-3 rounded-lg hover:bg-slate-100">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16"/><path d="M4 18h16"/><path d="M4 6h16"/></svg>
                                                Cargar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-slate-500 py-6">No tienes documentos guardados.</p>
                )}
            </section>

            {editingClient && <ClientEditModal client={editingClient} onSave={handleSaveClient} onClose={() => setEditingClient(null)} />}
        </div>
    );
};
