import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { 
  BarChart3, 
  TrendingUp, 
  ShieldAlert, 
  Calendar, 
  Filter, 
  Download, 
  Search, 
  HardHat, 
  Eye, 
  Clock,
  Layers,
  X
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

export default function MetricsView() {
  const [metrics, setMetrics] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedIncidentModal, setSelectedIncidentModal] = useState(null);
  const modalCloseBtnRef = useRef(null);

  // Manejo accesible de tecla Escape y foco en modal
  useEffect(() => {
    if (!selectedIncidentModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setSelectedIncidentModal(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const timer = setTimeout(() => {
      modalCloseBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [selectedIncidentModal]);

  useEffect(() => {
    loadData();
  }, [filterType, dateFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summary, incList] = await Promise.all([
        api.getMetricsSummary(),
        api.getIncidents({ limit: 100, violation_type: filterType, date_filter: dateFilter })
      ]);
      setMetrics(summary);
      setIncidents(incList);
    } catch (err) {
      console.error("Error al cargar métricas:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatViolationName = (type) => {
    switch (type) {
      case 'sin_casco': return 'Sin Casco';
      case 'sin_chaleco': return 'Sin Chaleco';
      case 'sin_guantes': return 'Sin Guantes';
      default: return type ? type.replace('_', ' ') : 'N/A';
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

  const exportToCSV = () => {
    if (incidents.length === 0) return;
    const headers = ['ID', 'Fecha y Hora', 'Sujeto ID', 'Infraccion', 'Confianza', 'Fuente'];
    const rows = incidents.map(i => [
      i.id,
      new Date(i.timestamp).toLocaleString(),
      i.track_id,
      formatViolationName(i.violation_type),
      `${(i.confidence * 100).toFixed(1)}%`,
      i.source_name
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_epp_incidencias_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* CABECERA DE LA VISTA DE MÉTRICAS */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-orange-400" />
            <span>Métricas e Inteligencia de Seguridad</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Análisis estadístico de cumplimiento y registro histórico de omisiones de EPP.
          </p>
        </div>

        <button
          onClick={exportToCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold shadow transition-colors"
        >
          <Download className="w-4 h-4 text-orange-400" />
          <span>Exportar Reporte CSV</span>
        </button>
      </div>

      {/* TARJETAS DE KPIS PRINCIPALES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Infracciones Hoy</span>
            <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {metrics?.today_incidents ?? 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Registradas durante el turno actual
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total Histórico</span>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Layers className="w-4 h-4" />
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
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Mayor Omisión de EPP</span>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
              <ShieldAlert className="w-4 h-4" />
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
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Ventana de Cooldown</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Clock className="w-4 h-4" />
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

      {/* GRÁFICOS ANALÍTICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Gráfico 1: Infracciones por Tipo de EPP */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-orange-400" />
            <span>Distribución por Tipo de EPP Omitido</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getChartData()} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            <span>Frecuencia Horaria de Incidencias (24h)</span>
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.hourly_distribution || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hora" stroke="#64748b" fontSize={10} interval={3} />
                <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
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
            <Clock className="w-4 h-4 text-orange-400" />
            <span>Historial Detallado de Incidencias</span>
          </h3>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filtro por Tipo */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-transparent text-white focus:outline-none text-xs"
              >
                <option value="all">Todas las Infracciones</option>
                <option value="sin_casco">Sin Casco</option>
                <option value="sin_chaleco">Sin Chaleco</option>
                <option value="sin_guantes">Sin Guantes</option>
              </select>
            </div>

            {/* Filtro por Fecha */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent text-white focus:outline-none text-xs"
              />
              {dateFilter && (
                <button 
                  onClick={() => setDateFilter('')}
                  className="text-slate-400 hover:text-white text-[10px]"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="text-[11px] uppercase tracking-wider bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Sujeto / Track</th>
                <th className="py-3 px-4">Infracción Detectada</th>
                <th className="py-3 px-4">Confianza</th>
                <th className="py-3 px-4">Fuente</th>
                <th className="py-3 px-4 text-center">Evidencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {incidents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                    No se encontraron incidencias registradas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                      {new Date(inc.timestamp).toLocaleString()}
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
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {inc.source_name}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedIncidentModal(inc)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-orange-500 text-slate-300 hover:text-white transition-all text-[11px]"
                      >
                        <Eye className="w-3.5 h-3.5" />
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

      {/* MODAL DE EVIDENCIA */}
      {selectedIncidentModal && (
        <div 
          onClick={() => setSelectedIncidentModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="metrics-evidence-title"
          aria-describedby="metrics-evidence-desc"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-3">
              <div>
                <h3 id="metrics-evidence-title" className="text-base font-bold text-white flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" aria-hidden="true" />
                  <span>Registro de Evidencia: {formatViolationName(selectedIncidentModal.violation_type)}</span>
                </h3>
                <p id="metrics-evidence-desc" className="text-xs text-slate-300 mt-0.5">
                  ID: <span className="font-mono text-slate-400">{selectedIncidentModal.id}</span> &bull; Sujeto <strong className="text-white">#{selectedIncidentModal.track_id}</strong> &bull; <time className="font-mono">{new Date(selectedIncidentModal.timestamp).toLocaleString()}</time>
                </p>
              </div>
              <button
                ref={modalCloseBtnRef}
                type="button"
                onClick={() => setSelectedIncidentModal(null)}
                aria-label="Cerrar visor de evidencia (presione Escape)"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                <span>Cerrar</span>
                <kbd className="hidden sm:inline-block ml-1 text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700">ESC</kbd>
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden border border-slate-800 max-h-[480px] flex items-center justify-center">
              <img
                src={selectedIncidentModal.frame_url}
                alt={`Evidencia de ${formatViolationName(selectedIncidentModal.violation_type)} en trabajador #${selectedIncidentModal.track_id}`}
                className="max-h-[480px] w-auto object-contain"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-slate-300 pt-2 border-t border-slate-800/80">
              <span>Nivel de Confianza: <strong className="text-white font-mono tabular-nums">{(selectedIncidentModal.confidence * 100).toFixed(1)}%</strong></span>
              <span className="text-slate-400">Almacenado localmente &bull; SQLite On-Premise</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
