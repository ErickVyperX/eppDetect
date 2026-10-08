import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import LoginView from './views/LoginView';
import MonitoringView from './views/MonitoringView';
import MetricsView from './views/MetricsView';
import Navbar from './components/Navbar';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('monitoring');
  const [wsConnected, setWsConnected] = useState(false);
  const [latestAlert, setLatestAlert] = useState(null);
  const wsRef = useRef(null);

  // Conexión persistente con WebSockets para recepción de alertas
  useEffect(() => {
    if (!user) return;

    let socket;
    let pingInterval;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/alerts`;

      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
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
          if (payload.type === 'new_incident') {
            setLatestAlert(payload);
          }
        } catch (e) {
          // mensaje de texto plano como pong
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        clearInterval(pingInterval);
        // Reintentar conexión en 3 segundos
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connectWebSocket();

    return () => {
      if (socket) socket.close();
      if (pingInterval) clearInterval(pingInterval);
    };
  }, [user]);

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

      <main className="flex-1 pb-12">
        {activeTab === 'monitoring' ? (
          <MonitoringView latestAlert={latestAlert} />
        ) : (
          <MetricsView />
        )}
      </main>
    </div>
  );
}
