import React from 'react';

interface LoginProps {
    onLogin: (provider: 'google' | 'facebook' | 'microsoft') => void;
}

// FIX: Changed JSX.Element to React.ReactNode to resolve namespace error.
const ProviderButton: React.FC<{ provider: 'google' | 'facebook' | 'microsoft'; onLogin: LoginProps['onLogin']; icon: React.ReactNode; label: string; className: string; }> = ({ provider, onLogin, icon, label, className }) => (
    <button
        type="button"
        onClick={() => onLogin(provider)}
        className={`w-full flex items-center justify-center gap-3 py-3 px-4 font-semibold rounded-lg shadow-md transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${className}`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 z-50 flex items-center justify-center backdrop-blur-sm no-print">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all animate-fade-in-up">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-slate-800">Bienvenido</h2>
                    <p className="mt-2 text-slate-600">Inicia sesión para guardar tus preferencias y documentos en la nube.</p>
                </div>

                <div className="mt-8 space-y-4">
                    <ProviderButton
                        provider="google"
                        onLogin={onLogin}
                        label="Continuar con Google"
                        className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400"
                        icon={<svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.99,36.621,44,30.886,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>}
                    />
                     <ProviderButton
                        provider="facebook"
                        onLogin={onLogin}
                        label="Continuar con Facebook"
                        className="bg-[#1877F2] text-white hover:bg-[#166fe5] focus:ring-[#1877F2]"
                        icon={<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"></path></svg>}
                    />
                     <ProviderButton
                        provider="microsoft"
                        onLogin={onLogin}
                        label="Continuar con Microsoft"
                        className="bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-400"
                        icon={<svg className="w-5 h-5" viewBox="0 0 21 21"><path fill="#f25022" d="M1 1h9v9H1z"></path><path fill="#00a4ef" d="M1 11h9v9H1z"></path><path fill="#7fba00" d="M11 1h9v9h-9z"></path><path fill="#ffb900" d="M11 11h9v9h-9z"></path></svg>}
                    />
                </div>
                
                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-500">
                        Al continuar, aceptas nuestros Términos de Servicio y Política de Privacidad.
                    </p>
                </div>
            </div>
            <style>{`
                @keyframes fade-in-up {
                    0% {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.4s ease-out forwards;
                }
            `}</style>
        </div>
    );
};