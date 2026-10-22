/**
 * Utilidades de formateo para EPP SafetyVision.
 */

/**
 * Traduce el identificador técnico de la infracción a una denominación
 * formal y descriptiva conforme a estándares de Seguridad y Salud en el Trabajo (SST).
 * 
 * @param {string} type - Identificador ('sin_casco', 'sin_chaleco', 'sin_guantes')
 * @returns {string} Nombre legible de la infracción
 */
export function formatViolationName(type) {
  switch (type) {
    case 'sin_casco':
      return 'Sin Casco de Seguridad';
    case 'sin_chaleco':
      return 'Sin Chaleco Reflectante';
    case 'sin_guantes':
      return 'Sin Guantes de Protección';
    default:
      if (!type) return 'Infracción Desconocida';
      return type.replace(/_/g, ' ');
  }
}

/**
 * Formatea una fecha en formato ISO legible 'YYYY-MM-DD HH:mm:ss',
 * apto para reportes CSV y visualización consistente sin comas intermedias.
 * 
 * @param {string|Date} dateVal - Marca de tiempo ISO o instancia Date
 * @returns {string} Fecha formateada
 */
export function formatDateTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);

  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Formatea la hora en formato 'HH:mm:ss'.
 * 
 * @param {string|Date} dateVal - Marca de tiempo ISO o instancia Date
 * @returns {string} Hora formateada
 */
export function formatTime(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';

  const pad = (n) => String(n).padStart(2, '0');
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return `${hh}:${min}:${ss}`;
}
