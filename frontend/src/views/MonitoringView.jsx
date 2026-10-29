import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Camera, 
  Video, 
  FolderOpen,
  Play, 
  Square, 
  RefreshCw, 
  ShieldAlert, 
  ShieldCheck, 
  Clock, 
  Upload, 
  CheckCircle2, 
  Maximize2,
  Minimize2
} from 'lucide-react';
import { formatViolationName, formatTime, buildFrameUrl } from '../utils/formatters';
import EvidenceModal from '../components/EvidenceModal';

/**
 * Panel lateral memoizado de Alertas en Tiempo Real.
 * Evita re-renderizar las tarjetas de evidencia y sus imágenes cuando cambia el indicador de FPS.
 */
const LiveAlertsSidebar = memo(function LiveAlertsSidebar({ liveIncidents, token, onSelectIncident }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-[560px]">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 text-rose-400" aria-hidden="true" />
          <h3 className="font-bold text-white text-sm">Alertas en Tiempo Real</h3>
        </div>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
          {liveIncidents.length} Registros
        </span>
      </div>

      <div 
        className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1"
        role="feed"
        aria-label="Lista de alertas de infracciones en tiempo real"
      >
        {liveIncidents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
            <ShieldCheck className="w-10 h-10 text-emerald-500/40" aria-hidden="true" />
            <p className="text-xs">No hay infracciones detectadas.</p>
            <p className="text-[10px] text-slate-400">Inicie la detección para comenzar el seguimiento.</p>
          </div>
        ) : (
          liveIncidents.map((inc) => (
            <button
              key={inc.id}
              type="button"
              onClick={() => onSelectIncident(inc)}
              aria-label={`Ver evidencia de ${formatViolationName(inc.violation_type)} en sujeto ${inc.track_id}`}
              className="w-full text-left bg-slate-950 hover:bg-slate-800/60 cursor-pointer border border-slate-800/80 hover:border-rose-500/40 p-3 rounded-xl transition-all space-y-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/20">
                    {formatViolationName(inc.violation_type)}
                  </span>
                  <h4 className="text-xs font-semibold text-white mt-1">
                    Sujeto #{inc.track_id}
                  </h4>
                </div>
                <div className="text-[11px] text-slate-300 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
                  <time dateTime={new Date(inc.timestamp).toISOString()}>{formatTime(inc.timestamp)}</time>
                </div>
              </div>

              <div className="flex items-center space-x-3 pt-1">
                <div className="w-16 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                  <img
                    src={buildFrameUrl(inc.frame_url, token)}
                    loading="lazy"
                    alt={`Evidencia de ${formatViolationName(inc.violation_type)}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
                <div className="text-[11px] text-slate-300 space-y-0.5">
                  <p>Confianza: <strong className="text-slate-100 font-mono">{(inc.confidence * 100).toFixed(0)}%</strong></p>
                  <p className="text-[10px] text-amber-400">
                    Cooldown 60s activado
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

export default function MonitoringView({ alertQueue = [], onConsumeAlerts, isActive = true }) {
  const { token } = useAuth();

  // Configuración de Fuente de Video
  const [sourceType, setSourceType] = useState('camera'); // 'camera' o 'file'
  const [cameras, setCameras] = useState([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  
  // Archivo de video local
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedFilePath, setUploadedFilePath] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const videoContainerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Escuchar cambios de pantalla completa
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().catch((err) => {
        console.warn("No se pudo activar pantalla completa:", err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn("No se pudo salir de pantalla completa:", err);
      });
    }
  };

  // Estado del streaming
  const [status, setStatus] = useState({ 
    is_running: false, 
    fps: 0, 
    current_source_name: 'Detenido', 
    active_violations: 0, 
    active_tracks: 0 
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [streamSessionId, setStreamSessionId] = useState(Date.now());
  const reconnectTimeoutRef = useRef(null);

  // Reconectar limpiamente con una nueva sesión si la pestaña se vuelve a activar y el stream está en curso
  useEffect(() => {
    if (isActive && status.is_running) {
      setStreamSessionId(Date.now());
    }
  }, [isActive]);

  // Limpiar timer de reconexión al desmontar
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Manejador de error para auto-reconexión del stream MJPEG tras 1.5 segundos
  const handleImageError = () => {
    if (isActive && status.is_running) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        setStreamSessionId(Date.now());
      }, 1500);
    }
  };

  // Incidencias y alertas en vivo
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [activeBannerAlert, setActiveBannerAlert] = useState(null);
  const [selectedIncidentModal, setSelectedIncidentModal] = useState(null);

  const checkStatus = useCallback(async () => {
    try {
      const s = await api.getStreamStatus();
      if (s) {
        setStatus(prev => {
          if (
            prev.is_running === s.is_running &&
            prev.fps === s.fps &&
            prev.current_source_name === s.current_source_name &&
            prev.active_violations === s.active_violations &&
            prev.active_tracks === s.active_tracks
          ) {
            return prev;
          }
          return s;
        });
      }
    } catch {
      // Ignorar errores temporales de red
    }
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const list = await api.getCameras();
      setCameras(list || []);
      if (list && list.length > 0) {
        setSelectedCameraIndex(list[0].index);
      }
    } catch (e) {
      console.warn("No se pudieron enumerar cámaras:", e);
    }
  }, []);

  const loadRecentIncidents = useCallback(async () => {
    try {
      const data = await api.getIncidents({ limit: 15 });
      setLiveIncidents(data || []);
    } catch (e) {
      console.error("Error al cargar incidencias:", e);
    }
  }, []);

  // Carga inicial de cámaras y estado; polling activo únicamente cuando la pestaña es visible
  useEffect(() => {
    loadCameras();
    checkStatus();
    loadRecentIncidents();
  }, [loadCameras, checkStatus, loadRecentIncidents]);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(checkStatus, 1500);
    return () => clearInterval(interval);
  }, [isActive, checkStatus]);

  // Escuchar y procesar alertas en tiempo real desde la cola global sin duplicar IDs
  useEffect(() => {
    if (alertQueue && alertQueue.length > 0) {
      const pendingAlerts = [...alertQueue];

      // Notificar consumo de alertas al padre para limpiar la cola
      if (onConsumeAlerts) {
        onConsumeAlerts(pendingAlerts.map(a => a.id));
      }

      // Activar banner visual solo para la alerta más reciente si ocurrió hace menos de 10s
      const now = Date.now();
      const latestRecent = [...pendingAlerts].reverse().find(inc => (now - (inc._receivedAt || now)) < 10000);
      if (latestRecent) {
        setActiveBannerAlert(latestRecent);
        setTimeout(() => {
          setActiveBannerAlert(prev => (prev?.id === latestRecent.id ? null : prev));
        }, 7000);
      }

      // Prepend a liveIncidents deduplicando por ID para evitar claves duplicadas
      setLiveIncidents(prev => {
        const existingIds = new Set(prev.map(item => item.id));
        const uniqueNew = pendingAlerts.filter(item => !existingIds.has(item.id));
        return [...uniqueNew, ...prev].slice(0, 30);
      });
    }
  }, [alertQueue, onConsumeAlerts]);

  // Manejador de selección de archivo de video
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploading(true);

    try {
      const res = await api.uploadVideo(file);
      setUploadedFilePath(res.file_path);
    } catch (err) {
      alert("Error al cargar el archivo de video: " + err.message);
      setSelectedFile(null);
      setUploadedFilePath(null);
    } finally {
      setUploading(false);
    }
  };

  // Iniciar Monitoreo
  const handleStart = async () => {
    setActionLoading(true);
    try {
      if (sourceType === 'camera') {
        const camObj = cameras.find(c => c.index === selectedCameraIndex);
        const name = camObj ? camObj.name : `Cámara ${selectedCameraIndex}`;
        await api.startStream({
          source_type: 'camera',
          camera_index: selectedCameraIndex,
          name: name
        });
      } else {
        if (!uploadedFilePath) {
          alert("Por favor selecciona primero un archivo de video desde el explorador.");
          setActionLoading(false);
          return;
        }
        await api.startStream({
          source_type: 'file',
          file_path: uploadedFilePath,
          name: selectedFile?.name || 'Video Local'
        });
      }
      setStreamSessionId(Date.now());
      await checkStatus();
    } catch (err) {
      alert("Error al iniciar monitoreo: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Detener Monitoreo
  const handleStop = async () => {
    setActionLoading(true);
    try {
      await api.stopStream();
      setStreamSessionId(Date.now());
      await checkStatus();
    } catch (err) {
      alert("Error al detener monitoreo: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseModal = useCallback(() => {
    setSelectedIncidentModal(null);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* BANNER VISUAL DE ALERTA EN TIEMPO REAL CON ROL ACCESIBLE */}
      {activeBannerAlert && (
        <div 
          role="alert"
          aria-live="assertive"
          className="bg-rose-500/20 border-2 border-rose-500 rounded-2xl p-4 text-white shadow-2xl animate-alert-pulse flex items-center justify-between transition-all"
        >
          <div className="flex items-center space-x-4">
            <div className="bg-rose-600 p-3 rounded-xl motion-safe:animate-bounce">
              <ShieldAlert className="w-8 h-8 text-white" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-600">
                  ¡Alerta de Infracción Inmediata!
                </span>
                <span className="text-xs text-rose-200">
                  Trabajador #{activeBannerAlert.track_id}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                {formatViolationName(activeBannerAlert.violation_type)}
              </h3>
              <p className="text-xs text-rose-200">
                Se inició ventana de tracking y cooldown de 60 segundos para evitar saturación de alertas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIncidentModal(activeBannerAlert)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-semibold rounded-xl shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            Ver Evidencia
          </button>
        </div>
      )}

      {/* PANEL DE SELECCIÓN DE ENTRADA Y CONTROL DE INICIO */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Video className="w-5 h-5 text-orange-400" aria-hidden="true" />
              <span>Configuración de Entrada de Video</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Seleccione la fuente de captura antes de iniciar la inferencia de seguridad.
            </p>
          </div>

          {/* ESTADO ACTUAL Y BOTONES DE CONTROL START / STOP */}
          <div className="flex items-center space-x-3 w-full md:w-auto">
            {!status.is_running ? (
              <button
                type="button"
                onClick={handleStart}
                disabled={actionLoading || (sourceType === 'file' && !uploadedFilePath)}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-xs shadow-lg shadow-orange-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                <span>{actionLoading ? 'Iniciando...' : 'Iniciar Monitoreo'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                disabled={actionLoading}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-lg shadow-rose-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-all disabled:opacity-50"
              >
                <Square className="w-4 h-4 fill-white" aria-hidden="true" />
                <span>{actionLoading ? 'Deteniendo...' : 'Detener Monitoreo'}</span>
              </button>
            )}
          </div>
        </div>

        {/* SELECTOR DE MODO: CÁMARA VS ARCHIVO ACCESIBLE POR TECLADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Opción 1: Cámara Conectada */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => !status.is_running && setSourceType('camera')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!status.is_running) setSourceType('camera');
              }
            }}
            aria-label="Seleccionar fuente de cámara web conectada"
            className={`p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              sourceType === 'camera'
                ? 'bg-orange-500/10 border-orange-500/50 ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            } ${status.is_running ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Camera className={`w-4 h-4 ${sourceType === 'camera' ? 'text-orange-400' : 'text-slate-400'}`} aria-hidden="true" />
                <span className="text-xs font-bold text-white">Cámaras Conectadas al Equipo</span>
              </div>
              <input
                type="radio"
                name="sourceType"
                checked={sourceType === 'camera'}
                onChange={() => !status.is_running && setSourceType('camera')}
                disabled={status.is_running}
                aria-label="Captura mediante cámara web conectada"
                className="text-orange-500 focus:ring-orange-500"
              />
            </div>
            
            <div className="mt-3 flex items-center space-x-2">
              <select
                value={selectedCameraIndex}
                onChange={(e) => setSelectedCameraIndex(Number(e.target.value))}
                disabled={sourceType !== 'camera' || status.is_running}
                aria-label="Dispositivo de cámara web disponible"
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500 w-full disabled:opacity-50"
              >
                {cameras.length === 0 ? (
                  <option value={0}>Cámara 0 (Predeterminada)</option>
                ) : (
                  cameras.map(c => (
                    <option key={c.id} value={c.index}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={loadCameras}
                disabled={status.is_running}
                aria-label="Volver a escanear cámaras web conectadas"
                title="Volver a escanear cámaras"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Opción 2: Archivo de Video desde el Explorador */}
          <div 
            role="button"
            tabIndex={0}
            onClick={() => !status.is_running && setSourceType('file')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!status.is_running) setSourceType('file');
              }
            }}
            aria-label="Seleccionar fuente de archivo de video local"
            className={`p-4 rounded-xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              sourceType === 'file'
                ? 'bg-orange-500/10 border-orange-500/50 ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            } ${status.is_running ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <FolderOpen className={`w-4 h-4 ${sourceType === 'file' ? 'text-orange-400' : 'text-slate-400'}`} aria-hidden="true" />
                <span className="text-xs font-bold text-white">Elegir Video desde el Explorador</span>
              </div>
              <input
                type="radio"
                name="sourceType"
                checked={sourceType === 'file'}
                onChange={() => !status.is_running && setSourceType('file')}
                disabled={status.is_running}
                aria-label="Captura mediante archivo de video"
                className="text-orange-500 focus:ring-orange-500"
              />
            </div>

            <div className="mt-3 flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="video/*"
                onChange={handleFileChange}
                disabled={sourceType !== 'file' || status.is_running}
                aria-label="Seleccionar archivo de video del sistema de archivos"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sourceType !== 'file' || status.is_running}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <Upload className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
                <span>Seleccionar Archivo...</span>
              </button>

              <div className="flex-1 truncate text-xs text-slate-300">
                {uploading ? (
                  <span className="text-amber-400">Cargando archivo...</span>
                ) : selectedFile ? (
                  <span className="text-emerald-400 flex items-center space-x-1 truncate" title={selectedFile.name}>
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{selectedFile.name}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">Ningún archivo seleccionado</span>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* FEED DE VIDEO Y PANEL DE ALERTAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* REPRODUCTOR DE VIDEO MJPEG (2 columnas) */}
        <div className="lg:col-span-2 space-y-3">
          <div 
            ref={videoContainerRef}
            className="relative bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl aspect-video flex items-center justify-center group"
          >
            
            <img
              src={
                !isActive
                  ? ''
                  : status.is_running
                  ? `/api/stream/video_feed?token=${encodeURIComponent(token || '')}&stream_id=${streamSessionId}`
                  : `/api/stream/video_feed?token=${encodeURIComponent(token || '')}&stream_id=standby_${streamSessionId}`
              }
              alt={status.is_running ? 'Transmisión de video en vivo con detección de EPP' : 'Transmisión en espera, monitoreo detenido'}
              className="w-full h-full object-contain"
              onError={handleImageError}
            />

            {/* Badge de Estado Superior */}
            <div className="absolute top-4 left-4 bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/80 flex items-center space-x-2 text-xs shadow-lg">
              <span className={`w-2.5 h-2.5 rounded-full ${status.is_running ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
              <span className="font-semibold text-slate-100">
                {status.is_running ? `EN VIVO: ${status.current_source_name}` : 'MONITOREO DETENIDO'}
              </span>
            </div>

            {/* Telemetría Flotante con tabular-nums */}
            {status.is_running && (
              <div className="absolute top-4 right-4 bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/80 flex items-center space-x-3.5 text-xs shadow-lg">
                <span className="font-mono tabular-nums text-emerald-400 font-bold">
                  {(Number(status?.fps) || 0).toFixed(1)}&nbsp;FPS
                </span>
                <span className="text-slate-300">
                  Personas: <strong className="text-white font-mono tabular-nums">{status.active_tracks}</strong>
                </span>
                <span className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-lg font-bold font-mono tabular-nums transition-colors ${
                  status.active_violations > 0 
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40' 
                    : 'text-slate-300'
                }`}>
                  {status.active_violations > 0 && <ShieldAlert className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />}
                  <span>Infracciones:&nbsp;{status.active_violations}</span>
                </span>
              </div>
            )}

            {/* Leyenda Multimodal y Botón de Pantalla Completa */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-950/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/80 flex flex-wrap items-center justify-between text-xs text-slate-200 gap-2 shadow-lg">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center space-x-2">
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold font-mono">
                    ✓ [OK]
                  </span>
                  <span className="text-slate-200">EPP Presente</span>
                </span>
                <span className="flex items-center space-x-2">
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold font-mono">
                    ⚠ [ALERTA]
                  </span>
                  <span className="font-semibold text-rose-300">Ausencia EPP (Cooldown 60&nbsp;s)</span>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setStreamSessionId(Date.now())}
                  aria-label="Refrescar señal de video en vivo"
                  title="Refrescar señal de video"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors flex items-center space-x-1.5 text-xs font-semibold"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Refrescar</span>
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver video en pantalla completa'}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors flex items-center space-x-1.5 text-xs font-semibold"
                >
                  {isFullscreen ? (
                    <>
                      <Minimize2 className="w-4 h-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Restaurar</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-4 h-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Pantalla Completa</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* PANEL LATERAL MEMOIZADO DE ALERTAS E INCIDENCIAS (1 columna) */}
        <LiveAlertsSidebar
          liveIncidents={liveIncidents}
          token={token}
          onSelectIncident={setSelectedIncidentModal}
        />

      </div>

      {/* MODAL DE EVIDENCIA REUTILIZABLE Y ACCESIBLE */}
      <EvidenceModal
        incident={selectedIncidentModal}
        onClose={handleCloseModal}
      />

    </div>
  );
}
