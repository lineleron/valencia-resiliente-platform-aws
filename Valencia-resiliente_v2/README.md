# València Resiliente · demo conectada

Esta versión convierte los dos prototipos visuales en una prueba funcional. La app ciudadana y la central usan la misma API y la misma base SQLite. Una incidencia solo aparece como recibida cuando el servidor devuelve su identificador `VT-xxxxxx`.

## Puesta en marcha

Necesitas Python 3.9 o posterior. No hay paquetes que instalar.

1. Crea el primer superadministrador. La contraseña no se escribe en el código ni se guarda en el navegador:

   ```bash
   python3 server.py init-admin --username responsable --display-name "Responsable de guardia"
   ```

2. Inicia la demo:

   ```bash
   python3 server.py serve --host 127.0.0.1 --port 4173
   ```

3. Abre las dos vistas:

   - Ciudadanía: <http://127.0.0.1:4173/ciudadano>
   - Central: <http://127.0.0.1:4173/operador>
   - Recepción repetible de ES-Alert para la demo: <http://127.0.0.1:4173/ciudadano?demo=es-alert>

Para abrirla desde otro dispositivo de la misma red, usa `--host 0.0.0.0` y la IP local del ordenador. El acceso real a cámara y geolocalización desde un teléfono requiere HTTPS; para una prueba pública debe colocarse la aplicación detrás de un dominio con certificado TLS.

## Qué está conectado

- La app envía incidencias y respuestas posteriores a una alerta pública.
- La ciudadanía selecciona su zona o la detecta con permiso explícito. Las alertas oficiales se ordenan por criticidad local y se ofrece un resumen general aparte.
- El flujo usa exactamente tres preguntas Sí/No: peligro o presencia en la zona, conocimiento de cómo actuar y necesidad de ayuda. La voz lee automáticamente cada pregunta y, cuando el navegador lo permite, acepta “sí” o “no” por micrófono; los botones permanecen siempre disponibles.
- Al cargar una alerta nueva o una nueva versión desde el simulador de ES-Alert, el diálogo se abre inmediatamente, sin pulsar ningún botón. El navegador consulta cambios cada tres segundos como respaldo; el evento `vt01:es-alert-received` permite una apertura instantánea en la demo. La URL con `?demo=es-alert` fuerza una recepción por recarga para repetir la presentación.
- La combinación peligro = sí y sabe actuar = no crea en el servidor una incidencia alta y ofrece el botón de un toque `tel:112`. Si además necesita ayuda, la prioridad inicial es crítica. Necesitar ayuda junto con cualquier respuesta previa afirmativa crea una incidencia alta sin activar por sí solo la llamada.
- Las combinaciones, la prioridad y la recomendación de llamada se editan en `config/escalation-policy.json`. El servidor vuelve a evaluar siempre la política y no acepta una prioridad impuesta por el navegador.
- El servidor confirma cada alta, evita duplicados con `clientRequestId` y conserva los datos en SQLite.
- La central consulta los cambios cada 2,5 segundos y añade las nuevas incidencias a la cola y al mapa.
- El mismo ciclo de sincronización actualiza la criticidad de cada zona y separa la severidad oficial de la necesidad operativa derivada de respuestas ciudadanas.
- La central recibe una capa espacial actualizada con el mismo ciclo: permite filtrar inundaciones, incendios u otras emergencias, conserva un origen por emergencia y muestra una estimación de dirección y velocidad cuando existen al menos dos avisos geolocalizados y separados en el tiempo.
- El operador puede aceptar, priorizar, verificar, asignar, pedir evidencia y enviar instrucciones.
- La app consulta su caso y muestra el estado y la instrucción enviados desde la central.
- Si se corta la conexión, el cliente conserva la solicitud pendiente y reintenta sin crear otro caso.

## Accesibilidad y reducción de carga cognitiva

- La vista ciudadana principal muestra la alerta prioritaria, su nivel, la acción recomendada, **Responder en 3 pasos**, **Llamar al 112** y tres botones grandes para foto, audio y vídeo. El tipo de emergencia llega definido por la alerta oficial; se ha retirado la selección manual, el formulario libre y los campos secundarios.
- La información crítica combina texto, icono y color; los niveles son `bajo`, `medio`, `alto`, `crítico` y `información insuficiente`.
- La alerta y las preguntas usan `SpeechSynthesis` automáticamente. Las respuestas por voz usan `SpeechRecognition` cuando está disponible; si el navegador bloquea la reproducción o el micrófono, la persona puede repetir la pregunta y responder con los botones. Los avisos destacados usan notificación del sistema y vibración cuando el dispositivo y sus permisos lo permiten.
- Los diálogos nativos conservan el foco y permiten teclado y Escape. Un único botón de **Configuración** reúne idioma, A−/A+, narración, contraste y avisos visuales/vibración; la información de copia sin conexión queda dentro de ese menú. El contraste, los tamaños táctiles y los estados visibles se han preparado con WCAG 2.1 AA como referencia.
- La aplicación permite español, valencià e inglés. El idioma del dispositivo no se envía al servidor.

## Multimedia y priorización asistida

Después de las tres respuestas, la persona puede finalizar o añadir foto, audio o vídeo. Si aún no existe un caso, al confirmar el archivo la app lo crea y lo vincula a la alerta. Tras el consentimiento, el servidor genera una autorización de carga de un solo caso, comprueba tipo, tamaño y firma, almacena el objeto fuera del directorio público y calcula SHA-256. La central es el único lugar desde el que se puede abrir el archivo.

En local, la clasificación aparece de forma visible como **SIMULACIÓN**: usa metadatos y la respuesta ciudadana para proponer una prioridad, no analiza el contenido ni despacha recursos. Cada sugerencia exige revisión humana y permite confirmar, cambiar o rechazar con registro de la decisión. La arquitectura AWS propuesta conecta análisis de imagen, audio y vídeo sin cambiar este contrato ni eliminar la revisión humana.

Los avisos meteorológicos y territoriales incluidos en la demo son datos preparados para el prototipo; no son un feed operativo de GVA 112.

## Mapa y sistema visual

- La central usa Leaflet 1.9.4 incluido en `public/assets/leaflet/`; no depende de un CDN para cargar la librería.
- La vista normal obtiene calles y edificios de OpenStreetMap, conserva el zoom y el desplazamiento elegidos y superpone distritos e incidencias. Si los tiles no están disponibles, cambia al mapa vectorial local y la cola continúa operativa.
- El **Mapa de calor** superpone gravedad, densidad y recencia de los avisos. Inundaciones e incendios se agrupan por emergencia para representar origen y evolución sin mezclar eventos independientes; la dirección y velocidad se identifican como estimadas y solo aparecen cuando hay datos suficientes. El filtro permite ocultar la capa o revisar un tipo de emergencia concreto.
- La vista ciudadana mantiene una lectura sencilla del riesgo de su zona y ofrece un QR visible para abrir `https://valenciaresiliente.duckdns.org/ciudadano` desde otro teléfono durante la demostración.
- Los tiles estándar de OpenStreetMap son adecuados para esta demo de bajo volumen con atribución visible. Antes de un piloto con tráfico real debe contratarse o desplegarse un proveedor de tiles con capacidad y condiciones acordes al uso, siguiendo la [política de uso de tiles de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).
- `public/assets/app-theme.css` aplica el sistema visual compartido. La paleta base es fondo Cloud `#F3F5F5`, texto Graphite `#172126`, acento Operational teal `#0B6B70`, crítico Critical coral `#A70F24` y aviso Warning amber `#856000`. Los dos últimos tonos se han oscurecido para mantener contraste WCAG 2.1 AA cuando contienen texto sobre fondo blanco.
- La central permite cambiar la interfaz entre español, valencià e inglés desde el login o la sesión. La preferencia se guarda en el navegador; los comentarios e instrucciones aportados por personas se conservan en su idioma original y los valores enviados a la API no se traducen.

## Acceso y administradores

- `SuperAdmin`: gestiona incidencias y crea usuarios desde **Administradores**.
- `Operator`: gestiona incidencias, pero el servidor impide que cree usuarios.
- Las nuevas cuentas reciben una contraseña temporal aleatoria que se muestra una sola vez y debe cambiarse en el primer acceso.
- Las contraseñas se derivan con PBKDF2 y sal aleatoria. La sesión usa una cookie `HttpOnly` y `SameSite=Strict`; las operaciones de escritura requieren un token CSRF.
- El servidor aplica límite de intentos de login y registra las acciones principales en auditoría.

Los archivos de datos se crean en `.data/`, que debe permanecer fuera del control de versiones. Esta autenticación es válida para la demo local; el despliegue público debe sustituirla por Amazon Cognito, como se describe en [infra/aws-free-plan.md](infra/aws-free-plan.md).

## Pruebas

```bash
python3 -m unittest -v tests/test_server.py
node --check public/assets/citizen-api.js
node --check public/assets/citizen-v2.js
node --check public/assets/operator-app.js
node --check public/assets/operator-v2.js
node --check public/sw.js
```

La prueba de integración cubre login, cookie, CSRF, roles, creación de administradores, cambio obligatorio de contraseña, idempotencia, sincronización ciudadano–central, actualización central–ciudadano, alertas y agregación por zona, carga binaria real, hash, análisis simulado etiquetado y revisión humana.

## Endpoints añadidos para el piloto

- `GET /api/public/zones` y `GET /api/public/alerts`: catálogo territorial y alertas activas.
- `GET /api/public/escalation-policy`: preguntas, voz y reglas versionadas de escalado.
- `POST /api/public/checkins`: respuesta rápida validada contra alerta, versión y zona; devuelve la decisión y crea una incidencia idempotente cuando una regla lo exige.
- `POST /api/public/incidents/{id}/media-intents`: reserva una carga vinculada a un caso.
- `PUT /api/public/media/{id}`: recibe el archivo con un token de carga efímero.
- `GET /api/admin/dashboard`: incidencias, agregados, criticidad, multimedia y `heatmapFeed` para la central autenticada.
- `GET /api/admin/media/{id}/content` y `PATCH /api/admin/media/{id}/review`: evidencia privada y decisión humana.
