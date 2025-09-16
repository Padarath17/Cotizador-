import React, { useMemo } from 'react';
import type { DocumentState, Totals, Company, ColumnKey, ColumnDefinition, Item, PaymentPlanConfig, CostCategory, InterpretedTicketData, SignatureData } from '../types';
import { CURRENCIES } from '../constants';
import { formatCurrency } from '../utils/formatters';

interface DocumentPreviewProps {
  documentState: DocumentState;
  totals: Totals;
  company: Company;
  columnDefinitions: Record<string, ColumnDefinition>;
}

const calculatePaymentOptions = (total: number, config: PaymentPlanConfig) => {
    if (!config.enabled || config.terms.length === 0) return [];
    
    const balance = total - config.downPayment;
    if (balance <= 0) return [];

    const options = config.terms.map((term, index) => {
        const annualInterestRate = config.baseInterestRate + config.riskFactor + (term * config.termIncrementRate / 12); // Example logic
        if (term === 0) return null;

        const monthlyRate = (annualInterestRate / 100) / 12;

        if (monthlyRate === 0) {
            const monthlyPayment = balance / term;
            return {
                term,
                monthlyPayment,
                totalPayment: balance,
            };
        }
        
        const monthlyPayment = balance * (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
        const totalPayment = monthlyPayment * term;

        return {
            term,
            monthlyPayment,
            totalPayment,
        };
    }).filter((opt): opt is NonNullable<typeof opt> => opt !== null);

    return options;
};

const GenericClientIcon: React.FC<{ type: DocumentState['client']['genericLogo'], className?: string }> = ({ type, className = "w-full h-full text-slate-400" }) => {
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

const formatInterpretedTicket = (data: InterpretedTicketData, currencySymbol: string): string => {
    let output = `*** ${data.storeName} ***\n\n`;
    output += `Fecha: ${data.date}\n`;
    output += `----------------------------------------\n`;
    data.items.forEach(item => {
        const priceStr = formatCurrency(item.price, currencySymbol).padStart(10, ' ');
        // Limit description length to avoid breaking layout
        const description = item.description.length > 25 ? item.description.substring(0, 22) + '...' : item.description;
        const line = `${item.quantity} x ${description.padEnd(25)}`;
        output += `${line} ${priceStr}\n`;
    });
    output += `----------------------------------------\n`;
    output += `Subtotal:${formatCurrency(data.subtotal, currencySymbol).padStart(29)}\n`;
    if (data.tax > 0) {
      output += `IVA:${formatCurrency(data.tax, currencySymbol).padStart(34)}\n`;
    }
    output += `TOTAL:${formatCurrency(data.total, currencySymbol).padStart(32)}\n`;
    return output;
};

const SignatureDisplay: React.FC<{ signature: SignatureData }> = ({ signature }) => {
    const { mode, data, fontFamily, signedBy, signedAt } = signature;

    const signatureElement = () => {
        if (mode === 'type') {
            return <span className="block" style={{ fontFamily, fontSize: '2.5rem', lineHeight: '1' }}>{data}</span>;
        }
        return <img src={data} alt="Firma" className="max-h-20 mx-auto" />;
    };

    return (
        <div className="text-center">
            <div className="h-24 flex items-center justify-center mb-1">
                {signatureElement()}
            </div>
            <p className="border-t w-56 mx-auto text-center pt-1 text-slate-700 font-semibold text-sm">
                {signedBy || 'Firmado'}
            </p>
            {signedAt && (
                 <p className="text-xs text-slate-500">
                    {new Date(signedAt).toLocaleDateString()}
                </p>
            )}
        </div>
    );
};

const getStatusStampInfo = (status: DocumentState['status']) => {
    switch (status) {
        case 'Pagada':
            return { text: 'PAGADO', color: 'green' };
        case 'Aceptada':
            return { text: 'ACEPTADO', color: 'green' };
        case 'Rechazada':
            return { text: 'RECHAZADO', color: 'red' };
        case 'Vigente':
            return { text: 'VIGENTE', color: 'blue' };
        case 'Con Garantía':
            return { text: 'CON GARANTÍA', color: 'indigo' };
        case 'Pendiente':
        default:
            return { text: 'PENDIENTE', color: 'gray' };
    }
};

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({ documentState, totals, company, columnDefinitions }) => {
    const {
        title, docType, docNumber, date, validityStartDate, validityEndDate, client, categories, showVat, vatRate, currency, issuerName, paymentPlan, includeSignature, clientSignature, previewFormat, layout, coupon, thirdPartyTickets, termsAndConditions, status
    } = documentState;

    const currencySymbol = useMemo(() => CURRENCIES[currency]?.symbol || '$', [currency]);
    const orderedColumnKeys = useMemo(() => Object.keys(columnDefinitions) as ColumnKey[], [columnDefinitions]);
    const paymentOptions = useMemo(() => calculatePaymentOptions(totals.total, paymentPlan), [totals.total, paymentPlan]);
    const stampInfo = useMemo(() => getStatusStampInfo(status), [status]);

    const calculateCategoryTotal = (category: CostCategory) => {
        let categoryRawSubtotal = 0;
        category.subcategories.forEach(sub => {
            sub.items.forEach(item => {
                categoryRawSubtotal += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
            });
        });

        let categoryTotalWithMarkups = categoryRawSubtotal;
        if (category.markupType === 'percentage') {
            categoryTotalWithMarkups += categoryRawSubtotal * ((category.markupValue || 0) / 100);
        } else if (category.markupType === 'fixed') {
            categoryTotalWithMarkups += (category.markupValue || 0);
        }
        
        return categoryTotalWithMarkups;
    };

    const getPreviewFormatClass = () => {
        switch (previewFormat) {
            case 'Ticket': return 'format-ticket';
            case 'HalfLetterVertical': return 'format-half-letter-vertical';
            case 'HalfLetterHorizontal': return 'format-half-letter-horizontal';
            case 'Letter':
            default: return 'format-letter';
        }
    }
    
    return (
        <>
            <div id="document-preview-content" className={`document-preview ${getPreviewFormatClass()} text-sm`}>
                <header className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        {company.logo && <img src={company.logo} alt={`${company.name} logo`} className="h-16 w-auto" />}
                        <div>
                            <h2 className="font-bold text-lg text-slate-800">{company.name}</h2>
                            <p className="text-slate-600 whitespace-pre-line">{company.address}</p>
                            <p className="text-slate-600">{company.phone} | {company.email}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <h1 className="font-bold text-xl uppercase text-blue-700">{docType}</h1>
                        <p className="font-mono font-bold text-red-800">{docNumber}</p>
                        <p className="text-slate-700"><strong>Fecha:</strong> {new Date(date).toLocaleDateString()}</p>
                        {validityStartDate && validityEndDate && (
                            <p className="text-slate-700"><strong>Vigencia:</strong> Del {new Date(validityStartDate).toLocaleDateString()} al {new Date(validityEndDate).toLocaleDateString()}</p>
                        )}
                    </div>
                </header>

                <section className="border-y">
                    <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Cliente</h3>
                    <div className="flex items-start gap-4">
                        {(client.logo || client.genericLogo !== 'none') && (
                            <div className="w-16 h-16 flex-shrink-0 bg-slate-100 rounded-lg p-1 flex items-center justify-center">
                                {client.logo ? <img src={client.logo} alt="Client Logo" className="max-w-full max-h-full object-contain"/> : <GenericClientIcon type={client.genericLogo} />}
                            </div>
                        )}
                        <div>
                            <p className="font-bold text-slate-800">{client.prefix} {client.name}</p>
                            <p className="text-slate-600 whitespace-pre-line">{client.address.formattedAddress}</p>
                        </div>
                    </div>
                </section>
                
                <section>
                    <h2 className="font-bold text-lg text-slate-800 mb-2">{title}</h2>
                    {documentState.description && <p className="text-slate-600 mb-4">{documentState.description}</p>}
                    
                    {categories.filter(c => c.subcategories.some(s => s.items.length > 0)).map(category => {
                        const categoryRawSubtotal = category.subcategories.reduce((catAcc, sub) => {
                            return catAcc + sub.items.reduce((subAcc, item) => subAcc + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
                        }, 0);
                        const categorySubtotal = calculateCategoryTotal(category);
                        const categoryVat = (showVat && category.applyVat) ? categorySubtotal * (vatRate / 100) : 0;
                        const categoryTotalWithVat = categorySubtotal + categoryVat;
                        const visibleColumns = orderedColumnKeys.filter(key => category.visibleColumns[key]);
                        
                        return (
                            <div key={category.id} className="mb-6">
                                <h3 className="font-bold text-md text-slate-700 bg-slate-100 p-2 rounded-t-md">{category.name}</h3>
                                <div>
                                    <table className="w-full text-left items-table">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                {visibleColumns.map(key => (
                                                    <th key={key} className="p-2 font-semibold">{columnDefinitions[key].label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {category.subcategories.filter(sub => sub.items.length > 0).map(sub => (
                                                <React.Fragment key={sub.id}>
                                                    {(category.subcategories.length > 1 || sub.name !== 'General') && (
                                                        <tr className="bg-slate-100">
                                                            <td colSpan={visibleColumns.length} className="p-2 font-bold text-slate-800 text-[13px]">
                                                                {sub.name}
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {sub.items.map((item: Item) => (
                                                        <tr key={item.id}>
                                                            {visibleColumns.map(key => {
                                                                let content;
                                                                const itemSubtotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);

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
                                                                    const vatOnItem = showVat && category.applyVat ? (itemSubtotal + itemMarkup) * (vatRate / 100) : 0;
                                                                    content = formatCurrency(vatOnItem, currencySymbol);
                                                                } else {
                                                                    const value = item[key];
                                                                    const isCurrencyColumn = ['unitPrice'].includes(key);
                                                                    if (columnDefinitions[key].dataType === 'number' && isCurrencyColumn) {
                                                                        content = formatCurrency(Number(value), currencySymbol);
                                                                    } else if (columnDefinitions[key].dataType === 'number') {
                                                                        content = Number(value).toLocaleString('en-US');
                                                                    } else {
                                                                        content = String(value ?? '');
                                                                    }
                                                                }
                                                                return <td key={key} className="p-2 align-top">{content}</td>;
                                                            })}
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-end p-2 bg-slate-50 border-t border-slate-200 rounded-b-md">
                                    <div className="w-full max-w-xs text-[11px]">
                                        <table className="w-full">
                                            <tbody>
                                                <tr>
                                                    <td className="py-0.5 pr-4 font-normal text-slate-600">Subtotal Categoría:</td>
                                                    <td className="py-0.5 text-right font-normal text-slate-700">{formatCurrency(categorySubtotal, currencySymbol)}</td>
                                                </tr>
                                                {showVat && category.applyVat && categoryVat > 0 && (
                                                    <tr>
                                                        <td className="py-0.5 pr-4 font-normal text-slate-600">IVA ({vatRate}%):</td>
                                                        <td className="py-0.5 text-right font-normal text-slate-700">{formatCurrency(categoryVat, currencySymbol)}</td>
                                                    </tr>
                                                )}
                                                {(showVat && category.applyVat && categoryVat > 0) || categorySubtotal > 0 ? (
                                                     <tr className="border-t">
                                                        <td className="pt-1 pr-4 font-normal text-slate-800">Total Categoría:</td>
                                                        <td className="pt-1 text-right font-normal text-slate-800">{formatCurrency(categoryTotalWithVat, currencySymbol)}</td>
                                                    </tr>
                                                ) : null}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </section>
                
                {(termsAndConditions || coupon.enabled || paymentPlan.enabled || docType === 'Pagaré') && (
                    <section className="mt-6 pt-4 border-t">
                        <h3 className="font-bold text-slate-700 mb-2">Términos y Condiciones</h3>
                        {termsAndConditions && (
                            <div className="mb-4">
                                <p className="text-xs text-slate-600 whitespace-pre-line">{termsAndConditions}</p>
                            </div>
                        )}
                        {coupon.enabled && coupon.terms && (
                            <div className="mb-4">
                                <h4 className="font-semibold text-sm text-slate-700 mb-1">Términos del Cupón</h4>
                                <p className="text-xs text-slate-600 whitespace-pre-line">{coupon.terms}</p>
                            </div>
                        )}
                        {paymentPlan.enabled && paymentPlan.customTerms && (
                            <div className="mb-4">
                                <h4 className="font-semibold text-sm text-slate-700 mb-1">Términos del Plan de Pagos</h4>
                                <p className="text-xs text-slate-600 whitespace-pre-line">{paymentPlan.customTerms}</p>
                            </div>
                        )}
                        {docType === 'Pagaré' && (
                            <div className="mb-4">
                                <h4 className="font-semibold text-sm text-slate-700 mb-1">Condiciones del Pagaré</h4>
                                <p className="text-xs text-slate-600 whitespace-pre-line">{
                                    (documentState.promissoryNoteTerms || 'Debo y pagaré incondicionalmente por este pagaré a la orden de {companyName} en {companyAddress} la cantidad de {totalAmount}.')
                                    .replace('{companyName}', company.name)
                                    .replace('{companyAddress}', company.address.split(',').slice(2).join(',').trim())
                                    .replace('{totalAmount}', formatCurrency(totals.total, currencySymbol))
                                }</p>
                            </div>
                        )}
                    </section>
                )}

                <footer className="mt-auto">
                    {coupon.enabled && (
                        <div className="mb-6">
                            {(() => {
                                const { terms, validityStartDate: couponStart, validityEndDate: couponEnd } = coupon;
                                let validityText = '';
                                if (couponStart && couponEnd) {
                                    validityText = `Válido del ${new Date(couponStart).toLocaleDateString()} al ${new Date(couponEnd).toLocaleDateString()}. `;
                                }
                                return (
                                    <div className="border-2 border-dashed border-slate-400 p-4 rounded-lg flex items-center gap-4">
                                        {coupon.image && <img src={coupon.image} alt="Imagen del cupón" className="w-24 h-24 object-contain flex-shrink-0" />}
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800">{coupon.title}</h4>
                                            <p className="text-2xl font-bold text-red-600 my-1">{coupon.offerValue}</p>
                                            <p className="text-xs text-slate-500 whitespace-pre-line">{validityText}{terms}</p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {paymentPlan.enabled && paymentOptions.length > 0 && (
                        <div className="my-8">
                            <h3 className="font-bold text-md text-slate-700 mb-2">Plan de Pagos Sugerido</h3>
                             <p className="text-sm text-slate-600 mb-2">Monto a financiar: {formatCurrency(totals.total - paymentPlan.downPayment, currencySymbol)} (Total - Enganche)</p>
                             <table className="w-full text-left items-table">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="p-2 font-semibold">Plazo</th>
                                        <th className="p-2 font-semibold">Pago Mensual</th>
                                        <th className="p-2 font-semibold">Pago Total (Financiado)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {paymentOptions.map(opt => (
                                        <tr key={opt.term}>
                                            <td className="p-2">{opt.term} meses</td>
                                            <td className="p-2 font-medium">{formatCurrency(opt.monthlyPayment, currencySymbol)}</td>
                                            <td className="p-2">{formatCurrency(opt.totalPayment, currencySymbol)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    <div className="flex justify-between items-end gap-8 pt-6 mt-6 border-t">
                        <div className="flex-grow">
                            <div className={`status-stamp stamp-${stampInfo.color}`}>
                                <span>{stampInfo.text}</span>
                                <span className="stamp-date">{new Date(date).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div className="w-full max-w-xs text-base flex-shrink-0">
                             <table className="w-full">
                                <tbody>
                                    <tr>
                                        <td className="py-1 pr-4 font-semibold text-slate-600">Subtotal:</td>
                                        <td className="py-1 text-right font-medium text-slate-800">{formatCurrency(totals.subtotal, currencySymbol)}</td>
                                    </tr>
                                    {showVat && totals.tax > 0 && (
                                        <tr>
                                            <td className="py-1 pr-4 font-semibold text-slate-600">IVA ({vatRate}%):</td>
                                            <td className="py-1 text-right font-medium text-slate-800">{formatCurrency(totals.tax, currencySymbol)}</td>
                                        </tr>
                                    )}
                                    <tr className="border-t-2 border-slate-800">
                                        <td className="pt-2 pr-4 font-bold text-lg text-slate-800">Total:</td>
                                        <td className="pt-2 text-right font-bold text-lg text-slate-800">{formatCurrency(totals.total, currencySymbol)}</td>
                                    </tr>
                                    {documentState.advancePayment && documentState.advancePayment > 0 && (
                                        <>
                                            <tr>
                                                <td className="py-1 pr-4 font-semibold text-slate-600">Anticipo:</td>
                                                <td className="py-1 text-right font-medium text-slate-800">-{formatCurrency(documentState.advancePayment, currencySymbol)}</td>
                                            </tr>
                                            <tr className="border-t-2 border-slate-400">
                                                <td className="pt-2 pr-4 font-bold text-lg text-slate-800">Restante:</td>
                                                <td className="pt-2 text-right font-bold text-lg text-slate-800">{formatCurrency(totals.total - documentState.advancePayment, currencySymbol)}</td>
                                            </tr>
                                        </>
                                    )}
                                </tbody>
                             </table>
                        </div>
                    </div>

                    <div className="flex justify-between items-end pt-8 mt-8">
                        <div className="flex-grow">
                             {includeSignature && company.signature && (
                                <SignatureDisplay signature={{...company.signature, signedBy: company.signature.signedBy || issuerName}}/>
                            )}
                        </div>
                         <div className="flex-grow">
                             {clientSignature && (
                                 <SignatureDisplay signature={clientSignature} />
                             )}
                        </div>
                    </div>

                    <div className="flex justify-between items-end pt-4 mt-4">
                         <div className="text-slate-500 text-xs pb-1">
                            <p>{layout.footerContent.replace('{page}', '').trim()}</p>
                        </div>
                        <div className="text-slate-500 text-xs">
                            {layout.pageNumbering !== 'none' && <p>Página 1</p>}
                        </div>
                    </div>
                </footer>

                {thirdPartyTickets.length > 0 && (
                    <section className="mt-8 pt-8 border-t-2 border-dashed">
                        <h2 className="font-bold text-lg text-slate-800 mb-4">Anexos: Tickets de Terceros</h2>
                        <div className="space-y-6">
                            {thirdPartyTickets.map(ticket => (
                                <div key={ticket.id}>
                                    <h3 className="font-semibold text-md text-slate-700 mb-2">{ticket.title}</h3>
                                    {ticket.displayMode === 'image' ? (
                                        <img 
                                            src={`data:${ticket.mimeType};base64,${ticket.imageData}`} 
                                            alt={ticket.title} 
                                            className="max-w-md w-full rounded-lg border shadow-sm"
                                        />
                                    ) : (
                                        <div className="border p-4 rounded-lg bg-white max-w-md w-full shadow-sm">
                                            {ticket.isProcessing ? (
                                                <p className="text-slate-500">Procesando con IA...</p>
                                            ) : ticket.interpretedData ? (
                                                <pre className="ticket-format text-xs">
                                                    {formatInterpretedTicket(ticket.interpretedData, currencySymbol)}
                                                </pre>
                                            ) : (
                                                <p className="text-red-500">La interpretación no está disponible. Intenta procesarlo de nuevo desde el editor.</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

            </div>
            <style>{`
                .document-preview {
                    background-color: white;
                    color: #334155;
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
                }
                .document-preview > header,
                .document-preview > section,
                .document-preview > footer {
                    padding: 5mm;
                }
                .document-preview .items-table {
                    font-size: 11px;
                    color: black;
                    width: 100%;
                    table-layout: fixed;
                }
                .document-preview .items-table th,
                .document-preview .items-table td {
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                .format-letter {
                    width: 8.5in;
                    min-height: 11in;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    margin: auto;
                    display: flex;
                    flex-direction: column;
                }
                .status-stamp {
                    border: 4px double;
                    border-radius: 8px;
                    padding: 8px 24px;
                    display: inline-flex;
                    flex-direction: column;
                    align-items: center;
                    font-size: 1.75rem;
                    line-height: 1.2;
                    font-weight: 700;
                    text-transform: uppercase;
                    transform: rotate(-12deg);
                    opacity: 0.75;
                    margin-left: 2rem;
                    text-align: center;
                }
                .status-stamp .stamp-date {
                    font-size: 0.75rem;
                    font-weight: 600;
                    margin-top: 4px;
                    border-top: 1px solid;
                    padding-top: 4px;
                    width: 100%;
                }
                .stamp-green { color: #16a34a; border-color: #16a34a; }
                .stamp-red { color: #dc2626; border-color: #dc2626; }
                .stamp-blue { color: #2563eb; border-color: #2563eb; }
                .stamp-indigo { color: #4f46e5; border-color: #4f46e5; }
                .stamp-gray { color: #64748b; border-color: #64748b; }
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  .document-preview, .document-preview * {
                    visibility: visible;
                  }
                  .document-preview {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: auto;
                    min-height: 0;
                    box-shadow: none;
                    margin: 0;
                    border: none;
                  }
                  .no-print {
                      display: none !important;
                  }
                }
            `}</style>
        </>
    );
};