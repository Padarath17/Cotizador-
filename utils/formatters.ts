export const formatCurrency = (amount: number, currencySymbol: string = '$'): string => {
  if (isNaN(amount)) {
    return `${currencySymbol}0.00`;
  }
  return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getJulianDate = (date: Date): string => {
    const start = new Date(date.getUTCFullYear(), 0, 0);
    // We use UTC methods to avoid timezone issues
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const year = date.getUTCFullYear().toString().slice(-2);
    return `${year}${dayOfYear.toString().padStart(3, '0')}`;
}

export const generateFolio = (prefix: string, sequence: number, date: Date): string => {
    const sequencePart = String(sequence).padStart(6, '0');
    const julianDate = getJulianDate(date);
    return `${prefix}${sequencePart}-${julianDate}`;
};