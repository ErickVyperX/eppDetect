# EPP SafetyVision (EPP Detect)

Sistema web local (*On-Premise / Edge*) de visión computacional para la supervisión de Seguridad y Salud en el Trabajo (SST) en obras de construcción e instalaciones industriales. Procesa flujos de video en tiempo real desde cámaras USB o archivos locales para detectar omisiones en el uso de Equipos de Protección Personal (**casco**, **chaleco reflectante** y **guantes**), registrando evidencias fotográficas y emitiendo alertas instantáneas.

> [!NOTE]
> Diseñado para operar íntegramente en red local sin depender de conectividad a Internet ni servicios en la nube, garantizando baja latencia en la transmisión de video y privacidad sobre los datos biométricos de los trabajadores.

---

## Características Principales

- **Detección e Inferencia en Tiempo Real:** Impulsado por **Ultralytics YOLOv26s v1.2** (`weights_yolov26s_v1.2.pt`) para identificar 6 clases operativas (`casco`, `chaleco`, `guantes`, `sin_casco`, `sin_chaleco`, `sin_guantes`), con soporte automático de aceleración por hardware **NVIDIA CUDA FP16** y *fallback* transparente a CPU.
- **Seguimiento Multi-Objeto de Baja Latencia:** Integración con el rastreador **BoT-SORT** optimizado (`botsort_fast.yaml`), desactivando el cálculo pesado de flujo óptico global y Re-ID neuronal para sostener tasas de 25–30 FPS con filtro de Kalman de 8 estados.
- **Captura de Cámara sin Retraso (*Zero-Lag*):** Hilo dedicado (`_CameraStreamReader`) que drena continuamente el buffer del driver de video en Windows (`CAP_MSMF` / `CAP_DSHOW`), entregando siempre el último fotograma disponible en menos de 1 ms.
- **Control Inteligente de Cooldown (60 s):** Suprime ráfagas de alertas duplicadas evaluando la tupla `(track_id, violation_type)`. Registra la infracción inmediatamente y silencia nuevas escrituras del mismo sujeto/infracción durante 60 segundos mientras mantiene el seguimiento visual en pantalla.
- **Persistencia Asíncrona sin Bloqueo:** El guardado de evidencias JPEG y la inserción en base de datos **SQLite 3 (modo WAL)** se delegan a un `ThreadPoolExecutor`, evitando caídas de FPS en el bucle de inferencia.
- **Alertas Reactivas y Audio Sintetizado:** Difusión inmediata de incidentes vía **WebSockets** (`/ws/alerts`) acompañada de una alarma sonora industrial generada en el navegador mediante **Web Audio API** (<5 ms de latencia, sin archivos de audio externos).
- **Centro de Monitoreo y Analítica SST:** Interfaz SPA en **React 18 + Tailwind CSS** con reproductor MJPEG en vivo, métricas de cumplimiento en **Recharts**, filtros históricos, visor de evidencias con *Focus Trap* (WCAG 2.2 AA) y exportación a CSV compatible con Microsoft Excel (UTF-8 BOM).

---

## Arquitectura del Sistema

```mermaid
flowchart TB
    subgraph Captura["Adquisición de Video"]
        Cam["Cámara USB (MSMF / DShow)"]
        VideoFile["Archivo de Video Local (MP4/AVI/MKV/MOV)"]
    end

    subgraph Backend["Backend FastAPI (Python / Uvicorn :8000)"]
        Grabber["_CameraStreamReader (Zero-Lag Grabber)"]
        Engine["VideoEngine (YOLOv26s FP16 + BoT-SORT)"]
        Cooldown["CooldownManager (Ventana 60s por Track)"]
        Pool["ThreadPoolExecutor (Workers I/O)"]
        WSManager["WebSocket Connection Manager"]
        Routers["API Routers (/api/auth, /api/stream, /api/incidents)"]
    end

    subgraph Persistencia["Almacenamiento Local"]
        DB[("SQLite 3 (Modo WAL)")]
        Storage["Evidencias JPG (/storage/incidents)"]
    end

    subgraph Frontend["Frontend SPA (React 18 + Vite :3000)"]
        Monitor["MonitoringView (MJPEG Player + Alertas en Vivo)"]
        Metrics["MetricsView (Recharts + Exportación CSV)"]
        Audio["Web Audio API (Alarma Sintética)"]
    end

    Cam --> Grabber --> Engine
    VideoFile --> Engine
    Engine -->|Frame Anotado| Routers
    Engine -->|Infracción Detectada| Cooldown
    Cooldown -->|Fuera de Cooldown| Pool
    Pool --> Storage
    Pool --> DB
    Pool --> WSManager

    Routers -->|Stream MJPEG Multipart| Monitor
    Routers -->|REST JSON (JWT)| Metrics
    WSManager -->|Push JSON (/ws/alerts)| Monitor
    WSManager -->|Disparo de Alerta| Audio
```

### Stack Tecnológico

| Capa | Tecnologías | Propósito |
| :--- | :--- | :--- |
| **Visión e IA** | Ultralytics YOLO `8.4.174`, PyTorch `2.11.0+cu128`, OpenCV `5.0`, BoT-SORT | Detección de EPP, inferencia CUDA FP16, seguimiento de trabajadores y codificación JPEG. |
| **Backend** | FastAPI `0.142.4`, Uvicorn `0.54.0`, Pydantic `2.13.5`, PyJWT `2.15.1`, Bcrypt `5.0.0` | API RESTful, streaming multipart MJPEG, canal WebSocket autenticado y seguridad JWT/RBAC. |
| **Persistencia** | SQLAlchemy `2.1.4`, SQLite 3 (`PRAGMA journal_mode=WAL`), Sistema de archivos local | Almacenamiento relacional concurrente sin bloqueos y retención de capturas fotográficas. |
| **Frontend** | React `18.3.1`, Vite `5.4`, Tailwind CSS `3.4`, Recharts `2.13`, Lucide React | Estación de monitoreo en tiempo real, gráficos analíticos de 24 h y reportes descargables. |
| **Calidad y Tests** | Python `unittest` (30 tests), `ruff.toml` | Validación de ciclo de vida del motor de video, seguridad criptográfica, esquemas y *cooldown*. |

---

## Estructura del Proyecto

```text
eppDetect/
├── backend/
│   ├── app/
│   │   ├── api/                 # Enrutadores FastAPI (auth, stream, incidents, ws, deps)
│   │   ├── core/                # Configuración global, seguridad JWT/Bcrypt, timezone y botsort_fast.yaml
│   │   ├── domain/              # Modelos ORM SQLAlchemy (User, Incident)
│   │   ├── schemas/             # Contratos de datos y serialización Pydantic v2
│   │   ├── services/            # VideoEngine, CooldownManager, StorageService y WSManager
│   │   └── database.py          # Configuración del motor SQLite en modo WAL
│   ├── storage/
│   │   ├── incidents/           # Evidencias fotográficas generadas (<uuid>.jpg)
│   │   └── uploaded_videos/     # Videos subidos para análisis local
│   ├── tests/                   # Suite de 30 pruebas unitarias del backend
│   ├── consultar_bd.py          # Utilidad CLI para inspección rápida de métricas e incidencias
│   ├── init_db.py               # Inicialización de esquema SQLite y creación de usuarios semilla
│   └── main.py                  # Punto de entrada ASGI, middlewares de seguridad y servidor SPA
├── frontend/
│   ├── src/
│   │   ├── components/          # Navbar, EvidenceModal, DatePicker, Select
│   │   ├── context/             # AuthContext (sesión JWT, estado global y control de sonido)
│   │   ├── services/            # Cliente HTTP resiliente (safeFetch) y sintetizador Web Audio API
│   │   ├── utils/               # Formateadores de fechas, etiquetas SST y URLs autenticadas
│   │   ├── views/               # LoginView, MonitoringView y MetricsView
│   │   ├── App.jsx              # Orquestador de vistas en memoria y cliente WebSocket persistente
│   │   └── main.jsx             # Punto de montaje React 18
│   ├── tailwind.config.js       # Paleta de colores industrial (safety orange/yellow/dark)
│   └── vite.config.js           # Proxy inverso local (/api, /ws) y partición de chunks
├── docs/                        # Auditorías técnicas detalladas (Arquitectura, Backend, Frontend, QA)
├── .env.example                 # Plantilla de variables de entorno
├── requirements.txt             # Dependencias de Python y PyTorch CUDA 12.8
├── ruff.toml                    # Reglas de estilo y análisis estático para Python
└── weights_yolov26s_v1.2.pt     # Pesos entrenados del modelo YOLOv26s para detección de EPP
```

---

## Requisitos Previos

- **Python:** 3.10 o superior (probado en Python 3.12).
- **Node.js:** 18.x o superior (con `npm`).
- **Hardware (Opcional pero recomendado):** GPU NVIDIA compatible con CUDA 12.8 para inferencia en modo FP16 (~3.5 ms por cuadro en RTX 3060 Ti). En ausencia de GPU dedicada, el sistema opera automáticamente sobre CPU.

---

## Instalación y Puesta en Marcha

### 1. Configurar Variables de Entorno

Copie el archivo de plantilla `.env.example` a `.env` en la raíz del proyecto y ajuste los parámetros si es necesario:

```powershell
Copy-Item .env.example .env
```

> [!TIP]
> Si deja `SECRET_KEY` vacío en `.env`, el backend generará automáticamente una clave criptográfica aleatoria en memoria al iniciar. Para persistir sesiones entre reinicios del servidor, defina una clave fija ejecutando:
> `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### 2. Configurar e Iniciar el Backend

Cree o active su entorno virtual de Python, instale las dependencias e inicialice la base de datos SQLite:

```powershell
# Activar entorno virtual en Windows
.\.venv\Scripts\Activate.ps1

# Instalar dependencias (incluye soporte PyTorch CUDA 12.8)
pip install -r requirements.txt

# Inicializar tablas y usuarios por defecto en SQLite
python backend/init_db.py

# Iniciar el servidor FastAPI en http://127.0.0.1:8000
python backend/main.py
```

Al ejecutar `init_db.py`, se registran las siguientes cuentas preconfiguradas:

| Rol | Correo Electrónico | Contraseña Inicial |
| :--- | :--- | :--- |
| **Supervisor de Obra** | `supervisor@obra.com` | `supervisor123` |
| **Administrador SST** | `admin@obra.com` | `admin123` |

### 3. Configurar e Iniciar el Frontend

En una nueva terminal, instale las dependencias de Node.js y levante el servidor de desarrollo de Vite:

```powershell
cd frontend
npm install
npm run dev
```

La interfaz estará disponible en **`http://localhost:3000`**. El servidor de Vite redirige automáticamente las peticiones `/api` y `/ws` hacia `http://127.0.0.1:8000`.

> [!IMPORTANT]
> **Despliegue Unificado en Producción:** Si ejecuta `npm run build` dentro de `frontend/`, se generará el directorio `frontend/dist`. Al reiniciar `python backend/main.py`, FastAPI detectará automáticamente el compilado estático y servirá tanto la aplicación web como la API directamente desde **`http://127.0.0.1:8000`**.

---

## Referencia Rápida de Endpoints

| Método | Ruta | Autenticación | Descripción |
| :---: | :--- | :---: | :--- |
| `POST` | `/api/auth/login` | Pública | Autenticación de usuario con mitigación contra *timing attacks* y emisión de JWT. |
| `GET` | `/api/auth/me` | Bearer JWT | Obtiene el perfil y rol del supervisor en sesión. |
| `GET` | `/api/stream/cameras` | Bearer JWT | Escanea cámaras USB disponibles (con caché de 30 s y exclusión de cámara activa). |
| `POST` | `/api/stream/upload_video` | Bearer JWT | Sube archivos de video locales (`.mp4`, `.avi`, `.mkv`, `.mov`) hasta 3,000 MB. |
| `POST` | `/api/stream/start` | Bearer JWT | Inicia el pipeline de inferencia desde cámara web o archivo de video. |
| `POST` | `/api/stream/stop` | Bearer JWT | Detiene el motor de video y libera los descriptores de hardware. |
| `GET` | `/api/stream/status` | Bearer JWT | Telemetría en vivo: FPS actuales, fuente activa, personas e infracciones en escena. |
| `GET` | `/api/stream/video_feed` | Bearer / Query `?token=` | Flujo continuo `multipart/x-mixed-replace` de fotogramas anotados (MJPEG). |
| `GET` | `/api/incidents` | Bearer JWT | Historial paginado de infracciones con filtros por fecha (`YYYY-MM-DD`) y tipo de EPP. |
| `GET` | `/api/incidents/metrics/summary` | Bearer JWT | KPIs consolidados, infracción predominante y serie horaria de las últimas 24 horas. |
| `GET` | `/api/incidents/{id}/frame` | Bearer / Query `?token=` | Entrega la evidencia fotográfica JPEG validando contención contra *Path Traversal*. |
| `WS` | `/ws/alerts` | Query `?token=` + Origin | Canal WebSocket bidireccional (`ping`/`pong`) para difusión instantánea de alertas. |

---

## Pruebas y Aseguramiento de Calidad

El proyecto cuenta con una suite de **30 pruebas unitarias** en `backend/tests/` que verifican la seguridad criptográfica, la lógica de la ventana de *cooldown*, la serialización de esquemas Pydantic v2, las dependencias de autenticación y el ciclo de vida de los hilos de `VideoEngine`.

Para ejecutar la suite de pruebas desde la raíz del proyecto:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Para inspeccionar rápidamente el estado de la base de datos desde la terminal:

```powershell
.\.venv\Scripts\python.exe backend/consultar_bd.py
```

---

## Documentación Técnica Detallada

Para un análisis exhaustivo de cada subsistema, consulte los informes de auditoría generados en el directorio [`docs/`](docs/):

- [**Análisis de Arquitectura (`docs/ANALISIS_ARQUITECTURA.md`)**](docs/ANALISIS_ARQUITECTURA.md): Topología *Edge*, diagramas de secuencia del pipeline de IA, patrones de diseño, gestión de memoria/VRAM y escalabilidad.
- [**Análisis de Backend (`docs/ANALISIS_BACKEND.md`)**](docs/ANALISIS_BACKEND.md): Detalle de enrutadores FastAPI, concurrencia SQLite WAL, hilos de captura, tracking BoT-SORT y controles de seguridad.
- [**Análisis de Frontend (`docs/ANALISIS_FRONTEND.md`)**](docs/ANALISIS_FRONTEND.md): Arquitectura de componentes React, preservación del stream MJPEG en memoria, síntesis de audio y accesibilidad WCAG 2.2 AA.
- [**Análisis de QA y Testing (`docs/ANALISIS_QA_TESTER.md`)**](docs/ANALISIS_QA_TESTER.md): Cobertura de pruebas actual, diagnóstico de casos límite (*edge cases*), pruebas de resiliencia y hoja de ruta de calidad.
