import React, { useState, useMemo, useCallback, useEffect } from 'react';
import useLocalStorageState from './hooks/useLocalStorageState';
import { useAuth } from './hooks/useAuth';

import type { DocumentState, CostCategory, Item, Totals, ColumnKey, Company, Client, ColumnDefinition, DocumentType, Subcategory, SignatureData } from './types';
import { INITIAL_CATEGORIES, INITIAL_COLUMN_DEFINITIONS, INITIAL_COMPANY_STATE, CURRENCIES } from './constants';
import { formatCurrency, generateFolio } from './utils/formatters';

import { Header } from './components/Header';
import { DocumentEditor } from './components/DocumentEditor';
import { DocumentPreview } from './components/DocumentPreview';
import { Login } from './components/Login';
import { ProfilePage } from './components/ProfilePage';
import { SettingsPage } from './components/SettingsPage';
import { ExportModal } from './components/ExportModal';
import { PanelToggleButton } from './components/PanelToggleButton';


// html-to-image and jspdf are common for client-side PDF generation
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';


const createInitialDocumentState = (company: Company): DocumentState => {
    const docType: DocumentType = 'Cotización Formal';
    const sequence = company.folioCounters?.[docType] || 1;
    const prefix = company.folioPrefixes?.[docType] || 'COT-';
    const creationDate = new Date();
    
    const defaultVisibleColumns = Object.fromEntries(
        Object.entries(INITIAL_COLUMN_DEFINITIONS).map(([key, { default: isDefault }]) => [key, isDefault])
    ) as Record<ColumnKey, boolean>;

    return {
        id: crypto.randomUUID(),
        title: 'Nueva Cotización',
        description: '',
        docType: docType,
        docNumber: generateFolio(prefix, sequence, creationDate),
        status: 'Pendiente',
        client: {
            id: crypto.randomUUID(),
            name: '',
            prefix: 'Sr.',
            profileType: 'person',
            requiresInvoice: false,
            address: { street: '', exteriorNumber: '', interiorNumber: '', neighborhood: '', city: '', state: '', zipCode: '', country: 'México', googleMapsUrl: '', formattedAddress: '' },
            logo: '',
            genericLogo: 'man',
        },
        date: creationDate.toISOString().split('T')[0],
        validityStartDate: '',
        validityEndDate: '',
        categories: INITIAL_CATEGORIES.map(name => ({
            id: crypto.randomUUID(),
            name: name,
            subcategories: [{ id: crypto.randomUUID(), name: 'General', items: [] }],
            showItems: true,
            visibleColumns: defaultVisibleColumns,
            markupApplications: 0,
            applyVat: true,
            markupType: 'none',
            markupValue: 0,
            markupDistribution: 'proportional',
        })),
        showVat: true,
        vatRate: 16,
        currency: 'MXN',
        issuerName: company.name,
        paymentPlan: {
            enabled: false,
            downPayment: 0,
            paymentPeriod: 'monthly',
            customPeriodDays: 30,
            terms: [],
            baseInterestRate: 0,
            riskFactor: 0,
            termIncrementRate: 0,
            customTerms: 'El plan de pagos está sujeto a aprobación de crédito. Los pagos deben realizarse en las fechas estipuladas para evitar cargos por mora.',
        },
        includeSignature: false,
        requestClientSignature: false,
        clientSignaturePlacement: 'default',
        clientSignature: undefined,
        previewFormat: 'Letter',
        termsAndConditions: '1. Los precios están sujetos a cambio sin previo aviso.\n2. La vigencia de esta cotización es de 30 días.\n3. El tiempo de entrega puede variar según la disponibilidad de materiales.',
        promissoryNoteTerms: 'Debo y pagaré incondicionalmente por este pagaré a la orden de {companyName} en {companyAddress} la cantidad de {totalAmount}.',
        advancePayment: 0,
        coupon: {
            enabled: false,
            image: '',
            title: '¡Oferta Especial!',
            offerType: 'custom',
            offerValue: 'Tu oferta aquí',
            terms: 'Aplican restricciones. Válido hasta fin de mes.',
            validityStartDate: '',
            validityEndDate: '',
        },
        thirdPartyTickets: [],
        layout: {
            headerMode: 'all_pages',
            headerContent: '',
            headerFirstPageContent: '',
            footerMode: 'all_pages',
            footerContent: 'Página {page}',
            footerLastPageContent: '',
            pageNumbering: 'arabic',
            includeTOC: false,
        }
    };
};

function App() {
  const { user, login, logout } = useAuth();
  const [currentView, setCurrentView] = useState<'editor' | 'profile' | 'settings'>('editor');
  
  const [companies, setCompanies] = useLocalStorageState<Company[]>('companies', [INITIAL_COMPANY_STATE]);
  const [activeCompanyId, setActiveCompanyId] = useLocalStorageState<string | null>('activeCompanyId', companies[0]?.id || null);
  
  const activeCompany = useMemo(() => {
    return companies.find(c => c.id === activeCompanyId) || companies[0] || INITIAL_COMPANY_STATE;
  }, [companies, activeCompanyId]);
  
  const [documentState, setDocumentState] = useLocalStorageState<DocumentState>('documentState', createInitialDocumentState(activeCompany));
  const [savedDocuments, setSavedDocuments] = useLocalStorageState<DocumentState[]>('savedDocuments', []);
  const [savedClients, setSavedClients] = useLocalStorageState<Client[]>('savedClients', []);
  const [columnDefinitions, setColumnDefinitions] = useLocalStorageState<Record<string, ColumnDefinition>>('columnDefinitions', INITIAL_COLUMN_DEFINITIONS);
  const [uploadedTicketHashes, setUploadedTicketHashes] = useLocalStorageState<string[]>('uploadedTicketHashes', []);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [_, forceUpdate] = React.useState(0);
  const [isPanelCollapsed, setIsPanelCollapsed] = useLocalStorageState<boolean>('isPanelCollapsed', false);

  const currencySymbol = useMemo(() => CURRENCIES[documentState.currency]?.symbol || '$', [documentState.currency]);

  useEffect(() => {
    if (activeCompany) {
      setDocumentState(prev => ({ ...prev, issuerName: activeCompany.name }));
    }
  }, [activeCompany, setDocumentState]);

  const calculateTotals = useCallback((doc: DocumentState): Totals => {
      let subtotalWithMarkups = 0;
      let tax = 0;

      doc.categories.forEach(category => {
          // First, calculate the raw subtotal for the category from items
          let categoryRawSubtotal = 0;
          category.subcategories.forEach(sub => {
              sub.items.forEach(item => {
                  categoryRawSubtotal += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
              });
          });

          // Now, determine the total with markups for this category
          let categoryTotalWithMarkups = categoryRawSubtotal;
          if (category.markupType === 'percentage') {
              // Note: 'per-item' and 'proportional' distribution have the same net effect on the category total.
              categoryTotalWithMarkups += categoryRawSubtotal * ((category.markupValue || 0) / 100);
          } else if (category.markupType === 'fixed') {
              categoryTotalWithMarkups += (category.markupValue || 0);
          }

          // Calculate tax based on the final category total (with markups)
          if (doc.showVat && category.applyVat) {
              tax += categoryTotalWithMarkups * ((doc.vatRate || 0) / 100);
          }
          
          // Add this category's total (with markups) to the grand subtotal
          subtotalWithMarkups += categoryTotalWithMarkups;
      });

      return {
          subtotal: subtotalWithMarkups,
          tax: tax,
          total: subtotalWithMarkups + tax
      };
  }, []);

  const totals = useMemo(() => calculateTotals(documentState), [documentState, calculateTotals]);

  const handleSaveDocument = useCallback(() => {
      const docExists = savedDocuments.some(d => d.id === documentState.id);
      if (docExists) {
          setSavedDocuments(prev => prev.map(d => d.id === documentState.id ? documentState : d));
      } else {
          setSavedDocuments(prev => [...prev, documentState]);
      }
      
      // Update folio counter if this document's sequence is higher
      const { docType, docNumber } = documentState;
      const sequenceStr = docNumber.split('-')[1];
      if (sequenceStr) {
          const sequence = parseInt(sequenceStr, 10);
          const currentCounter = activeCompany.folioCounters?.[docType] || 0;
          if (!isNaN(sequence) && sequence > currentCounter) {
              setCompanies(prev => prev.map(c => 
                  c.id === activeCompany.id
                  ? { ...c, folioCounters: { ...(c.folioCounters || {}), [docType]: sequence } }
                  : c
              ));
          }
      }

      // Also save client if not already saved
      if (documentState.client.name && !savedClients.some(c => c.id === documentState.client.id)) {
        setSavedClients(prev => [...prev, documentState.client]);
      }
      alert('Documento guardado!');
  }, [documentState, savedDocuments, setSavedDocuments, savedClients, setSavedClients, activeCompany, setCompanies]);

  const handleNewDocument = useCallback(() => {
    const docType: DocumentType = 'Cotización Formal';
    const currentCounter = activeCompany.folioCounters?.[docType] || 0;
    const newDoc = createInitialDocumentState(activeCompany);
    
    const sequence = currentCounter + 1;
    const creationDate = new Date();

    setDocumentState({
      ...newDoc,
      date: creationDate.toISOString().split('T')[0],
      docNumber: generateFolio(activeCompany.folioPrefixes?.[docType] || 'COT-', sequence, creationDate),
    });

    // Update folio counter in company settings
    setCompanies(prev => prev.map(c => 
        c.id === activeCompany.id 
        ? { ...c, folioCounters: { ...(c.folioCounters || {}), [docType]: sequence } } 
        : c
    ));

    setCurrentView('editor');
  }, [activeCompany, setDocumentState, setCompanies]);

  const handleLoadDocument = useCallback((docId: string) => {
    const docToLoad = savedDocuments.find(d => d.id === docId);
    if (docToLoad) {
      setDocumentState(docToLoad);
      setCurrentView('editor');
    }
  }, [savedDocuments, setDocumentState]);

  const handleDeleteDocument = useCallback((docId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este documento?')) {
      setSavedDocuments(prev => prev.filter(d => d.id !== docId));
    }
  }, [setSavedDocuments]);

  const handleSelectClientForNewDoc = useCallback((clientId: string) => {
    const client = savedClients.find(c => c.id === clientId);
    if (client) {
      handleNewDocument();
      setDocumentState(prev => ({...prev, client: client}));
    }
    setCurrentView('editor');
  }, [savedClients, handleNewDocument, setDocumentState]);

  const handleExportToPdf = useCallback(async (filename: string) => {
    const doc = documentState;
    const company = activeCompany;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const A4_WIDTH = 210;
    const A4_HEIGHT = 297;
    const MARGIN = 5;
    const DRAW_WIDTH = A4_WIDTH - (MARGIN * 2);
    const FOOTER_HEIGHT = 15;
    const HEADER_HEIGHT = 30;
    const DRAW_HEIGHT = A4_HEIGHT - (MARGIN * 2) - FOOTER_HEIGHT;

    let y = MARGIN;
    let page = 1;

    const currencySymbol = CURRENCIES[doc.currency]?.symbol || '$';
    
    const romanize = (num: number): string => {
        if (isNaN(num)) return '';
        const digits = String(+num).split("");
        const key = ["", "C", "CC", "CCC", "CD", "D", "DC", "DCC", "DCCC", "CM",
                   "", "X", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC",
                   "", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
        let roman = "", i = 3;
        while (i--)
            roman = (key[+digits.pop()! + (i * 10)] || "") + roman;
        return (Array(+digits.join("") + 1).join("M") + roman).toLowerCase();
    };

    const getImageData = (base64: string): Promise<{ data: string, format: string }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = base64;
            img.onload = () => {
                const format = base64.substring(base64.indexOf('/') + 1, base64.indexOf(';')).toUpperCase();
                resolve({ data: base64, format: format === 'SVG+XML' ? 'SVG' : format });
            };
            img.onerror = (e) => reject(e);
        });
    };

    const drawHeader = async () => {
        y = MARGIN;
        let textX = MARGIN;
        if (company.logo) {
            try {
                const { data, format } = await getImageData(company.logo);
                const img = new Image();
                img.src = data;
                const aspectRatio = img.width / img.height;
                const imgHeight = 16;
                const imgWidth = imgHeight * aspectRatio;
                pdf.addImage(data, format, MARGIN, y, imgWidth, imgHeight);
                textX += imgWidth + 4;
            } catch (e) { console.error("Error loading company logo for PDF:", e); }
        }
        pdf.setFontSize(10).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
        pdf.text(company.name, textX, y + 5);
        pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
        const addressLines = pdf.splitTextToSize(company.address, 70);
        pdf.text(addressLines, textX, y + 9);
        const contactInfo = `${company.phone} | ${company.email}`;
        pdf.text(contactInfo, textX, y + 9 + (addressLines.length * 3.5));

        pdf.setFontSize(12).setFont('helvetica', 'bold').setTextColor(29, 78, 216);
        pdf.text(doc.docType.toUpperCase(), A4_WIDTH - MARGIN, y + 5, { align: 'right' });
        
        pdf.setFontSize(9).setFont('courier', 'bold').setTextColor(127, 29, 29); // Tinto color
        pdf.text(doc.docNumber, A4_WIDTH - MARGIN, y + 10, { align: 'right' });
        
        pdf.setFont('helvetica', 'normal').setTextColor(51, 65, 85);
        pdf.text(`Fecha: ${new Date(doc.date).toLocaleDateString()}`, A4_WIDTH - MARGIN, y + 15, { align: 'right' });

        y = MARGIN + HEADER_HEIGHT;
    };

    const drawFooter = () => {
        const yPos = A4_HEIGHT - MARGIN - 5;
        pdf.setFontSize(8).setTextColor(100, 116, 139);
        const content = doc.layout.footerContent;
        const hasPageNumbering = doc.layout.pageNumbering !== 'none';

        if (hasPageNumbering) {
            let pageStr = '';
            if (doc.layout.pageNumbering === 'roman') pageStr = romanize(page);
            else pageStr = page.toString();

            if (content.includes('{page}')) {
                // If the placeholder is present, the user controls the full string, aligned right.
                const fullText = content.replace('{page}', pageStr);
                pdf.text(fullText, A4_WIDTH - MARGIN, yPos, { align: 'right' });
            } else {
                // No placeholder, so text goes left, default page number goes right.
                if (content) pdf.text(content, MARGIN, yPos);
                pdf.text(`Página ${pageStr}`, A4_WIDTH - MARGIN, yPos, { align: 'right' });
            }
        } else {
            // No page numbering, just display the text on the left.
            const text = content.replace('{page}', '').trim();
            if (text) pdf.text(text, MARGIN, yPos);
        }
    };

    const checkAndAddPage = async (heightNeeded: number) => {
        if (y + heightNeeded > MARGIN + DRAW_HEIGHT) {
            drawFooter();
            pdf.addPage();
            page++;
            await drawHeader();
        }
    };

    // --- Table Drawing Helper Functions ---
    const tableHeaderHeight = 7;
    const tableRowVerticalPadding = 4;
    const cellFontSize = 8;
    const cellLineHeight = 3.5;
    const orderedColumnKeys = Object.keys(columnDefinitions) as ColumnKey[];

    const calculateColumnStyles = (category: CostCategory) => {
        const visibleKeys = orderedColumnKeys.filter(key => category.visibleColumns[key]);
        const styles: { [key: string]: { width: number, align: 'left' | 'right' | 'center' }} = {};
        
        const PREFERRED_WIDTH_RATIOS: Record<string, number> = {
            quantity: 0.10, unitPrice: 0.15, total: 0.15, vat: 0.12, markup: 0.12, unit: 0.08,
        };

        let fixedWidthUsed = 0;
        const dynamicCols: string[] = [];

        visibleKeys.forEach(key => {
            if (PREFERRED_WIDTH_RATIOS[key]) {
                const width = DRAW_WIDTH * PREFERRED_WIDTH_RATIOS[key];
                styles[key] = { width, align: 'right' };
                fixedWidthUsed += width;
            } else {
                dynamicCols.push(key);
            }
        });

        const remainingWidth = DRAW_WIDTH - fixedWidthUsed;
        if (dynamicCols.length > 0) {
            if (dynamicCols.includes('description')) {
                const otherDynamicCols = dynamicCols.filter(k => k !== 'description');
                const descriptionRatio = otherDynamicCols.length > 0 ? 0.6 : 1.0;
                const descriptionWidth = remainingWidth * descriptionRatio;
                styles['description'] = { width: descriptionWidth, align: 'left' };
                
                if(otherDynamicCols.length > 0) {
                    const otherColWidth = (remainingWidth - descriptionWidth) / otherDynamicCols.length;
                    otherDynamicCols.forEach(key => {
                        styles[key] = { width: otherColWidth, align: 'left' };
                    });
                }
            } else {
                const colWidth = remainingWidth / dynamicCols.length;
                dynamicCols.forEach(key => { styles[key] = { width: colWidth, align: 'left' }; });
            }
        }
        return styles;
    };
    
    const drawCategoryTitle = (category: CostCategory) => {
        pdf.setFontSize(10).setFont('helvetica', 'bold').setTextColor(51, 65, 85);
        pdf.setFillColor(241, 245, 249);
        pdf.rect(MARGIN, y, DRAW_WIDTH, 8, 'F');
        pdf.text(category.name, MARGIN + 2, y + 5.5);
        y += 10;
    };
    
    const drawSubcategoryTitle = (subcategory: Subcategory) => {
        pdf.setFontSize(9).setFont('helvetica', 'bold').setTextColor(71, 85, 105);
        pdf.text(subcategory.name, MARGIN, y);
        y += 5;
    };

    const drawColumnHeader = (category: CostCategory, colStyles: ReturnType<typeof calculateColumnStyles>) => {
        pdf.setFontSize(9).setFont('helvetica', 'bold').setFillColor(248, 250, 252);
        pdf.rect(MARGIN, y, DRAW_WIDTH, tableHeaderHeight, 'F');
        let currentX = MARGIN;
        const visibleColumns = orderedColumnKeys.filter(key => category.visibleColumns[key]);
        visibleColumns.forEach((key) => {
            const style = colStyles[key];
            if (!style) return;
            const { width, align } = style;
            const xPos = align === 'right' ? currentX + width - 2 : currentX + 2;
            pdf.text(columnDefinitions[key].label, xPos, y + 5, { align });
            currentX += width;
        });
        y += tableHeaderHeight;
    };

    // --- Main Document Generation ---
    await drawHeader();

    await checkAndAddPage(20);
    pdf.setDrawColor(226, 232, 240).line(MARGIN, y, A4_WIDTH - MARGIN, y);
    y += 5;
    pdf.setFontSize(8).setFont('helvetica', 'bold').setTextColor(100, 116, 139);
    pdf.text('CLIENTE', MARGIN, y);
    y += 5;
    pdf.setFontSize(10).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
    pdf.text(`${doc.client.prefix} ${doc.client.name}`, MARGIN, y);
    y += 5;
    pdf.setFontSize(9).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
    const clientAddressLines = pdf.splitTextToSize(doc.client.address.formattedAddress, DRAW_WIDTH);
    pdf.text(clientAddressLines, MARGIN, y);
    y += clientAddressLines.length * 4 + 5;
    pdf.line(MARGIN, y, A4_WIDTH - MARGIN, y);
    y += 8;

    await checkAndAddPage(15);
    pdf.setFontSize(12).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
    pdf.text(doc.title, MARGIN, y);
    y += 6;
    if (doc.description) {
        pdf.setFontSize(9).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
        const descLines = pdf.splitTextToSize(doc.description, DRAW_WIDTH);
        await checkAndAddPage(descLines.length * 4);
        pdf.text(descLines, MARGIN, y);
        y += descLines.length * 4 + 5;
    }

    // --- Categories and Items Loop with Pagination ---
    for (const category of doc.categories.filter(c => c.subcategories.some(s => s.items.length > 0))) {
        const colStyles = calculateColumnStyles(category);
        const visibleColumns = orderedColumnKeys.filter(key => category.visibleColumns[key]);
        const categoryRawSubtotal = category.subcategories.reduce((total, sub) => {
            return total + sub.items.reduce((subTotal, item) => {
                return subTotal + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
            }, 0);
        }, 0);

        await checkAndAddPage(12 + tableHeaderHeight + 10); // Space for category title, header, and one row
        drawCategoryTitle(category);

        for (const sub of category.subcategories) {
            if (sub.items.length === 0) continue;

            const hasSubcategoryTitle = category.subcategories.length > 1 || sub.name !== 'General';
            
            // Need space for subcat title (if any) + col headers
            await checkAndAddPage((hasSubcategoryTitle ? 7 : 0) + tableHeaderHeight);

            if (hasSubcategoryTitle) {
                drawSubcategoryTitle(sub);
            }
            drawColumnHeader(category, colStyles);
            
            for (const item of sub.items) {
                let maxLines = 1;
                visibleColumns.forEach(key => {
                    const style = colStyles[key];
                    if (!style) return;
                    const lines = pdf.splitTextToSize(String(item[key] || ''), style.width - 4);
                    if (lines.length > maxLines) maxLines = lines.length;
                });
                const rowHeight = maxLines * cellLineHeight + tableRowVerticalPadding;
                
                if (y + rowHeight > MARGIN + DRAW_HEIGHT) {
                    drawFooter();
                    pdf.addPage();
                    page++;
                    await drawHeader();
                    drawCategoryTitle(category);
                    if (hasSubcategoryTitle) {
                        drawSubcategoryTitle(sub);
                    }
                    drawColumnHeader(category, colStyles);
                }
                
                pdf.setFontSize(cellFontSize).setFont('helvetica', 'normal').setTextColor(0);
                pdf.setDrawColor(226, 232, 240).line(MARGIN, y + rowHeight, A4_WIDTH - MARGIN, y + rowHeight);
                let x = MARGIN;
                visibleColumns.forEach((key) => {
                    const style = colStyles[key];
                    if (!style) return;
                    const { width, align } = style;
                    const itemSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    let content: string;

                    if (key === 'total') {
                        content = formatCurrency(itemSubtotal, currencySymbol);
                    } else if (key === 'markup') {
                        let itemMarkup = 0;
                        if (category.markupType === 'percentage') {
                            itemMarkup = itemSubtotal * ((category.markupValue || 0) / 100);
                        } else if (category.markupType === 'fixed') {
                            if (categoryRawSubtotal > 0) {
                                itemMarkup = (itemSubtotal / categoryRawSubtotal) * (category.markupValue || 0);
                            }
                        }
                        content = formatCurrency(itemMarkup, currencySymbol);
                    } else if (key === 'vat') {
                        let itemMarkup = 0;
                        if (category.markupType === 'percentage') {
                            itemMarkup = itemSubtotal * ((category.markupValue || 0) / 100);
                        } else if (category.markupType === 'fixed') {
                            if (categoryRawSubtotal > 0) {
                                itemMarkup = (itemSubtotal / categoryRawSubtotal) * (category.markupValue || 0);
                            }
                        }
                        const vatOnItem = doc.showVat && category.applyVat ? (itemSubtotal + itemMarkup) * (doc.vatRate / 100) : 0;
                        content = formatCurrency(vatOnItem, currencySymbol);
                    } else if (columnDefinitions[key].dataType === 'number' && key === 'unitPrice') {
                        content = formatCurrency(Number(item[key]), currencySymbol);
                    } else {
                        content = String(item[key] ?? '');
                    }

                    const xPos = align === 'right' ? x + width - 2 : x + 2;
                    pdf.text(content, xPos, y + tableRowVerticalPadding, { align: align, maxWidth: width - 4 });
                    x += width;
                });
                y += rowHeight;
            }
        }

        // --- Draw Category Totals ---
        const currentCategoryRawSubtotal = category.subcategories.reduce((catAcc, sub) => {
            const subtotal = sub.items.reduce((subAcc, item) => subAcc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
            return catAcc + subtotal;
        }, 0);

        if (currentCategoryRawSubtotal > 0) {
            let categorySubtotalWithMarkups = currentCategoryRawSubtotal;
            if (category.markupType === 'percentage') {
                categorySubtotalWithMarkups += currentCategoryRawSubtotal * ((category.markupValue || 0) / 100);
            } else if (category.markupType === 'fixed') {
                categorySubtotalWithMarkups += (category.markupValue || 0);
            }

            const categoryVat = (doc.showVat && category.applyVat) ? categorySubtotalWithMarkups * (doc.vatRate / 100) : 0;
            const categoryTotalWithVat = categorySubtotalWithMarkups + categoryVat;
            
            const hasVatRow = doc.showVat && category.applyVat && categoryVat > 0;
            const categoryTotalsHeight = 12 + (hasVatRow ? 4 : 0);
            
            await checkAndAddPage(categoryTotalsHeight + 2);

            const categoryTotalsX = A4_WIDTH - MARGIN - 70;
            
            pdf.setFillColor(248, 250, 252);
            pdf.rect(MARGIN, y, DRAW_WIDTH, categoryTotalsHeight, 'F');
            y += 4;
            
            pdf.setFontSize(8).setFont('helvetica', 'normal');
            pdf.setTextColor(71, 85, 105); // slate-600
            pdf.text('Subtotal Categoría:', categoryTotalsX, y);
            pdf.setTextColor(51, 65, 85); // slate-700
            pdf.text(formatCurrency(categorySubtotalWithMarkups, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
            y += 4;

            if (hasVatRow) {
                pdf.setTextColor(71, 85, 105);
                pdf.text(`IVA (${doc.vatRate}%):`, categoryTotalsX, y);
                pdf.setTextColor(51, 65, 85);
                pdf.text(formatCurrency(categoryVat, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
                y += 4;
            }

            pdf.setLineWidth(0.2).setDrawColor(226, 232, 240);
            pdf.line(categoryTotalsX - 2, y, A4_WIDTH - MARGIN, y);
            y += 4;
            
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(30, 41, 59); // slate-800
            pdf.text('Total Categoría:', categoryTotalsX, y);
            pdf.text(formatCurrency(categoryTotalWithVat, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
            y += 4;
        }

        y += 8;
    }
    
    // --- Terms and Conditions ---
    const hasGeneralTerms = doc.termsAndConditions && doc.termsAndConditions.trim();
    const hasCouponTerms = doc.coupon.enabled && doc.coupon.terms.trim();
    const hasPaymentPlanTerms = doc.paymentPlan.enabled && doc.paymentPlan.customTerms.trim();
    const isPromissoryNote = doc.docType === 'Pagaré';
    const hasAnyTerms = hasGeneralTerms || hasCouponTerms || hasPaymentPlanTerms || isPromissoryNote;

    if (hasAnyTerms) {
        let neededHeight = 10;
        const countLines = (text: string) => pdf.splitTextToSize(text, DRAW_WIDTH).length;
        if(hasGeneralTerms) neededHeight += countLines(doc.termsAndConditions!) * 3.5 + 5;
        if(hasCouponTerms) neededHeight += countLines(doc.coupon.terms) * 3.5 + 9;
        if(hasPaymentPlanTerms) neededHeight += countLines(doc.paymentPlan.customTerms) * 3.5 + 9;
        if(isPromissoryNote) neededHeight += countLines("placeholder") * 3.5 + 9;

        await checkAndAddPage(neededHeight);

        y += 4;
        pdf.setFontSize(10).setFont('helvetica', 'bold').setTextColor(51, 65, 85);
        pdf.text('Términos y Condiciones', MARGIN, y);
        y += 5;

        const drawTermSection = (title: string, content: string) => {
            pdf.setFontSize(9).setFont('helvetica', 'bold').setTextColor(51, 65, 85);
            pdf.text(title, MARGIN, y);
            y += 4;
            pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
            const lines = pdf.splitTextToSize(content, DRAW_WIDTH);
            pdf.text(lines, MARGIN, y);
            y += lines.length * 3.5 + 5;
        };

        if (hasGeneralTerms) {
             pdf.setFontSize(8).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
             const lines = pdf.splitTextToSize(doc.termsAndConditions!, DRAW_WIDTH);
             pdf.text(lines, MARGIN, y);
             y += lines.length * 3.5 + 5;
        }
        if (hasCouponTerms) {
            drawTermSection("Términos del Cupón", doc.coupon.terms);
        }
        if (hasPaymentPlanTerms) {
            drawTermSection("Términos del Plan de Pagos", doc.paymentPlan.customTerms);
        }
        if (isPromissoryNote) {
            const promissoryTerms = (doc.promissoryNoteTerms || 'Debo y pagaré incondicionalmente por este pagaré a la orden de {companyName} en {companyAddress} la cantidad de {totalAmount}.')
                .replace('{companyName}', company.name)
                .replace('{companyAddress}', company.address.split(',').slice(2).join(',').trim())
                .replace('{totalAmount}', formatCurrency(totals.total, currencySymbol));
            drawTermSection("Condiciones del Pagaré", promissoryTerms);
        }
    }


    if (doc.coupon.enabled) {
        const couponHeight = 40 + (doc.coupon.image ? 30 : 0);
        await checkAndAddPage(couponHeight);

        const couponX = MARGIN + 10;
        const couponY = y;
        const couponWidth = DRAW_WIDTH - 20;
        const couponBoxHeight = doc.coupon.image ? 40 : 35;


        pdf.setLineDashPattern([3, 3], 0);
        pdf.setDrawColor(156, 163, 175); // slate-400
        pdf.rect(couponX, couponY, couponWidth, couponBoxHeight);
        pdf.setLineDashPattern([], 0);
        pdf.setDrawColor(0);

        let textX = couponX + 5;
        let textY = couponY + 10;
        
        if (doc.coupon.image) {
            try {
                const { data, format } = await getImageData(doc.coupon.image);
                const img = new Image(); img.src = data;
                const aspectRatio = img.width / img.height;
                const imgHeight = 24;
                const imgWidth = imgHeight * aspectRatio;
                pdf.addImage(data, format, textX, textY - 5, imgWidth, imgHeight);
                textX += imgWidth + 10;
            } catch (e) { console.error("Error loading coupon image:", e); }
        }

        pdf.setFontSize(11).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
        pdf.text(doc.coupon.title, textX, textY);
        textY += 8;
        
        pdf.setFontSize(14).setFont('helvetica', 'bold').setTextColor(220, 38, 38); // red-600
        pdf.text(doc.coupon.offerValue, textX, textY);
        textY += 8;

        pdf.setFontSize(7).setTextColor(100, 116, 139);
        const termsLines = pdf.splitTextToSize(doc.coupon.terms, couponWidth - (textX - couponX) - 5);
        pdf.text(termsLines, textX, textY);
        
        y += couponBoxHeight + 10;
    }

    const finalElementsHeight = 40 + (doc.includeSignature && company.signature ? 30 : 0) + (doc.advancePayment && doc.advancePayment > 0 ? 20 : 0);
    await checkAndAddPage(finalElementsHeight);

    const totalsX = A4_WIDTH - MARGIN - 70;
    pdf.setFontSize(10).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
    pdf.text('Subtotal:', totalsX, y);
    pdf.text(formatCurrency(totals.subtotal, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
    y += 6;
    if (doc.showVat && totals.tax > 0) {
        pdf.text(`IVA (${doc.vatRate}%):`, totalsX, y);
        pdf.text(formatCurrency(totals.tax, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
        y += 6;
    }
    pdf.setLineWidth(0.5).setDrawColor(23, 37, 84).line(totalsX - 2, y, A4_WIDTH - MARGIN, y);
    y += 6;
    pdf.setFontSize(12).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
    pdf.text('Total:', totalsX, y);
    pdf.text(formatCurrency(totals.total, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
    y += 6;
    
    if (doc.advancePayment && doc.advancePayment > 0) {
        pdf.setFontSize(10).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
        pdf.text('Anticipo:', totalsX, y);
        pdf.text(`-${formatCurrency(doc.advancePayment, currencySymbol)}`, A4_WIDTH - MARGIN, y, { align: 'right' });
        y += 6;

        pdf.setLineWidth(0.2).setDrawColor(51, 65, 85).line(totalsX - 2, y, A4_WIDTH - MARGIN, y);
        y += 6;

        pdf.setFontSize(12).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
        pdf.text('Restante:', totalsX, y);
        pdf.text(formatCurrency(totals.total - doc.advancePayment, currencySymbol), A4_WIDTH - MARGIN, y, { align: 'right' });
    }
    
    // FIX: Handle different signature modes (draw, upload, type) for PDF export.
    // The original code passed the entire SignatureData object to getImageData,
    // which expects a base64 string, causing a type error. The fix also adds
    // support for rendering typed signatures as text in the PDF.
    if (doc.includeSignature && company.signature) {
        const signature: SignatureData = company.signature;
        const sigY = A4_HEIGHT - MARGIN - FOOTER_HEIGHT - 25;
        const sigHeight = 16;
        
        if (signature.mode === 'draw' || signature.mode === 'upload') {
            try {
                const { data, format } = await getImageData(signature.data);
                const sigImg = new Image(); sigImg.src = data;
                const sigRatio = sigImg.width / sigImg.height;
                const sigWidth = sigHeight * sigRatio;
                
                pdf.addImage(data, format, MARGIN, sigY, sigWidth, sigHeight);
                pdf.setDrawColor(51, 65, 85).line(MARGIN, sigY + sigHeight + 2, MARGIN + 60, sigY + sigHeight + 2);
                pdf.setFontSize(9).setTextColor(23, 37, 84).text(doc.issuerName, MARGIN, sigY + sigHeight + 6);
                pdf.setFontSize(8).setTextColor(71, 85, 105).text(company.name, MARGIN, sigY + sigHeight + 10);
            } catch (e) { console.error("Error loading signature for PDF:", e); }
        } else if (signature.mode === 'type') {
            try {
                const fontFamily = signature.fontFamily || 'helvetica';
                
                // A simple mapping for jsPDF standard fonts, as custom fonts are not loaded.
                let pdfFont = 'helvetica';
                let pdfFontStyle: 'italic' | 'normal' = 'normal';
                if (fontFamily?.toLowerCase().includes('script') || fontFamily?.toLowerCase().includes('pacifico') || fontFamily?.toLowerCase().includes('caveat')) {
                    pdfFont = 'times';
                    pdfFontStyle = 'italic';
                }

                pdf.setFont(pdfFont, pdfFontStyle);
                pdf.setFontSize(22).setTextColor(23, 37, 84);
                // Adjust Y position for text to roughly align with where an image would be.
                pdf.text(signature.data, MARGIN, sigY + 12); 
                pdf.setFont('helvetica', 'normal'); // Reset font

                pdf.setDrawColor(51, 65, 85).line(MARGIN, sigY + sigHeight + 2, MARGIN + 60, sigY + sigHeight + 2);
                pdf.setFontSize(9).setTextColor(23, 37, 84).text(doc.issuerName, MARGIN, sigY + sigHeight + 6);
                pdf.setFontSize(8).setTextColor(71, 85, 105).text(company.name, MARGIN, sigY + sigHeight + 10);
            } catch (e) { console.error("Error rendering typed signature for PDF:", e); }
        }
    }

    drawFooter();

    if (doc.thirdPartyTickets.length > 0) {
        pdf.addPage();
        page++;
        await drawHeader();
        
        y = MARGIN + HEADER_HEIGHT + 5;
        
        pdf.setFontSize(14).setFont('helvetica', 'bold').setTextColor(23, 37, 84);
        pdf.text('Anexos: Tickets de Terceros', MARGIN, y);
        y += 10;

        for (const ticket of doc.thirdPartyTickets) {
            await checkAndAddPage(15); // for title
            pdf.setFontSize(11).setFont('helvetica', 'bold').setTextColor(51, 65, 85);
            pdf.text(ticket.title, MARGIN, y);
            y += 8;

            if (ticket.displayMode === 'image') {
                try {
                    const { data, format } = await getImageData(`data:${ticket.mimeType};base64,${ticket.imageData}`);
                    const img = new Image(); img.src = data;
                    const aspectRatio = img.width / img.height;
                    let imgWidth = DRAW_WIDTH / 2;
                    let imgHeight = imgWidth / aspectRatio;
                    
                    if (imgHeight > DRAW_HEIGHT / 2) {
                        imgHeight = DRAW_HEIGHT / 2;
                        imgWidth = imgHeight * aspectRatio;
                    }
                    
                    await checkAndAddPage(imgHeight + 5);
                    pdf.addImage(data, format, MARGIN, y, imgWidth, imgHeight);
                    y += imgHeight + 10;
                } catch (e) {
                    console.error("Error loading ticket image for PDF:", e);
                    await checkAndAddPage(10);
                    pdf.setFontSize(9).setTextColor(239, 68, 68); // red-500
                    pdf.text('[Error al cargar imagen del anexo]', MARGIN, y);
                    y += 10;
                }
            } else if (ticket.displayMode === 'interpret' && ticket.interpretedData) {
                const data = ticket.interpretedData;
                const TICKET_LINE_WIDTH = 40;

                const rightAlign = (label: string, value: string) => {
                    const padding = TICKET_LINE_WIDTH - label.length - value.length;
                    return label + ' '.repeat(Math.max(0, padding)) + value;
                }
                
                const lines: string[] = [];
                lines.push(`*** ${data.storeName} ***`);
                lines.push(``);
                lines.push(`Fecha: ${data.date}`);
                lines.push('-'.repeat(TICKET_LINE_WIDTH));
                data.items.forEach(item => {
                    const priceStr = formatCurrency(item.price, currencySymbol);
                    const desc = item.description.substring(0, TICKET_LINE_WIDTH - priceStr.length - 6);
                    const descPart = `${item.quantity} x ${desc}`;
                    lines.push(rightAlign(descPart, priceStr));
                });
                lines.push('-'.repeat(TICKET_LINE_WIDTH));
                lines.push(rightAlign('Subtotal:', formatCurrency(data.subtotal, currencySymbol)));
                if (data.tax > 0) {
                    lines.push(rightAlign('IVA:', formatCurrency(data.tax, currencySymbol)));
                }
                lines.push(rightAlign('TOTAL:', formatCurrency(data.total, currencySymbol)));

                await checkAndAddPage(lines.length * 4 + 10);
                
                pdf.setFillColor(248, 250, 252);
                const ticketBoxWidth = 85;
                pdf.rect(MARGIN, y, ticketBoxWidth, lines.length * 4 + 5, 'F');
                y += 5;

                pdf.setFontSize(8).setFont('courier', 'normal').setTextColor(51, 65, 85);
                lines.forEach(line => {
                    pdf.text(line, MARGIN + 2, y);
                    y += 4;
                });
                y += 10;
            }
        }
        drawFooter();
    }


    pdf.save(`${filename}.pdf`);
  }, [documentState, activeCompany, totals, columnDefinitions]);

  const handleExportToDoc = (filename: string) => {
      alert('La exportación a DOC estará disponible próximamente.');
  };
  
  if (!user) {
    return <Login onLogin={login} />;
  }

  return (
    <div className="bg-slate-100 min-h-screen">
      <Header
        user={user}
        onLogout={logout}
        setCurrentView={setCurrentView}
        companies={companies}
        activeCompany={activeCompany}
        setActiveCompanyId={setActiveCompanyId}
      />
      <main>
        <PanelToggleButton
          isCollapsed={isPanelCollapsed}
          onToggle={() => setIsPanelCollapsed(prev => !prev)}
        />
        <div 
            className="grid grid-cols-1 lg:grid max-w-screen-2xl mx-auto p-4 lg:p-8 gap-8"
            style={{ 
                gridTemplateColumns: isPanelCollapsed ? '0fr 1fr' : '1fr 1fr',
                transition: 'grid-template-columns 0.5s ease-in-out'
            }}
        >
            {/* Left Pane for dynamic content */}
            <div className="overflow-hidden">
                <div className="bg-slate-50 p-6 rounded-lg shadow-lg">
                    {currentView === 'editor' && (
                        <DocumentEditor
                            documentState={documentState}
                            setDocumentState={setDocumentState}
                            totals={totals}
                            company={activeCompany}
                            uploadedTicketHashes={uploadedTicketHashes}
                            setUploadedTicketHashes={setUploadedTicketHashes}
                            columnDefinitions={columnDefinitions}
                            setColumnDefinitions={setColumnDefinitions}
                            savedClients={savedClients}
                        />
                    )}
                    {currentView === 'profile' && (
                        <ProfilePage
                            savedDocuments={savedDocuments}
                            savedClients={savedClients}
                            setSavedClients={setSavedClients}
                            onLoadDocument={handleLoadDocument}
                            onDeleteDocument={handleDeleteDocument}
                            onSelectClient={handleSelectClientForNewDoc}
                            onNewDocument={handleNewDocument}
                            calculateTotals={calculateTotals}
                            currencySymbol={currencySymbol}
                        />
                    )}
                    {currentView === 'settings' && (
                        <SettingsPage
                            documentState={documentState}
                            setDocumentState={setDocumentState}
                            companies={companies}
                            setCompanies={setCompanies}
                            activeCompanyId={activeCompanyId}
                            setActiveCompanyId={setActiveCompanyId}
                            setCurrentView={setCurrentView}
                            columnDefinitions={columnDefinitions}
                            setColumnDefinitions={setColumnDefinitions}
                        />
                    )}
                </div>
            </div>

            {/* Right Pane for persistent preview */}
            <div className="relative">
                <div className="sticky top-8">
                    {currentView === 'editor' && (
                        <div className="flex justify-end gap-4 mb-4 no-print">
                            <button onClick={handleSaveDocument} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
                            <button onClick={() => forceUpdate(c => c + 1)} className="bg-slate-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-600 transition-colors">Actualizar</button>
                            <button onClick={() => setIsExportModalOpen(true)} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors">Exportar</button>
                            <button onClick={() => window.print()} className="bg-slate-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors">Imprimir</button>
                        </div>
                    )}
                    <div className="max-h-[calc(100vh-10rem)] overflow-y-auto">
                        <DocumentPreview
                            documentState={documentState}
                            totals={totals}
                            company={activeCompany}
                            columnDefinitions={columnDefinitions}
                        />
                    </div>
                </div>
            </div>
        </div>
      </main>
      <ExportModal 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        documentState={documentState}
        onExportToPdf={handleExportToPdf}
        onExportToDoc={handleExportToDoc}
      />
    </div>
  );
}

export default App;