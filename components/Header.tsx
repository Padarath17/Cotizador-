import React, { useState, useRef, useEffect } from 'react';
import type { User, Company } from '../types';

interface HeaderProps {
    user: User | null;
    onLogout: () => void;
    setCurrentView: (view: 'editor' | 'profile' | 'settings') => void;
    companies: Company[];
    activeCompany: Company;
    setActiveCompanyId: (id: string) => void;
}

const CompanyDropdown: React.FC<Pick<HeaderProps, 'companies' | 'activeCompany' | 'setActiveCompanyId' | 'setCurrentView'>> = 
({ companies, activeCompany, setActiveCompanyId, setCurrentView }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="flex items-center gap-2 rounded-md bg-slate-100 hover:bg-slate-200 p-2 transition-colors text-sm font-semibold text-slate-700"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                <span className="hidden md:inline">{activeCompany.name}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
             {isOpen && (
                <div className="absolute left-0 lg:right-0 lg:left-auto mt-2 w-64 bg-white rounded-md shadow-lg py-1 z-20 ring-1 ring-black ring-opacity-5">
                    <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase">Cambiar de Empresa</div>
                    {companies.map(company => (
                        <button
                            key={company.id}
                            onClick={() => {
                                setActiveCompanyId(company.id);
                                setIsOpen(false);
                            }}
                            className="w-full text-left flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-opacity ${activeCompany.id === company.id ? 'text-blue-600 opacity-100' : 'opacity-0'}`}><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <span className={activeCompany.id === company.id ? 'font-bold' : 'font-normal'}>{company.name}</span>
                        </button>
                    ))}
                    <div className="border-t border-slate-100 my-1"></div>
                    <a 
                        href="#"
                        className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={(e) => {
                            e.preventDefault();
                            setCurrentView('settings');
                            setIsOpen(false);
                        }}
                    >
                        Gestionar Empresas...
                    </a>
                </div>
            )}
        </div>
    )
};


export const Header: React.FC<HeaderProps> = ({ user, onLogout, setCurrentView, companies, activeCompany, setActiveCompanyId }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on clicks outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

  return (
    <header className="bg-white shadow-md no-print">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-600 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            </div>
            <h1 className="text-3xl font-bold text-slate-800">
                Generador de Documentos
            </h1>
        </div>
         <div className="flex items-center gap-4">
            {activeCompany && (
              <CompanyDropdown
                companies={companies}
                activeCompany={activeCompany}
                setActiveCompanyId={setActiveCompanyId}
                setCurrentView={setCurrentView}
              />
            )}
            {user ? (
                <div className="relative" ref={dropdownRef}>
                    <button onClick={() => setDropdownOpen(!dropdownOpen)} className="flex items-center gap-3 rounded-full hover:bg-slate-100 p-1 pr-3 transition-colors">
                        <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
                        <span className="font-semibold text-sm text-slate-700 hidden sm:block">{user.name}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                    {dropdownOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20 ring-1 ring-black ring-opacity-5">
                            <a 
                                href="#" 
                                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentView('profile');
                                    setDropdownOpen(false);
                                }}
                            >
                                Mi Perfil
                            </a>
                            <a 
                                href="#"
                                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setCurrentView('settings');
                                    setDropdownOpen(false);
                                }}
                            >
                                Configuración
                            </a>
                            <div className="border-t border-slate-100 my-1"></div>
                            <button
                                onClick={() => {
                                    onLogout();
                                    setDropdownOpen(false);
                                }}
                                className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                                Cerrar Sesión
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <span className="text-sm font-medium text-slate-500">Inicia sesión para guardar</span>
            )}
        </div>
      </div>
    </header>
  );
};