import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { soundService } from './services/sound';
import LoginView from './views/LoginView';
import MonitoringView from './views/MonitoringView';
import MetricsView from './views/MetricsView';
import Navbar from './components/Navbar';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('monitoring');
  const [wsConnected, setWsConnected] = useState(false);
  
  // Cola global de alertas para soportar ráfagas concurrentes sin pérdida
  const [alertQueue, setAlertQueue] = useState([]);
  const wsRef = useRef(null);

  // Conexión persistente con WebSockets para recepción de alertas (Protegida con Token y Origin)
  useEffect(() => {
    if (!user) return;

    let socket;
    let pingInterval;
    let reconnectTimeout = null;
    let isDisposed = false;

    const connectWebSocket = () => {
      if (isDisposed) return;
      const token = localStorage.getItem('epp_token');
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/alerts?token=${encodeURIComponent(token)}`;

      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isDisposed) {
          socket.close();
          return;
        }
        setWsConnected(true);
        // Ping de mantenimiento cada 15 segundos
        pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send('ping');
          }
        }, 15000);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'new_incident' && payload.incident) {
            // Reproducir alarma sonora inmediatamente a nivel global en App.jsx
            // Sonará incluso si el usuario se encuentra en la pestaña de Métricas
            soundService.playIncidentAlert();

            const incidentWithMetadata = {
              ...payload.incident,
              _receivedAt: Date.now()
            };

            // Encolar alerta para evitar pérdidas por ráfagas concurrentes
            setAlertQueue(prev => [...prev, incidentWithMetadata]);
          }
        } catch (e) {
          // mensaje de texto plano como pong
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        if (!isDisposed) {
          // Reintentar conexión en 3 segundos
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connectWebSocket();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pingInterval) clearInterval(pingInterval);
      if (socket) {
        // Desasociar listeners para prevenir reconexiones zombi en el desmontaje
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [user]);

  // Consumir alertas procesadas por las vistas
  const handleConsumeAlerts = useCallback((consumedIds = null) => {
    setAlertQueue(prev => {
      if (!consumedIds) return [];
      return prev.filter(item => !consumedIds.includes(item.id));
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // Si no está autenticado, mostrar pantalla de inicio de sesión
  if (!user) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        wsConnected={wsConnected} 
      />

      {/* Aviso Prominente de Desconexión de Enlace Local */}
      {!wsConnected && (
        <div 
          role="alert" 
          aria-live="assertive"
          className="bg-rose-600 border-b border-rose-700 text-white px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-white" aria-hidden="true" />
          <span>
            Advertencia: Enlace WebSocket con el servidor local interrumpido. Reconectando… Las alertas en tiempo real están en pausa.
          </span>
        </div>
      )}

      <main className="flex-1 pb-12">
        <div className={activeTab === 'monitoring' ? 'block' : 'hidden'}>
          <MonitoringView 
            alertQueue={alertQueue}
            onConsumeAlerts={handleConsumeAlerts}
            latestAlert={alertQueue.length > 0 ? alertQueue[alertQueue.length - 1] : null}
            isActive={activeTab === 'monitoring'}
          />
        </div>
        <div className={activeTab === 'metrics' ? 'block' : 'hidden'}>
          <MetricsView isActive={activeTab === 'metrics'} />
        </div>
      </main>
    </div>
  );
}
