const API_BASE = '/api';

/**
 * Helper que obtiene las cabeceras HTTP necesarias incluyendo el token de autenticación
 * JWT en formato Bearer desde localStorage si se encuentra disponible.
 */
export const getAuthHeaders = (extraHeaders = {}) => {
  const token = localStorage.getItem('epp_token');
  const headers = { ...extraHeaders };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * Realiza una petición HTTP segura:
 * - Evita invocar res.json() antes de comprobar res.ok.
 * - Lee el cuerpo con res.text() y parsea JSON dentro de un bloque seguro para evitar
 *   errores de sintaxis ('Unexpected token < in JSON') si el servidor devuelve HTML o texto plano.
 * - En caso de error 401 Unauthorized (excepto en login), limpia la sesión y emite un evento global.
 */
async function safeFetch(url, options = {}, isLogin = false) {
  const res = await fetch(url, options);

  const rawText = await res.text();
  let data = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // Si la sesión expiró o es inválida (401) y no es la ruta de login, limpiar sesión y notificar
    if (res.status === 401 && !isLogin) {
      localStorage.removeItem('epp_token');
      localStorage.removeItem('epp_user');
      window.dispatchEvent(new CustomEvent('epp_auth_unauthorized'));
    }

    const detailMsg = data && (data.detail || data.message || data.error);
    const errorMessage = detailMsg || (rawText && rawText.length < 200 ? rawText : `Error HTTP ${res.status}: ${res.statusText}`);
    const error = new Error(errorMessage);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Autenticación
  async login(email, password) {
    return safeFetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }, true);
  },

  async getMe(token) {
    return safeFetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  },

  // Detección de cámaras y control de streaming (Autenticados)
  async getCameras() {
    return safeFetch(`${API_BASE}/stream/cameras`, {
      headers: getAuthHeaders()
    });
  },

  async uploadVideo(file) {
    const formData = new FormData();
    formData.append('file', file);
    return safeFetch(`${API_BASE}/stream/upload_video`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });
  },

  async startStream({ source_type, camera_index, file_path, name }) {
    return safeFetch(`${API_BASE}/stream/start`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ source_type, camera_index, file_path, name })
    });
  },

  async stopStream() {
    return safeFetch(`${API_BASE}/stream/stop`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
  },

  async getStreamStatus() {
    return safeFetch(`${API_BASE}/stream/status`, {
      headers: getAuthHeaders()
    });
  },

  // Incidencias (Autenticadas)
  async getIncidents({ skip = 0, limit = 50, violation_type = 'all', date_filter = '' } = {}) {
    let url = `${API_BASE}/incidents?skip=${skip}&limit=${limit}`;
    if (violation_type && violation_type !== 'all') {
      url += `&violation_type=${encodeURIComponent(violation_type)}`;
    }
    if (date_filter) {
      url += `&date_filter=${encodeURIComponent(date_filter)}`;
    }
    return safeFetch(url, {
      headers: getAuthHeaders()
    });
  },

  // Métricas (Autenticadas)
  async getMetricsSummary() {
    return safeFetch(`${API_BASE}/incidents/metrics/summary`, {
      headers: getAuthHeaders()
    });
  }
};
