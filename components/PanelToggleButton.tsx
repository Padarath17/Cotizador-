import React from 'react';

interface PanelToggleButtonProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export const PanelToggleButton: React.FC<PanelToggleButtonProps> = ({ isCollapsed, onToggle }) => {
    // Determine the button's horizontal position based on the panel state.
    // When collapsed, it sits at the very edge of the screen.
    // When expanded, it sits at the halfway point (on large screens).
    // The 'left-1/2' and '-ml-4' combination centers the button on the dividing line.
    const positionClasses = isCollapsed ? 'left-0' : 'left-1/2 -ml-4';

    return (
        <div className={`hidden lg:block fixed top-1/2 z-30 transition-all duration-500 ease-in-out ${positionClasses}`}>
            <button
                onClick={onToggle}
                className="w-8 h-16 bg-white border-y border-r border-slate-300 rounded-r-full shadow-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label={isCollapsed ? 'Expandir panel de edición' : 'Colapsar panel de edición'}
            >
                {isCollapsed ? (
                    <svg xmlns="http://www.w.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                )}
            </button>
        </div>
    );
};
