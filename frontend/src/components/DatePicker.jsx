import React, { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

/**
 * Componente accesible e interactivo de selección de fecha (DatePicker).
 * Soporta navegación por mes, selección de día, botón "Hoy", "Limpiar",
 * y cierre con tecla Escape o clic externo.
 */
export default function DatePicker({
  value = '',
  onChange,
  placeholder = 'Todas las fechas',
  ariaLabel = 'Filtrar incidencias por fecha'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  // Inicializar el mes visible basado en el valor actual o la fecha de hoy
  const [viewDate, setViewDate] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  // Sincronizar el mes cuando se abre el popover con una fecha seleccionada
  useEffect(() => {
    if (isOpen && value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewDate(new Date(y, m - 1, 1));
    }
  }, [isOpen, value]);

  // Manejo de eventos de clic fuera y Escape para accesibilidad WCAG
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

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDate = (dateStr) => {
    onChange?.(dateStr);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleClear = () => {
    onChange?.('');
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const handleSelectToday = () => {
    onChange?.(todayStr);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // Formato visual legible DD/MM/YYYY
  const formatDisplayDate = (val) => {
    if (!val) return '';
    const parts = val.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    return val;
  };

  // Cálculo de la cuadrícula mensual
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Domingo
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  return (
    <div ref={containerRef} className="relative inline-block text-xs">
      {/* Campo / Botón interactivo */}
      <div className="flex items-center bg-slate-950 rounded-xl border border-slate-700 hover:border-slate-600 focus-within:ring-1 focus-within:ring-orange-500 transition-colors">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={value ? `${ariaLabel}, fecha seleccionada: ${formatDisplayDate(value)}` : ariaLabel}
          className="flex items-center space-x-2 px-3 py-1.5 text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-xl cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span className={value ? "text-slate-100 font-mono font-medium" : "text-slate-400"}>
            {value ? formatDisplayDate(value) : placeholder}
          </span>
        </button>

        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange?.('');
            }}
            aria-label="Limpiar filtro de fecha"
            className="pr-2.5 pl-1 text-slate-400 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-orange-500 rounded transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Popover desplegable con calendario */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Calendario interactivo para selección de fecha"
          className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Cabecera con mes, año y botones de navegación */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mes anterior"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-xs font-semibold text-slate-100 select-none">
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Mes siguiente"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Días de la semana */}
          <div className="grid grid-cols-7 gap-1 text-center my-2">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="text-[11px] font-medium text-slate-400 py-1 select-none">
                {wd}
              </div>
            ))}
          </div>

          {/* Cuadrícula de días */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="w-8 h-8" />;
              }

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = value === dateStr;
              const isToday = todayStr === dateStr;

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => handleSelectDate(dateStr)}
                  aria-label={`${day} de ${MONTH_NAMES[month]} de ${year}${isSelected ? ', seleccionado' : ''}${isToday ? ', hoy' : ''}`}
                  aria-pressed={isSelected}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                    isSelected
                      ? 'bg-orange-500 text-white font-bold shadow-md'
                      : isToday
                      ? 'border border-orange-500 text-orange-400 font-semibold hover:bg-slate-800'
                      : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Acciones Rápidas: Limpiar y Hoy */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80 text-xs">
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors cursor-pointer"
            >
              Limpiar
            </button>
            <button
              type="button"
              onClick={handleSelectToday}
              className="text-orange-400 hover:text-orange-300 font-semibold px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors cursor-pointer"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
