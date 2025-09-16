import type { PreviewFormat, ColumnKey, ColumnDefinition, DocumentType, DocumentStatus, Company } from './types';

export const INITIAL_CATEGORIES: string[] = [
  'Mano de Obra',
  'Materiales',
  'Logística',
  'Servicios Terceros',
  'Viáticos',
  'Riesgo e Imprevistos',
  'Agregados',
];

export const DOCUMENT_TYPES: Record<DocumentType, string> = {
  'Pre-cotización': 'Pre-cotización',
  'Cotización Formal': 'Cotización Formal',
  'Nota de Remisión': 'Nota de Remisión',
  'Ticket': 'Ticket',
  'Factura': 'Factura',
  'Pagaré': 'Pagaré',
};

const initialFolioCounters = Object.keys(DOCUMENT_TYPES).reduce((acc, type) => {
    acc[type as DocumentType] = 1;
    return acc;
}, {} as { [key in DocumentType]?: number });

const initialFolioPrefixes: { [key in DocumentType]?: string } = {
    'Pre-cotización': 'PRE-',
    'Cotización Formal': 'COT-',
    'Nota de Remisión': 'REM-',
    'Ticket': 'TIC-',
    'Factura': 'FAC-',
    'Pagaré': 'PAG-',
};


export const DOCUMENT_STATUSES: Record<DocumentStatus, string> = {
  'Pendiente': 'Pendiente',
  'Aceptada': 'Aceptada',
  'Rechazada': 'Rechazada',
  'Vigente': 'Vigente',
  'Con Garantía': 'Con Garantía',
  'Pagada': 'Pagada',
};

export const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  'MXN': { symbol: '$', name: 'Peso Mexicano (MXN)' },
  'USD': { symbol: '$', name: 'Dólar Estadounidense (USD)' },
  'EUR': { symbol: '€', name: 'Euro (EUR)' },
  'JPY': { symbol: '¥', name: 'Yen Japonés (JPY)' },
  'CNY': { symbol: '¥', name: 'Yuan Chino (CNY)' },
  'GBP': { symbol: '£', name: 'Libra Esterlina (GBP)' },
};


export const PREVIEW_FORMATS: Record<PreviewFormat, string> = {
  Ticket: 'Ticket (80mm)',
  Letter: 'Hoja Carta (8.5" x 11")',
  HalfLetterVertical: 'Media Carta Vertical (5.5" x 8.5")',
  HalfLetterHorizontal: 'Media Carta Horizontal (8.5" x 5.5")',
};

export const INITIAL_COLUMN_DEFINITIONS: Record<ColumnKey, ColumnDefinition> = {
  description: { label: 'Descripción', default: true, isEditable: true, dataType: 'string', inputType: 'textarea' },
  concept: { label: 'Concepto', default: false, isEditable: true, dataType: 'string', inputType: 'text' },
  unit: { label: 'Unidad', default: false, isEditable: true, dataType: 'string', inputType: 'select', options: ['Pza', 'Kg', 'm', 'm²', 'L', 'Servicio', 'Jornal'] },
  quantity: { label: 'Cantidad', default: true, isEditable: true, dataType: 'number', inputType: 'number' },
  unitPrice: { label: 'Precio Unit.', default: true, isEditable: true, dataType: 'number', inputType: 'number' },
  markup: { label: 'Aumento', default: false, isEditable: false, dataType: 'number', inputType: 'number' },
  vat: { label: 'IVA', default: false, isEditable: false, dataType: 'number', inputType: 'number' },
  total: { label: 'Total', default: true, isEditable: false, dataType: 'number', inputType: 'number' },
};

export const INITIAL_COMPANY_STATE: Company = {
    id: crypto.randomUUID(),
    name: 'Mi Empresa S.A. de C.V.',
    logo: '',
    signature: undefined,
    address: 'Calle Falsa 123, Colonia Centro, Ciudad, Estado, CP 12345',
    phone: '55-1234-5678',
    email: 'contacto@miempresa.com',
    website: 'www.miempresa.com',
    fiscalProfile: {
      rfc: '',
      legalName: '',
      taxRegime: '',
      fiscalAddress: '',
      certificateCer: '',
      privateKey: '',
      privateKeyPassword: '',
    },
    folioCounters: initialFolioCounters,
    folioPrefixes: initialFolioPrefixes,
};

export const CLIENT_PREFIXES: string[] = [
  'Sr.',
  'Sra.',
  'Srita.',
  'Dr.',
  'Dra.',
  'Ing.',
  'Lic.',
  'Arq.',
  'C.P.',
  'Mtro.',
  'Mtra.',
];