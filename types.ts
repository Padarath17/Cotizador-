export type DocumentType = 'Pre-cotización' | 'Cotización Formal' | 'Nota de Remisión' | 'Ticket' | 'Factura' | 'Pagaré';

export type DocumentStatus = 'Pendiente' | 'Aceptada' | 'Rechazada' | 'Vigente' | 'Con Garantía' | 'Pagada';

export type PreviewFormat = 'Ticket' | 'Letter' | 'HalfLetterVertical' | 'HalfLetterHorizontal';

export type ColumnKey = string;

export interface ColumnDefinition {
  label: string;
  default: boolean;
  isEditable: boolean;
  dataType: 'string' | 'number' | 'date' | 'time' | 'boolean' | 'image';
  inputType: 'text' | 'textarea' | 'number' | 'select' | 'date' | 'time' | 'checkbox' | 'file';
  options?: string[];
}

export interface Item {
  id: string;
  [key: ColumnKey]: any;
}

export interface Subcategory {
  id: string;
  name: string;
  items: Item[];
}

export interface CostCategory {
  id: string;
  name: string;
  subcategories: Subcategory[];
  showItems: boolean;
  visibleColumns: Record<ColumnKey, boolean>;
  markupApplications: number;
  applyVat: boolean;
  markupType: 'none' | 'percentage' | 'fixed';
  markupValue: number;
  markupDistribution: 'proportional' | 'per-item';
}

export interface Totals {
    subtotal: number;
    tax: number;
    total: number;
}

export interface Address {
  street: string;
  exteriorNumber: string;
  interiorNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  googleMapsUrl: string;
  formattedAddress: string;
}

export interface Client {
    id: string;
    name: string;
    address: Address;
    logo: string;
    genericLogo: 'none' | 'man' | 'woman' | 'business' | 'house';
    profileType: 'person' | 'company';
    prefix: string;
    requiresInvoice: boolean;
}

export interface FiscalProfile {
  rfc: string;
  legalName: string;
  taxRegime: string;
  fiscalAddress: string;
  certificateCer: string;
  privateKey: string;
  privateKeyPassword: string;
}

export interface SignatureData {
  mode: 'draw' | 'type' | 'upload';
  data: string; // dataURL for draw/upload, text for type
  fontFamily?: string; // for typed signatures
  signedBy?: string; 
  signedAt?: string; // ISO date string
}

export interface Company {
    id: string;
    name: string;
    logo: string;
    signature?: SignatureData;
    address: string;
    phone: string;
    email: string;
    website: string;
    fiscalProfile: FiscalProfile;
    folioCounters: {
        [key in DocumentType]?: number;
    };
    folioPrefixes: {
        [key in DocumentType]?: string;
    };
}

export interface PaymentPlanConfig {
  enabled: boolean;
  downPayment: number;
  paymentPeriod: 'monthly' | 'weekly' | 'yearly' | 'custom_days';
  customPeriodDays: number;
  terms: number[];
  baseInterestRate: number;
  riskFactor: number;
  termIncrementRate: number;
  customTerms: string;
}

export interface LayoutConfig {
  headerMode: 'all_pages' | 'first_page_different';
  headerContent: string;
  headerFirstPageContent: string;
  footerMode: 'all_pages' | 'last_page_different';
  footerContent: string;
  footerLastPageContent: string;
  pageNumbering: 'none' | 'arabic' | 'roman';
  includeTOC: boolean;
}

export interface Coupon {
  enabled: boolean;
  image: string;
  title: string;
  offerType: 'percentage_off' | 'fixed_amount_off' | 'buy_one_get_one' | 'free_shipping' | 'custom';
  offerValue: string;
  terms: string;
  validityStartDate?: string;
  validityEndDate?: string;
}

export interface InterpretedTicketData {
  storeName: string;
  date: string;
  items: Array<{
    description: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

export interface ThirdPartyTicket {
  id: string;
  title: string;
  imageData: string; // raw base64 data
  mimeType: string;
  displayMode: 'interpret' | 'image';
  interpretedData?: InterpretedTicketData;
  isProcessing: boolean;
}

export interface DocumentState {
    id: string;
    title: string;
    description?: string;
    docType: DocumentType;
    docNumber: string;
    status: DocumentStatus;
    client: Client;
    date: string;
    validityStartDate?: string;
    validityEndDate?: string;
    categories: CostCategory[];
    showVat: boolean;
    vatRate: number;
    currency: string;
    issuerName: string;
    paymentPlan: PaymentPlanConfig;
    includeSignature: boolean;
    clientSignature?: SignatureData;
    previewFormat: PreviewFormat;
    layout: LayoutConfig;
    coupon: Coupon;
    thirdPartyTickets: ThirdPartyTicket[];
    termsAndConditions?: string;
    advancePayment?: number;
    promissoryNoteTerms?: string;
}

export interface User {
    name: string;
    email: string;
    avatar: string;
}