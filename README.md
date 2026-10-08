# EPP SafetyVision - Sistema Local de Monitoreo y Detección de EPP en Obra

Sistema web de alto rendimiento ejecutado **100% de manera local (On-Premise)**, diseñado para optimizar el trabajo del **Supervisor de Obra** al detectar en tiempo real la presencia o ausencia de Equipos de Protección Personal (EPP).

---

## 👷‍♂️ Credenciales Pre-guardadas (Base de Datos Local SQLite)

El sistema cuenta con una política de seguridad estricta: **Solo se permite el ingreso con correo y contraseña pre-registrados en la base de datos**. No existe opción de auto-registro ni recuperación de contraseña. En caso de olvido, se debe contactar al Administrador.

| Rol | Correo Electrónico | Contraseña |
|---|---|---|
| **Supervisor de Obra** | `supervisor@obra.com` | `supervisor123` |
| **Administrador** | `admin@obra.com` | `admin123` |

---

## ⚙️ Reglas de Negocio Implementadas

1. **Tracking y Ventana de Enfriamiento (Cooldown de 60 Segundos):**
   - Cuando se detecta la ausencia de algún EPP en un trabajador (mediante **ByteTrack Multi-Object Tracking** y el modelo `weights_yolov26s_v1.pt`):
     - Se emite una **alerta visual** destacada en la pantalla.
     - Se reproduce una **alerta sonora industrial** inmediata en el navegador mediante la **Web Audio API**.
     - Se guarda el registro de la incidencia en la BD SQLite: `(id, fecha/hora, frame fotográfico, epp ausente, track_id, confianza, fuente)`.
     - El frame con la evidencia visual anotada se almacena en disco local en formato `.jpg` de alta calidad.
   - **Prevención de Duplicados / Spam por Cuadro:** El sujeto queda en seguimiento silencioso durante **60 segundos**. Durante ese minuto, aunque el sujeto continúe en cámara y cambien los frames, no se saturará la base de datos ni el audio.
   - **Reincidencia:** Si transcurrido el minuto exacto el trabajador sigue sin colocarse el EPP correspondiente, se dispara nuevamente el proceso de alerta, guardado de frame y nuevo registro en BD.

2. **Arquitectura Limpia y Principios SOLID:**
   - **Single Responsibility (SRP):** Desacoplamiento entre inferencia YOLO, gestor de cooldowns, persistencia en BD y canal de comunicación WebSockets.
   - **Open/Closed (OCP):** El motor de inferencia soporta cambiar modelos de pesos o fuentes de video sin alterar la lógica de negocio ni la interfaz.
   - **Rendimiento Local Máximo:** Base de datos SQLite configurada con **modo WAL (Write-Ahead Logging)** para lecturas y escrituras asíncronas instantáneas con latencia sub-milisegundo.

---

## 🖥️ Vistas del Sistema

### 1. Vista de Inicio de Sesión (Login)
- Acceso exclusivo con correo y contraseña.
- Mensaje explícito de seguridad instruyendo a comunicarse con el Administrador ante pérdida de credenciales.
- Protección con tokens JWT seguros y hashing con **bcrypt**.

### 2. Vista Principal de Monitoreo
- **Streaming de Video en Vivo:** Video anotado en tiempo real con bounding boxes:
  - **Verde:** EPP presente (`casco`, `chaleco`, `guantes`).
  - **Rojo:** Ausencia de EPP (`sin_casco`, `sin_chaleco`, `sin_guantes`) con Track ID.
- **Selector Dinámico de Fuente:** Alterna entre cámara web (`Índice 0`) y videos de prueba grabados en obra (`demo.mp4`, `demo2.mp4`, `demo3.mp4`).
- **Telemetría en Vivo:** FPS en tiempo real, conteo de personas en escena e infracciones activas.
- **Panel Lateral de Alertas en Tiempo Real:** Actualizado instantáneamente vía **WebSockets** cada vez que se detecta una nueva infracción confirmada.
- **Alerta Sonora:** Control para silenciar/activar alarma industrial con un clic.
- **Visor de Evidencia:** Modal interactivo para ver la fotografía de la infracción en alta resolución.

### 3. Vista de Métricas de Seguridad
- **Tarjetas KPI:** Infracciones del turno actual, total histórico, EPP con mayor tasa de incumplimiento y ventana de cooldown activa.
- **Gráficos Interactivos:**
  - Gráfico de barras por tipo de EPP omitido.
  - Gráfico de área temporal con la frecuencia de incidencias durante las 24 horas del día.
- **Tabla Histórica de Incidencias:**
  - Filtros combinados por tipo de infracción y fecha.
  - Visualización individual de evidencias fotográficas capturadas.
  - **Exportación de Reporte a CSV / Excel** para auditorías de seguridad en obra.

---

## 🚀 Cómo Iniciar el Sistema (Un Solo Clic)

1. En el explorador de archivos de Windows, haz doble clic en:
   ```text
   iniciar_sistema.bat
   ```
2. El script inicializará la base de datos automáticamente, arrancará el servidor local y abrirá tu navegador web en:
   ```text
   http://localhost:8000
   ```

### O mediante la terminal:
```powershell
# 1. Inicializar base de datos
& .venv\Scripts\python.exe backend\init_db.py

# 2. Iniciar servidor FastAPI
& .venv\Scripts\python.exe backend\main.py
```
