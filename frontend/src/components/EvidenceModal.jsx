import React, { useEffect, useRef } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatViolationName, formatDateTime } from '../utils/formatters';

/**
 * Modal accesible de visualización de evidencia gráfica para infracciones de EPP.
 * Incorpora trampa de foco (focus trap), restauración de foco al elemento desencadenante,
 * soporte para tecla Escape, cierre al hacer clic en el backdrop y contraste conforme a WCAG 2.2 AA.
 */
export default function EvidenceModal({ incident, onClose, triggerRef }) {
  const { token } = useAuth();
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  // Manejo accesible de trampa de foco y restauración
  useEffect(() => {
    if (!incident) return;

    // Almacenar el elemento que tenía el foco antes de abrir el modal
    previousActiveElementRef.current = triggerRef?.current || document.activeElement;

    // Foco inicial en el botón de cierre tras renderizar
    const timer = setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e) => {
      // Cierre con Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Trampa de foco con Tab y Shift+Tab
      if (e.key === 'Tab' && modalRef.current) {
        const focusableSelectors = [
          'a[href]',
          'button:not([disabled])',
          'textarea:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        const focusableElements = Array.from(
          modalRef.current.querySelectorAll(focusableSelectors)
        ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Retroceder foco
          if (document.activeElement === firstElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Avanzar foco
          if (document.activeElement === lastElement || !modalRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      // Restaurar foco al elemento que activó el modal
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [incident, onClose, triggerRef]);

  if (!incident) return null;

  const getFrameUrl = (url) => {
    if (!url) return '';
    if (!token) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  };

  return (
    <div 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-modal-title"
      aria-describedby="evidence-modal-desc"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-150"
    >
      <div 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-3">
          <div>
            <h3 id="evidence-modal-title" className="text-base font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" aria-hidden="true" />
              <span>Evidencia de Infracción: {formatViolationName(incident.violation_type)}</span>
            </h3>
            <p id="evidence-modal-desc" className="text-xs text-slate-300 mt-0.5">
              ID: <span className="font-mono text-slate-400">{incident.id}</span> &bull; Sujeto <strong className="text-white">#{incident.track_id}</strong> &bull; <time className="font-mono">{formatDateTime(incident.timestamp)}</time>
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de evidencia (presione Escape)"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            <span>Cerrar</span>
            <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700" aria-hidden="true">ESC</kbd>
          </button>
        </div>

        <div className="bg-black rounded-xl overflow-hidden border border-slate-800 max-h-[480px] flex items-center justify-center">
          <img
            src={getFrameUrl(incident.frame_url)}
            alt={`Evidencia fotográfica de ${formatViolationName(incident.violation_type)} en sujeto #${incident.track_id}`}
            className="max-h-[480px] w-auto object-contain"
          />
        </div>

        <div className="flex justify-between items-center text-xs text-slate-300 pt-2 border-t border-slate-800/80">
          <span>Nivel de Confianza: <strong className="text-white font-mono tabular-nums">{(incident.confidence * 100).toFixed(1)}%</strong></span>
          <span className="text-slate-400">Almacenado localmente &bull; SQLite On-Premise</span>
        </div>
      </div>
    </div>
  );
}
