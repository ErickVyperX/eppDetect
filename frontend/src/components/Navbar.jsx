import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  ShieldAlert, 
  Video, 
  BarChart3, 
  Volume2, 
  VolumeX, 
  LogOut, 
  UserCheck 
} from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, wsConnected }) {
  const { user, logout, soundEnabled, toggleSound } = useAuth();

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Marca del Sistema */}
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-orange-600 to-amber-500 p-2 rounded-xl text-white shadow-lg shadow-orange-500/20">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">EPP SafetyVision</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  Local On-Premise
                </span>
              </div>
              <p className="text-xs text-slate-400">Control y Detección de EPP en Obra</p>
            </div>
          </div>

          {/* Navegación de Vistas */}
          <nav className="flex items-center space-x-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'monitoring'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Centro de Monitoreo</span>
            </button>

            <button
              onClick={() => setActiveTab('metrics')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'metrics'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Métricas de Seguridad</span>
            </button>
          </nav>

          {/* Controles, Estado y Usuario */}
          <div className="flex items-center space-x-4">
            
            {/* Indicador de WebSockets / Conexión Local */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              <span className={wsConnected ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                {wsConnected ? 'Enlace en Vivo' : 'Desconectado'}
              </span>
            </div>

            {/* Toggle de Alarma Sonora */}
            <button
              onClick={toggleSound}
              title={soundEnabled ? 'Silenciar alarma sonora' : 'Activar alarma sonora'}
              className={`p-2 rounded-lg border transition-colors ${
                soundEnabled 
                  ? 'bg-slate-800 text-amber-400 border-amber-400/30 hover:bg-slate-750' 
                  : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-slate-300'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Perfil del Supervisor */}
            <div className="hidden md:flex items-center space-x-2.5 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <UserCheck className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white leading-tight">{user?.full_name || 'Supervisor'}</div>
                <div className="text-[10px] text-slate-400">{user?.email}</div>
              </div>
            </div>

            {/* Botón Salir */}
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>

          </div>
        </div>
      </div>
    </header>
  );
}
