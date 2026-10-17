import React from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  HardHat,
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
              <HardHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">EPP SafetyVision</span>
              </div>
            </div>
          </div>

          {/* Navegación de Vistas */}
          <nav className="flex items-center space-x-2 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800" aria-label="Vistas principales">
            <button
              type="button"
              onClick={() => setActiveTab('monitoring')}
              aria-current={activeTab === 'monitoring' ? 'page' : undefined}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-all ${
                activeTab === 'monitoring'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              <span>Centro de Monitoreo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('metrics')}
              aria-current={activeTab === 'metrics' ? 'page' : undefined}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-all ${
                activeTab === 'metrics'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" aria-hidden="true" />
              <span>Métricas de Seguridad</span>
            </button>
          </nav>

          {/* Controles, Estado y Usuario */}
          <div className="flex items-center space-x-3 sm:space-x-4">

            {/* Indicador de WebSockets / Conexión Local */}
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                wsConnected 
                  ? 'bg-slate-950 border-emerald-500/30 text-emerald-400' 
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <span>{wsConnected ? 'En vivo' : 'Enlace Perdido'}</span>
            </div>

            {/* Toggle de Alarma Sonora */}
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Silenciar alarma sonora de infracciones' : 'Activar alarma sonora de infracciones'}
              title={soundEnabled ? 'Silenciar alarma sonora' : 'Activar alarma sonora'}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 transition-colors ${
                soundEnabled 
                  ? 'bg-slate-800 text-amber-400 border-amber-400/40 hover:bg-slate-700' 
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
              <span className="hidden xl:inline text-xs font-medium">
                {soundEnabled ? 'Alarma ON' : 'Alarma OFF'}
              </span>
            </button>

            {/* Perfil del Supervisor */}
            <div className="hidden md:flex items-center space-x-2.5 pl-2 border-l border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <UserCheck className="w-4 h-4 text-orange-400" aria-hidden="true" />
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold text-white leading-tight">{user?.full_name || 'Supervisor'}</div>
              </div>
            </div>

            {/* Botón Salir */}
            <button
              type="button"
              onClick={logout}
              aria-label="Cerrar sesión de supervisor"
              title="Cerrar sesión"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-all"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>

          </div>
        </div>
      </div>
    </header>
  );
}
