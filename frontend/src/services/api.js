const API_BASE = '/api';

export const api = {
  // Autenticación
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Error al iniciar sesión');
    }
    return data;
  },

  async getMe(token) {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Sesión no válida');
    return res.json();
  },

  // Detección de cámaras y control de streaming
  async getCameras() {
    const res = await fetch(`${API_BASE}/stream/cameras`);
    if (!res.ok) throw new Error('Error al detectar cámaras web');
    return res.json();
  },

  async uploadVideo(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/stream/upload_video`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al subir archivo de video');
    return data;
  },

  async startStream({ source_type, camera_index, file_path, name }) {
    const res = await fetch(`${API_BASE}/stream/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type, camera_index, file_path, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al iniciar monitoreo');
    return data;
  },

  async stopStream() {
    const res = await fetch(`${API_BASE}/stream/stop`, {
      method: 'POST'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Error al detener monitoreo');
    return data;
  },

  async getStreamStatus() {
    const res = await fetch(`${API_BASE}/stream/status`);
    if (!res.ok) throw new Error('Error al obtener estado');
    return res.json();
  },

  // Incidencias
  async getIncidents({ skip = 0, limit = 50, violation_type = 'all', date_filter = '' } = {}) {
    let url = `${API_BASE}/incidents?skip=${skip}&limit=${limit}`;
    if (violation_type && violation_type !== 'all') {
      url += `&violation_type=${encodeURIComponent(violation_type)}`;
    }
    if (date_filter) {
      url += `&date_filter=${encodeURIComponent(date_filter)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al obtener incidencias');
    return res.json();
  },

  // Métricas
  async getMetricsSummary() {
    const res = await fetch(`${API_BASE}/incidents/metrics/summary`);
    if (!res.ok) throw new Error('Error al obtener resumen de métricas');
    return res.json();
  }
};
