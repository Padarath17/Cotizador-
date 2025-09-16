import React, { useState, useRef, useEffect, useCallback } from 'react';

const useClickOutside = (ref: React.RefObject<HTMLElement>, handler: (event: MouseEvent | TouchEvent) => void) => {
    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            if (!ref.current || ref.current.contains(event.target as Node)) {
                return;
            }
            handler(event);
        };
        document.addEventListener("mousedown", listener);
        document.addEventListener("touchstart", listener);
        return () => {
            document.removeEventListener("mousedown", listener);
            document.removeEventListener("touchstart", listener);
        };
    }, [ref, handler]);
};

const formatDateForDisplay = (dateString: string): string => {
    if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
};

const formatDateForState = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};


interface DatePickerProps {
    value: string | undefined;
    onChange: (date: string) => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value = '', onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');

    const getInitialDate = useCallback(() => {
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day));
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    }, [value]);

    const [viewDate, setViewDate] = useState(getInitialDate());
    const [yearRangeStart, setYearRangeStart] = useState(getInitialDate().getFullYear() - 5);
    const [inputValue, setInputValue] = useState(formatDateForDisplay(value));
    const containerRef = useRef<HTMLDivElement>(null);

    useClickOutside(containerRef, () => {
        setIsOpen(false);
        setViewMode('days');
    });

    useEffect(() => {
        setInputValue(formatDateForDisplay(value));
    }, [value]);

    const handleOpen = () => {
        if (!isOpen) {
            const initialDate = getInitialDate();
            setViewDate(initialDate);
            setYearRangeStart(initialDate.getFullYear() - 5);
            setViewMode('days');
        }
        setIsOpen(true);
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
        const match = inputValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (match) {
            const day = parseInt(match[1], 10);
            const monthVal = parseInt(match[2], 10);
            const yearVal = parseInt(match[3], 10);
            
            if (monthVal > 0 && monthVal <= 12 && day > 0 && day <= 31) {
                const date = new Date(Date.UTC(yearVal, monthVal - 1, day));
                if (!isNaN(date.getTime()) && date.getUTCDate() === day) {
                    onChange(formatDateForState(date));
                    return;
                }
            }
        }
        
        if (inputValue === '') {
            onChange('');
        } else {
             setInputValue(formatDateForDisplay(value));
        }
    };
    
    const handlePrev = () => {
        if (viewMode === 'days') {
            setViewDate(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)));
        } else if (viewMode === 'months') {
            setViewDate(prev => new Date(Date.UTC(prev.getUTCFullYear() - 1, prev.getUTCMonth(), 1)));
        } else if (viewMode === 'years') {
            setYearRangeStart(prev => prev - 12);
        }
    };

    const handleNext = () => {
        if (viewMode === 'days') {
            setViewDate(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)));
        } else if (viewMode === 'months') {
            setViewDate(prev => new Date(Date.UTC(prev.getUTCFullYear() + 1, prev.getUTCMonth(), 1)));
        } else if (viewMode === 'years') {
            setYearRangeStart(prev => prev + 12);
        }
    };

    const handleDateSelect = (day: number) => {
        const selected = new Date(Date.UTC(viewDate.getUTCFullYear(), viewDate.getUTCMonth(), day));
        onChange(formatDateForState(selected));
        setIsOpen(false);
    };
    
    const handleMonthSelect = (monthIndex: number) => {
        setViewDate(new Date(Date.UTC(viewDate.getUTCFullYear(), monthIndex, 1)));
        setViewMode('days');
    };

    const handleYearSelect = (selectedYear: number) => {
        setViewDate(new Date(Date.UTC(selectedYear, viewDate.getUTCMonth(), 1)));
        setViewMode('months');
    };
    
    const renderDays = () => {
        const year = viewDate.getUTCFullYear();
        const month = viewDate.getUTCMonth();
        const firstDayOfMonth = new Date(Date.UTC(year, month, 1)).getUTCDay();
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const selectedDate = value ? new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))) : null;
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const daysOfWeek = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

        return (
             <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
                {daysOfWeek.map((day, index) => <div key={index} className="font-medium">{day}</div>)}
                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const currentDate = new Date(Date.UTC(year, month, day));
                    const isSelected = selectedDate && currentDate.getTime() === selectedDate.getTime();
                    const isToday = currentDate.getTime() === today.getTime();
                    
                    return (
                        <button
                            type="button"
                            key={day}
                            onClick={() => handleDateSelect(day)}
                            className={`p-1.5 rounded-full text-sm transition-colors ${isSelected ? 'bg-blue-600 text-white font-semibold' : !isSelected && isToday ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100 text-slate-700'}`}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
        );
    };
    
    const renderMonths = () => {
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const currentMonth = getInitialDate().getMonth();
        const currentYear = getInitialDate().getFullYear();

        return (
            <div className="grid grid-cols-3 gap-2">
                {monthNames.map((month, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => handleMonthSelect(index)}
                        className={`p-2 rounded-lg text-sm transition-colors hover:bg-slate-100 ${index === currentMonth && viewDate.getFullYear() === currentYear ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700'}`}
                    >
                        {month}
                    </button>
                ))}
            </div>
        );
    };

    const renderYears = () => {
        const years = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);
        const currentYear = getInitialDate().getFullYear();

        return (
             <div className="grid grid-cols-3 gap-2">
                {years.map(year => (
                    <button
                        key={year}
                        type="button"
                        onClick={() => handleYearSelect(year)}
                        className={`p-2 rounded-lg text-sm transition-colors hover:bg-slate-100 ${year === currentYear ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700'}`}
                    >
                        {year}
                    </button>
                ))}
            </div>
        );
    };
    
    const monthNamesFull = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    return (
        <div className="relative" ref={containerRef}>
            <div className="relative">
                 <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    onFocus={handleOpen}
                    placeholder="dd/mm/aaaa"
                    className="block w-full text-sm text-slate-900 bg-white rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-10"
                />
                <button type="button" onClick={() => setIsOpen(!isOpen)} className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                </button>
            </div>
            {isOpen && (
                <div className="absolute z-10 mt-1 w-72 bg-white border border-slate-300 rounded-lg shadow-lg p-2">
                    <div className="flex justify-between items-center mb-2">
                        <button type="button" onClick={handlePrev} className="p-1 rounded-full hover:bg-slate-100">
                             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <div className="flex-grow text-center">
                            {viewMode === 'days' && <button type="button" onClick={() => setViewMode('months')} className="font-semibold text-sm text-slate-700 hover:bg-slate-100 rounded px-2 py-1">{monthNamesFull[viewDate.getUTCMonth()]} {viewDate.getUTCFullYear()}</button>}
                            {viewMode === 'months' && <button type="button" onClick={() => setViewMode('years')} className="font-semibold text-sm text-slate-700 hover:bg-slate-100 rounded px-2 py-1">{viewDate.getUTCFullYear()}</button>}
                            {viewMode === 'years' && <span className="font-semibold text-sm text-slate-700 px-2 py-1">{yearRangeStart} - {yearRangeStart + 11}</span>}
                        </div>
                        <button type="button" onClick={handleNext} className="p-1 rounded-full hover:bg-slate-100">
                           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                    {viewMode === 'days' && renderDays()}
                    {viewMode === 'months' && renderMonths()}
                    {viewMode === 'years' && renderYears()}
                </div>
            )}
        </div>
    );
};
