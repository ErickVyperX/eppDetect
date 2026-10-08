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
  AlertCircle 
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
          <div className="relative bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl aspect-video flex items-center justify-center">
            
            <img
              src={`/api/stream/video_feed?t=${status.is_running ? 'live' : 'standby'}`}
              alt="Transmisión de Video"
              className="w-full h-full object-contain"
            />

            {/* Badge de Estado Superior */}
            <div className="absolute top-4 left-4 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-800 flex items-center space-x-2 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${status.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="font-semibold text-slate-200">
                {status.is_running ? `EN VIVO: ${status.current_source_name}` : 'MONITOREO DETENIDO'}
              </span>
            </div>

            {/* Telemetría Flotante */}
            {status.is_running && (
              <div className="absolute top-4 right-4 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 flex items-center space-x-4 text-xs">
                <span className="font-mono text-emerald-400 font-bold">{status.fps} FPS</span>
                <span className="text-slate-300">Sujetos: <strong className="text-white">{status.active_tracks}</strong></span>
                <span className="text-rose-400 font-bold">Infracciones: {status.active_violations}</span>
              </div>
            )}

            {/* Leyenda Inferior */}
            <div className="absolute bottom-4 left-4 right-4 bg-slate-950/85 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300">
              <div className="flex items-center space-x-4">
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>EPP Cumplido</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  <span className="font-semibold text-rose-400">Ausencia EPP (Alerta + Cooldown 60s)</span>
                </span>
              </div>
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Evidencia de Infracción: {formatViolationName(selectedIncidentModal.violation_type)}
                </h3>
                <p className="text-xs text-slate-400">
                  ID: {selectedIncidentModal.id} &bull; Sujeto #{selectedIncidentModal.track_id} &bull; {new Date(selectedIncidentModal.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedIncidentModal(null)}
                className="text-slate-400 hover:text-white text-sm px-3 py-1 bg-slate-800 rounded-lg"
              >
                Cerrar
              </button>
            </div>

            <div className="bg-black rounded-xl overflow-hidden border border-slate-800 max-h-[480px] flex items-center justify-center">
              <img
                src={selectedIncidentModal.frame_url}
                alt="Frame de Evidencia"
                className="max-h-[480px] w-auto object-contain"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-slate-400 pt-2">
              <span>Confianza de Detección: <strong>{(selectedIncidentModal.confidence * 100).toFixed(1)}%</strong></span>
              <span>Guardado en disco local &bull; Base de Datos SQLite</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
