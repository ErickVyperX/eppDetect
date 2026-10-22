import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  Calendar, 
  Download, 
  Eye, 
  Clock,
  Layers
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  CartesianGrid, 
  Cell 
} from 'recharts';
import { formatViolationName, formatDateTime } from '../utils/formatters';
import EvidenceModal from '../components/EvidenceModal';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';

const VIOLATION_OPTIONS = [
  { value: 'all', label: 'Todas las Infracciones', color: 'bg-slate-400' },
  { value: 'sin_casco', label: 'Sin Casco de Seguridad', color: 'bg-red-500' },
  { value: 'sin_chaleco', label: 'Sin Chaleco Reflectante', color: 'bg-amber-500' },
  { value: 'sin_guantes', label: 'Sin Guantes de Protección', color: 'bg-purple-500' },
];

export default function MetricsView({ isActive = true }) {
  const [metrics, setMetrics] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedIncidentModal, setSelectedIncidentModal] = useState(null);

  useEffect(() => {
    if (isActive) {
      loadData();
    }
  }, [filterType, dateFilter, isActive]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summary, incList] = await Promise.all([
        api.getMetricsSummary(),
        api.getIncidents({ limit: 100, violation_type: filterType, date_filter: dateFilter })
      ]);
      setMetrics(summary);
      setIncidents(incList || []);
    } catch (err) {
      console.error("Error al cargar métricas:", err);
    } finally {
      setLoading(false);
    }
  };

  const getChartData = () => {
    if (!metrics) return [];
    return [
      { name: 'Sin Casco', cantidad: metrics.violations_by_type?.sin_casco || 0, color: '#EF4444' },
      { name: 'Sin Chaleco', cantidad: metrics.violations_by_type?.sin_chaleco || 0, color: '#F97316' },
      { name: 'Sin Guantes', cantidad: metrics.violations_by_type?.sin_guantes || 0, color: '#EAB308' },
    ];
  };

  /**
   * Exportación a CSV robusta y compatible con Microsoft Excel:
   * - Fechas en formato ISO estándar 'YYYY-MM-DD HH:mm:ss' (sin comas que rompan columnas).
   * - Celdas envueltas en comillas dobles y escape de comillas internas.
   * - Carácter BOM UTF-8 '\uFEFF' para visualización correcta de caracteres especiales y tildes.
   */
  const exportToCSV = () => {
    if (incidents.length === 0) return;
    const headers = ['ID', 'Fecha y Hora', 'Sujeto ID', 'Infraccion', 'Confianza', 'Fuente'];
    const rows = incidents.map(i => [
      i.id,
      formatDateTime(i.timestamp),
      i.track_id,
      formatViolationName(i.violation_type),
      `${(i.confidence * 100).toFixed(1)}%`,
      i.source_name
    ]);

    const escapeCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const csvLines = [
      headers.map(escapeCell).join(','),
      ...rows.map(row => row.map(escapeCell).join(','))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_epp_incidencias_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* CABECERA DE LA VISTA DE MÉTRICAS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-orange-400" aria-hidden="true" />
            <span>Métricas e Inteligencia de Seguridad</span>
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Análisis estadístico de cumplimiento y registro histórico de omisiones de EPP.
          </p>
        </div>

        <button
          type="button"
          onClick={exportToCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors"
          aria-label="Exportar reporte de incidencias en formato CSV"
        >
          <Download className="w-4 h-4 text-orange-400" aria-hidden="true" />
          <span>Exportar Reporte CSV</span>
        </button>
      </div>

      {/* TARJETAS DE KPIS PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-medium">Infracciones Hoy</span>
            <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl">
              <Calendar className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {metrics?.today_incidents ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Registradas en el día calendario actual
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-medium">Total Histórico</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {metrics?.total_incidents ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Evidencias acumuladas en base de datos
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-medium">Mayor Omisión de EPP</span>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-xl font-bold text-rose-400 mt-2 truncate">
            {metrics?.top_violation ? formatViolationName(metrics.top_violation) : 'Ninguna'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Elemento con mayor tasa de incumplimiento
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-medium">Ventana de Cooldown</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Clock className="w-4 h-4" aria-hidden="true" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400 mt-2">
            60s
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Protección anti-duplicados por sujeto
          </div>
        </div>

      </div>

      {/* GRÁFICOS ANALÍTICOS ACCESIBLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico 1: Infracciones por Tipo de EPP */}
        <div 
          role="region" 
          aria-label="Gráfico de distribución por tipo de EPP" 
          tabIndex={0}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-700"
        >
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-orange-400" aria-hidden="true" />
            <span>Distribución por Tipo de EPP Omitido</span>
          </h3>

          {/* Resumen semántico para tecnologías asistivas */}
          <div className="sr-only">
            <p>Distribución de omisiones de equipo de protección personal:</p>
            <ul>
              <li>Sin Casco de Seguridad: {metrics?.violations_by_type?.sin_casco || 0} incidencias</li>
              <li>Sin Chaleco Reflectante: {metrics?.violations_by_type?.sin_chaleco || 0} incidencias</li>
              <li>Sin Guantes de Protección: {metrics?.violations_by_type?.sin_guantes || 0} incidencias</li>
            </ul>
          </div>

          <div className="h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getChartData()} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                  {getChartData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Distribución por Horas del Turno */}
        <div 
          role="region" 
          aria-label="Gráfico de frecuencia horaria de incidencias" 
          tabIndex={0}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-700"
        >
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-400" aria-hidden="true" />
            <span>Frecuencia Horaria de Incidencias (24h)</span>
          </h3>

          {/* Resumen semántico para tecnologías asistivas */}
          <div className="sr-only">
            <p>Frecuencia de incidencias detectadas en cada hora del día de monitoreo.</p>
          </div>

          <div className="h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.hourly_distribution || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hora" stroke="#94a3b8" fontSize={10} interval={3} />
                <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Area type="monotone" dataKey="infracciones" stroke="#F97316" fillOpacity={1} fill="url(#colorInc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* TABLA HISTÓRICA DETALLADA CON FILTROS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Clock className="w-4 h-4 text-orange-400" aria-hidden="true" />
            <span>Historial Detallado de Incidencias</span>
          </h3>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filtro por Tipo de Infracción con Select interactivo */}
            <Select
              value={filterType}
              onChange={setFilterType}
              options={VIOLATION_OPTIONS}
              ariaLabel="Filtrar incidencias por tipo de infracción"
            />

            {/* Filtro por Fecha con DatePicker interactivo */}
            <DatePicker
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="Todas las fechas"
              ariaLabel="Filtrar incidencias por fecha"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <caption className="sr-only">Historial de infracciones de seguridad detectadas</caption>
            <thead className="text-[11px] uppercase tracking-wider bg-slate-950/70 text-slate-300 border-b border-slate-800">
              <tr>
                <th scope="col" className="py-3 px-4">Fecha y Hora</th>
                <th scope="col" className="py-3 px-4">Sujeto / Track</th>
                <th scope="col" className="py-3 px-4">Infracción Detectada</th>
                <th scope="col" className="py-3 px-4">Confianza</th>
                <th scope="col" className="py-3 px-4">Fuente</th>
                <th scope="col" className="py-3 px-4 text-center">Evidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    {loading ? 'Cargando incidencias registradas...' : 'No se encontraron incidencias registradas con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                      {formatDateTime(inc.timestamp)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-white">
                      #{inc.track_id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/20">
                        {formatViolationName(inc.violation_type)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {(inc.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3 px-4 text-slate-300 text-[11px]">
                      {inc.source_name}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedIncidentModal(inc)}
                        aria-label={`Ver foto de evidencia para incidencia ${inc.id} de ${formatViolationName(inc.violation_type)}`}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-orange-500 text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-all text-[11px]"
                      >
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Ver Foto</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* MODAL DE EVIDENCIA REUTILIZABLE Y ACCESIBLE */}
      <EvidenceModal
        incident={selectedIncidentModal}
        onClose={() => setSelectedIncidentModal(null)}
      />

    </div>
  );
}
