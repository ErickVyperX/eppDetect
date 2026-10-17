import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { soundService } from '../services/sound';
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
  Activity, 
  UserCheck, 
  Flame, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react';

export default function MonitoringView({ latestAlert }) {
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

  // Incidencias y alertas en vivo
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [activeBannerAlert, setActiveBannerAlert] = useState(null);
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
    // Autofoco inmediato en botón cerrar
    const timer = setTimeout(() => {
      modalCloseBtnRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [selectedIncidentModal]);

  // Carga inicial de cámaras y estado
  useEffect(() => {
    loadCameras();
    checkStatus();
    loadRecentIncidents();

    const interval = setInterval(checkStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  // Escuchar alertas en tiempo real vía WebSocket
  useEffect(() => {
    if (latestAlert && latestAlert.type === 'new_incident') {
      const inc = latestAlert.incident;
      soundService.playIncidentAlert();

      setActiveBannerAlert(inc);
      setTimeout(() => {
        setActiveBannerAlert(prev => (prev?.id === inc.id ? null : prev));
      }, 7000);

      setLiveIncidents(prev => [inc, ...prev.slice(0, 29)]);
    }
  }, [latestAlert]);

  const loadCameras = async () => {
    try {
      const list = await api.getCameras();
      setCameras(list);
      if (list.length > 0) {
        setSelectedCameraIndex(list[0].index);
      }
    } catch (e) {
      console.warn("No se pudieron enumerar cámaras:", e);
    }
  };

  const checkStatus = async () => {
    try {
      const s = await api.getStreamStatus();
      setStatus(s);
    } catch (e) {
      // Ignorar errores temporales
    }
  };

  const loadRecentIncidents = async () => {
    try {
      const data = await api.getIncidents({ limit: 15 });
      setLiveIncidents(data);
    } catch (e) {
      console.error("Error al cargar incidencias:", e);
    }
  };

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
      await checkStatus();
    } catch (err) {
      alert("Error al detener monitoreo: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const formatViolationName = (type) => {
    switch (type) {
      case 'sin_casco': return 'Sin Casco de Seguridad';
      case 'sin_chaleco': return 'Sin Chaleco Reflectante';
      case 'sin_guantes': return 'Sin Guantes de Protección';
      default: return type ? type.replace('_', ' ') : 'Infracción';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* BANNER VISUAL DE ALERTA EN TIEMPO REAL */}
      {activeBannerAlert && (
        <div className="bg-rose-500/20 border-2 border-rose-500 rounded-2xl p-4 text-white shadow-2xl animate-alert-pulse flex items-center justify-between transition-all">
          <div className="flex items-center space-x-4">
            <div className="bg-rose-600 p-3 rounded-xl animate-bounce">
              <ShieldAlert className="w-8 h-8 text-white" />
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
            onClick={() => setSelectedIncidentModal(activeBannerAlert)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-xs font-semibold rounded-xl shadow transition-colors"
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
              <Video className="w-5 h-5 text-orange-400" />
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
                onClick={handleStart}
                disabled={actionLoading || (sourceType === 'file' && !uploadedFilePath)}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-xs shadow-lg shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{actionLoading ? 'Iniciando...' : 'Iniciar Monitoreo'}</span>
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={actionLoading}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-lg shadow-rose-600/25 transition-all disabled:opacity-50"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>{actionLoading ? 'Deteniendo...' : 'Detener Monitoreo'}</span>
              </button>
            )}
          </div>
        </div>

        {/* SELECTOR DE MODO: CÁMARA VS ARCHIVO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Opción 1: Cámara Conectada */}
          <div 
            onClick={() => !status.is_running && setSourceType('camera')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              sourceType === 'camera'
                ? 'bg-orange-500/10 border-orange-500/50 ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            } ${status.is_running ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Camera className={`w-4 h-4 ${sourceType === 'camera' ? 'text-orange-400' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-white">Cámaras Conectadas al Equipo</span>
              </div>
              <input
                type="radio"
                name="sourceType"
                checked={sourceType === 'camera'}
                onChange={() => !status.is_running && setSourceType('camera')}
                disabled={status.is_running}
                className="text-orange-500 focus:ring-orange-500"
              />
            </div>
            
            <div className="mt-3 flex items-center space-x-2">
              <select
                value={selectedCameraIndex}
                onChange={(e) => setSelectedCameraIndex(Number(e.target.value))}
                disabled={sourceType !== 'camera' || status.is_running}
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
                title="Volver a escanear cámaras"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Opción 2: Archivo de Video desde el Explorador */}
          <div 
            onClick={() => !status.is_running && setSourceType('file')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              sourceType === 'file'
                ? 'bg-orange-500/10 border-orange-500/50 ring-1 ring-orange-500/30'
                : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
            } ${status.is_running ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <FolderOpen className={`w-4 h-4 ${sourceType === 'file' ? 'text-orange-400' : 'text-slate-400'}`} />
                <span className="text-xs font-bold text-white">Elegir Video desde el Explorador</span>
              </div>
              <input
                type="radio"
                name="sourceType"
                checked={sourceType === 'file'}
                onChange={() => !status.is_running && setSourceType('file')}
                disabled={status.is_running}
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
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sourceType !== 'file' || status.is_running}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-2 disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-orange-400" />
                <span>Seleccionar Archivo...</span>
              </button>

              <div className="flex-1 truncate text-xs text-slate-300">
                {uploading ? (
                  <span className="text-amber-400">Cargando archivo...</span>
                ) : selectedFile ? (
                  <span className="text-emerald-400 flex items-center space-x-1 truncate" title={selectedFile.name}>
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{selectedFile.name}</span>
                  </span>
                ) : (
                  <span className="text-slate-500">Ningún archivo seleccionado</span>
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
              src={`/api/stream/video_feed?t=${status.is_running ? 'live' : 'standby'}`}
              alt="Transmisión de Video en Vivo"
              className="w-full h-full object-contain"
            />

            {/* Badge de Estado Superior */}
            <div className="absolute top-4 left-4 bg-slate-950/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700/80 flex items-center space-x-2 text-xs shadow-lg">
              <span className={`w-2.5 h-2.5 rounded-full ${status.is_running ? 'bg-emerald-500' : 'bg-amber-500'}`} />
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

            {/* Leyenda Multimodal (No solo color) y Botón de Pantalla Completa */}
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

        {/* PANEL LATERAL DE ALERTAS E INCIDENCIAS (1 columna) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col h-[560px]">
          
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h3 className="font-bold text-white text-sm">Alertas en Tiempo Real</h3>
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {liveIncidents.length} Registros
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 mt-3 pr-1">
            {liveIncidents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                <ShieldCheck className="w-10 h-10 text-emerald-500/40" />
                <p className="text-xs">No hay infracciones detectadas.</p>
                <p className="text-[10px] text-slate-600">Inicie la detección para comenzar el seguimiento.</p>
              </div>
            ) : (
              liveIncidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncidentModal(inc)}
                  className="bg-slate-950 hover:bg-slate-800/60 cursor-pointer border border-slate-800/80 hover:border-rose-500/40 p-3 rounded-xl transition-all space-y-2 group"
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
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(inc.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pt-1">
                    <div className="w-16 h-12 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img
                        src={inc.frame_url}
                        alt="Evidencia"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-0.5">
                      <p>Confianza: <strong className="text-slate-200">{(inc.confidence * 100).toFixed(0)}%</strong></p>
                      <p className="text-[10px] text-amber-400">
                        Cooldown 60s activado
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

      </div>

      {/* MODAL DE EVIDENCIA */}
      {selectedIncidentModal && (
        <div 
          onClick={() => setSelectedIncidentModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-evidence-title"
          aria-describedby="modal-evidence-desc"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-3">
              <div>
                <h3 id="modal-evidence-title" className="text-base font-bold text-white flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" aria-hidden="true" />
                  <span>Evidencia de Infracción: {formatViolationName(selectedIncidentModal.violation_type)}</span>
                </h3>
                <p id="modal-evidence-desc" className="text-xs text-slate-300 mt-0.5">
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
