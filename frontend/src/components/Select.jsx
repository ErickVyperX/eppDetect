import React, { useState, useEffect, useRef } from 'react';
import { Filter, ChevronDown, Check, X } from 'lucide-react';

const DEFAULT_VIOLATION_COLORS = {
  all: 'bg-slate-400',
  sin_casco: 'bg-red-500',
  sin_chaleco: 'bg-amber-500',
  sin_guantes: 'bg-purple-500',
};

/**
 * Componente interactivo y accesible de selección desplegable (Custom Select / Popover).
 * Sigue los patrones de diseño, sombras, bordes y accesibilidad (WCAG 2.2 AA) de DatePicker.jsx.
 */
export default function Select({
  value = 'all',
  onChange,
  options = [],
  icon: Icon = Filter,
  ariaLabel = 'Filtrar por opción',
  className = '',
  placeholder = 'Seleccionar...'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const listboxRef = useRef(null);

  // Encontrar la opción seleccionada actualmente
  const selectedOption = options.find((opt) => opt.value === value);

  // Manejo de eventos de clic fuera y tecla Escape para accesibilidad WCAG
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Enfocar la opción seleccionada (o la primera) cuando se abre el popover
  useEffect(() => {
    if (isOpen && listboxRef.current) {
      const selected = listboxRef.current.querySelector('[aria-selected="true"]');
      if (selected) {
        selected.focus();
      } else {
        const first = listboxRef.current.querySelector('[role="option"]');
        first?.focus();
      }
    }
  }, [isOpen]);

  const handleSelect = (val) => {
    onChange?.(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('all');
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Navegación con teclado en el listbox
  const handleOptionKeyDown = (e, index) => {
    const items = listboxRef.current?.querySelectorAll('[role="option"]');
    if (!items || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
    }
  };

  const showClearButton = Boolean(value && value !== 'all');
  const displayLabel = selectedOption ? selectedOption.label : (value || placeholder);

  return (
    <div ref={containerRef} className={`relative inline-block text-xs ${className}`}>
      {/* Contenedor del disparador idéntico a DatePicker */}
      <div className="flex items-center bg-slate-950 rounded-xl border border-slate-700 hover:border-slate-600 focus-within:ring-1 focus-within:ring-orange-500 transition-colors text-xs">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={selectedOption ? `${ariaLabel}, seleccionado: ${selectedOption.label}` : ariaLabel}
          className="flex items-center space-x-2 px-3 py-1.5 text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-xl cursor-pointer"
        >
          {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />}
          <span className="text-slate-100 font-medium truncate">
            {displayLabel}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-orange-400' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {/* Botón rápido de limpiar filtro cuando es distinto de 'all' */}
        {showClearButton && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Restablecer filtro a todas las infracciones"
            className="pr-2.5 pl-1 text-slate-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 rounded transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Popover desplegable flotante con las opciones */}
      {isOpen && (
        <div
          ref={listboxRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="absolute left-0 mt-2 min-w-[240px] w-full sm:w-64 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100 space-y-1"
        >
          {options.map((opt, index) => {
            const isSelected = value === opt.value;
            const dotColor = opt.color || opt.badgeColor || DEFAULT_VIOLATION_COLORS[opt.value] || 'bg-slate-400';

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => handleSelect(opt.value)}
                onKeyDown={(e) => handleOptionKeyDown(e, index)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  isSelected
                    ? 'bg-orange-500 text-white font-semibold shadow-md'
                    : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${
                      isSelected ? 'ring-2 ring-white/50' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-white shrink-0 ml-2" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
