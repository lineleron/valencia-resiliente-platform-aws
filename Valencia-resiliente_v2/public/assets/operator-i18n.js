(function () {
  "use strict";

  if (window.VT01I18n) return;

  var STORAGE_KEY = "vt01.operator.language";
  var SUPPORTED = ["es", "val", "en"];
  var currentLanguage = "es";
  var textRecords = new WeakMap();
  var attributeRecords = new WeakMap();
  var boundSwitches = new WeakSet();
  var pendingRoots = new Set();
  var flushScheduled = false;
  var observer = null;

  var catalogue = [
    ["Idioma", "Idioma", "Language"],
    ["Idioma del panel", "Idioma del tauler", "Dashboard language"],
    ["Acceso restringido al personal autorizado de la prueba piloto.", "Accés restringit al personal autoritzat de la prova pilot.", "Access is restricted to authorised pilot staff."],
    ["Usuario", "Usuari", "Username"],
    ["Contraseña", "Contrasenya", "Password"],
    ["Iniciar sesión", "Inicia sessió", "Sign in"],
    ["La contraseña se valida en el servidor y nunca se guarda en el navegador.", "La contrasenya es valida en el servidor i mai es guarda en el navegador.", "The password is validated on the server and is never stored in the browser."],
    ["Crea tu contraseña", "Crea la teua contrasenya", "Create your password"],
    ["Has entrado con una contraseña temporal. Debes cambiarla antes de abrir la central.", "Has entrat amb una contrasenya temporal. Has de canviar-la abans d'obrir la central.", "You signed in with a temporary password. You must change it before opening the control centre."],
    ["Contraseña temporal", "Contrasenya temporal", "Temporary password"],
    ["Nueva contraseña", "Contrasenya nova", "New password"],
    ["Repite la contraseña", "Repetix la contrasenya", "Repeat password"],
    ["Cambiar y continuar", "Canvia i continua", "Change and continue"],
    ["Las contraseñas nuevas no coinciden.", "Les contrasenyes noves no coincidixen.", "The new passwords do not match."],
    ["Sesión de la central", "Sessió de la central", "Control centre session"],
    ["Conectando datos…", "Connectant dades…", "Connecting data…"],
    ["Sincronizando…", "Sincronitzant…", "Syncing…"],
    ["Sin conexión · reintentando", "Sense connexió · reintentant", "Offline · retrying"],
    ["Cambio guardado", "Canvi guardat", "Change saved"],
    ["Actualizando por cambio concurrente…", "Actualitzant per un canvi concurrent…", "Updating after a concurrent change…"],
    ["No se pudo guardar · reintentando", "No s'ha pogut guardar · reintentant", "Could not save · retrying"],
    ["Abrir app ciudadana", "Obri l'app ciutadana", "Open citizen app"],
    ["Administradores", "Administradors", "Administrators"],
    ["Cerrar sesión", "Tanca sessió", "Sign out"],
    ["Superadministrador", "Superadministrador", "Super administrator"],
    ["Operador", "Operador", "Operator"],
    ["La sesión ha caducado. Vuelve a iniciar sesión.", "La sessió ha caducat. Torna a iniciar sessió.", "Your session has expired. Sign in again."],
    ["El servidor ha devuelto una respuesta no válida.", "El servidor ha retornat una resposta no vàlida.", "The server returned an invalid response."],
    ["No se pudo completar la operación.", "No s'ha pogut completar l'operació.", "The operation could not be completed."],
    ["Administradores", "Administradors", "Administrators"],
    ["Crea cuentas individuales y asigna el mínimo permiso necesario.", "Crea comptes individuals i assigna el permís mínim necessari.", "Create individual accounts and grant only the minimum permission required."],
    ["Cerrar", "Tanca", "Close"],
    ["Cargando usuarios…", "Carregant usuaris…", "Loading users…"],
    ["No hay usuarios.", "No hi ha usuaris.", "There are no users."],
    ["Añadir usuario", "Afig un usuari", "Add user"],
    ["Nombre visible", "Nom visible", "Display name"],
    ["Rol", "Rol", "Role"],
    ["Crear usuario", "Crea l'usuari", "Create user"],
    ["Contraseña temporal — se muestra una sola vez", "Contrasenya temporal — es mostra una sola vegada", "Temporary password — shown only once"],
    ["Entrégala por un canal seguro. La persona tendrá que cambiarla al iniciar sesión.", "Entrega-la per un canal segur. La persona haurà de canviar-la en iniciar sessió.", "Share it through a secure channel. The user will have to change it when signing in."],
    ["Copiar contraseña", "Copia la contrasenya", "Copy password"],
    ["Copiada", "Copiada", "Copied"],
    ["Selecciona y copia la contraseña", "Selecciona i copia la contrasenya", "Select and copy the password"],
    ["Cambio de contraseña pendiente", "Canvi de contrasenya pendent", "Password change pending"],
    ["Activo", "Actiu", "Active"],
    ["Inactivo", "Inactiu", "Inactive"],
    ["La contraseña debe tener al menos 12 caracteres.", "La contrasenya ha de tindre almenys 12 caràcters.", "The password must be at least 12 characters long."],
    ["La contraseña es demasiado larga.", "La contrasenya és massa llarga.", "The password is too long."],
    ["La contraseña actual no es correcta.", "La contrasenya actual no és correcta.", "The current password is incorrect."],
    ["Usuario o contraseña incorrectos.", "Usuari o contrasenya incorrectes.", "Incorrect username or password."],
    ["Usuario inválido. Usa 3–64 letras, números, punto, guion o guion bajo.", "Usuari no vàlid. Usa entre 3 i 64 lletres, números, punt, guionet o guió baix.", "Invalid username. Use 3–64 letters, numbers, a full stop, hyphen or underscore."],
    ["Ese usuario ya existe.", "Eixe usuari ja existix.", "That username already exists."],
    ["Inicia sesión para acceder a la central.", "Inicia sessió per a accedir a la central.", "Sign in to access the control centre."],
    ["Debes cambiar la contraseña temporal.", "Has de canviar la contrasenya temporal.", "You must change the temporary password."],
    ["Solo un superadministrador puede realizar esta acción.", "Només un superadministrador pot fer esta acció.", "Only a super administrator can perform this action."],
    ["Solo un superadministrador puede crear usuarios.", "Només un superadministrador pot crear usuaris.", "Only a super administrator can create users."],
    ["La sesión ha cambiado. Recarga la página.", "La sessió ha canviat. Torna a carregar la pàgina.", "The session has changed. Reload the page."],
    ["No hay una sesión activa.", "No hi ha cap sessió activa.", "There is no active session."],

    ["Vista del dashboard de la Central VT-01", "Vista del tauler de la Central VT-01", "VT-01 Control Centre dashboard"],
    ["Central VT-01 · Consciencia situacional", "Central VT-01 · Consciència situacional", "VT-01 Control Centre · Situational awareness"],
    ["SIMULACIÓN", "SIMULACIÓ", "SIMULATION"],
    ["Crear acceso móvil", "Crea un accés mòbil", "Create mobile access"],
    ["Acceso preparado", "Accés preparat", "Access ready"],
    ["Simular llamada", "Simula una telefonada", "Simulate call"],
    ["Simular aviso app", "Simula un avís de l'app", "Simulate app report"],
    ["Salud de los servicios", "Estat dels servicis", "Service health"],
    ["Modo normal", "Mode normal", "Normal mode"],
    ["Modo degradado", "Mode degradat", "Degraded mode"],
    ["Telefonía operativa", "Telefonia operativa", "Phone service operational"],
    ["Telefonía sin enlace", "Telefonia sense connexió", "Phone service disconnected"],
    ["API sin conexión", "API sense connexió", "API offline"],
    ["Base de datos operativa", "Base de dades operativa", "Database operational"],
    ["Cola local activa", "Cua local activa", "Local queue active"],
    ["Mapa disponible", "Mapa disponible", "Map available"],
    ["Visor de mapa no disponible", "Visor del mapa no disponible", "Map viewer unavailable"],
    ["Copia hace 7 min", "Còpia de fa 7 min", "Backup from 7 min ago"],
    ["Probar modo degradado", "Prova el mode degradat", "Test degraded mode"],
    ["Restablecer conexión", "Restablix la connexió", "Restore connection"],
    ["Reintentar visor", "Reintenta el visor", "Retry map viewer"],
    ["Modo degradado:", "Mode degradat:", "Degraded mode:"],
    ["cola local y mapa ya cargado disponibles ·", "cua local i mapa ja carregat disponibles ·", "local queue and previously loaded map available ·"],
    ["cola textual disponible; el visor cartográfico no se ha cargado ·", "cua textual disponible; el visor cartogràfic no s'ha carregat ·", "text queue available; the map viewer has not loaded ·"],
    ["Resumen operativo", "Resum operatiu", "Operational summary"],
    ["Entrando ahora", "Entrant ara", "Incoming now"],
    ["requieren respuesta", "requerixen resposta", "require a response"],
    ["En gestión", "En gestió", "In progress"],
    ["aceptadas", "acceptades", "accepted"],
    ["Verificación humana", "Verificació humana", "Human verification"],
    ["casos confirmados", "casos confirmats", "confirmed cases"],

    ["Respuesta tras alerta pública", "Resposta després de l'alerta pública", "Response after public alert"],
    ["HIPÓTESIS DE DISEÑO · SIMULACIÓN", "HIPÒTESI DE DISSENY · SIMULACIÓ", "DESIGN HYPOTHESIS · SIMULATION"],
    ["Evacuación preventiva por inundación · información pendiente de validar con bomberos", "Evacuació preventiva per inundació · informació pendent de validar amb bombers", "Preventive flood evacuation · information awaiting validation with the fire service"],
    ["Detalle geográfico", "Detall geogràfic", "Geographic detail"],
    ["Nivel de precisión geográfica", "Nivell de precisió geogràfica", "Geographic precision level"],
    ["Zona", "Zona", "Area"],
    ["Calle", "Carrer", "Street"],
    ["Edificio", "Edifici", "Building"],
    ["Ubicación exacta", "Ubicació exacta", "Exact location"],
    ["Simular respuestas", "Simula respostes", "Simulate responses"],
    ["Análisis posterior a la alerta", "Anàlisi posterior a l'alerta", "Post-alert analysis"],
    ["Zonas y cobertura", "Zones i cobertura", "Areas and coverage"],
    ["Comprensión × capacidad", "Comprensió × capacitat", "Understanding × ability"],
    ["Fuentes y privacidad", "Fonts i privacitat", "Sources and privacy"],
    ["Estados de respuesta a la alerta", "Estats de resposta a l'alerta", "Alert response statuses"],
    ["Alerta entregada", "Alerta entregada", "Alert delivered"],
    ["La ha entendido", "L'ha entesa", "Understood"],
    ["Entiende y puede actuar", "Entén i pot actuar", "Understands and can act"],
    ["Entiende, no puede actuar", "Entén, no pot actuar", "Understands, cannot act"],
    ["No ha entendido", "No l'ha entesa", "Not understood"],
    ["Sin respuesta / desconocido", "Sense resposta / desconegut", "No response / unknown"],
    ["seguimiento zonal", "seguiment per zona", "area monitoring"],
    ["posible asistencia", "possible assistència", "possible assistance"],
    ["aclarar mensaje", "aclarir el missatge", "clarify message"],
    ["no inferir situación", "no inferir la situació", "do not infer the situation"],
    ["Denominadores:", "Denominadors:", "Denominators:"],
    ["Sin respuesta significa desconocido:", "Sense resposta significa desconegut:", "No response means unknown:"],
    ["Zona", "Zona", "Area"],
    ["Población", "Població", "Population"],
    ["Respuestas / entregadas", "Respostes / entregades", "Responses / delivered"],
    ["Cobertura", "Cobertura", "Coverage"],
    ["Necesidad y muestra", "Necessitat i mostra", "Need and sample"],
    ["Asistencia prioritaria", "Assistència prioritària", "Priority assistance"],
    ["Revisar / aclarar", "Revisar / aclarir", "Review / clarify"],
    ["Seguimiento", "Seguiment", "Monitoring"],
    ["Sin clasificar", "Sense classificar", "Unclassified"],
    ["Crítica · intervención inmediata", "Crítica · intervenció immediata", "Critical · immediate intervention"],
    ["Alta · asistencia prioritaria", "Alta · assistència prioritària", "High · priority assistance"],
    ["Media · revisar / aclarar", "Mitjana · revisar / aclarir", "Medium · review / clarify"],
    ["Baja · seguimiento", "Baixa · seguiment", "Low · monitoring"],
    ["Información insuficiente", "Informació insuficient", "Insufficient information"],
    ["Oficial:", "Oficial:", "Official:"],
    ["Operativa:", "Operativa:", "Operational:"],
    ["alta", "alta", "high"],
    ["media", "mitjana", "medium"],
    ["baja", "baixa", "low"],
    ["Fuentes de los datos", "Fonts de les dades", "Data sources"],
    ["Los recuentos son agregados; “prefiere no indicar” se conserva como respuesta válida.", "Els recomptes són agregats; «preferix no indicar-ho» es conserva com a resposta vàlida.", "Counts are aggregated; “prefer not to say” is retained as a valid response."],
    ["Enviar aclaración", "Envia un aclariment", "Send clarification"],
    ["Solicitar actualización", "Sol·licita una actualització", "Request update"],
    ["Preparar transporte / asistencia", "Prepara transport / assistència", "Prepare transport / assistance"],
    ["Última acción:", "Última acció:", "Latest action:"],
    ["Sin acción registrada", "Sense cap acció registrada", "No action recorded"],
    ["Matriz de comprensión y capacidad de actuar", "Matriu de comprensió i capacitat d'actuar", "Understanding and ability-to-act matrix"],
    ["Entiende · puede actuar", "Entén · pot actuar", "Understands · can act"],
    ["Entiende · no puede actuar", "Entén · no pot actuar", "Understands · cannot act"],
    ["No entiende · puede actuar", "No entén · pot actuar", "Does not understand · can act"],
    ["No entiende · no puede actuar", "No entén · no pot actuar", "Does not understand · cannot act"],
    ["Acción sugerida: confirmar rutas seguras y mantener seguimiento.", "Acció suggerida: confirmar rutes segures i mantindre el seguiment.", "Suggested action: confirm safe routes and continue monitoring."],
    ["Acción sugerida: valorar transporte, rescate o asistencia específica.", "Acció suggerida: valorar transport, rescat o assistència específica.", "Suggested action: assess transport, rescue or specific assistance."],
    ["Acción sugerida: reenviar instrucciones claras, multilingües y accesibles.", "Acció suggerida: reenviar instruccions clares, multilingües i accessibles.", "Suggested action: resend clear, multilingual and accessible instructions."],
    ["Acción sugerida: aclarar, verificar directamente y valorar asistencia.", "Acció suggerida: aclarir, verificar directament i valorar assistència.", "Suggested action: clarify, verify directly and assess assistance."],
    ["Apoyo a la decisión.", "Suport a la decisió.", "Decision support."],
    ["La matriz orienta la lectura inicial; no asigna prioridad ni moviliza recursos automáticamente. El operador debe comprobar ubicación, necesidad, personas implicadas, contacto o verificación y antigüedad antes de decidir.", "La matriu orienta la lectura inicial; no assigna prioritat ni mobilitza recursos automàticament. L'operador ha de comprovar la ubicació, la necessitat, les persones implicades, el contacte o la verificació i l'antiguitat abans de decidir.", "The matrix supports the initial assessment; it does not assign priority or deploy resources automatically. The operator must check location, need, people involved, contact or verification, and age before deciding."],
    ["Respuesta directa", "Resposta directa", "Direct response"],
    ["Agregado zonal", "Agregat per zona", "Area aggregate"],
    ["Confianza visible", "Confiança visible", "Visible confidence"],
    ["Preparar mensaje accesible", "Prepara un missatge accessible", "Prepare accessible message"],
    ["Abrir revisión de asistencia", "Obri la revisió d'assistència", "Open assistance review"],
    ["Minimización", "Minimització", "Data minimisation"],
    ["Mostrar primero datos agregados. Abrir calle, edificio o coordenada solo por necesidad operativa y con perfil autorizado.", "Mostra primer dades agregades. Obri el carrer, l'edifici o la coordenada només per necessitat operativa i amb un perfil autoritzat.", "Show aggregated data first. Open a street, building or coordinate only when operationally necessary and with an authorised profile."],
    ["Retención propuesta", "Retenció proposada", "Proposed retention"],
    ["Datos personales y multimedia: 24 h tras el cierre del ejercicio; después, eliminación o anonimización. Plazo pendiente de validación legal y operativa.", "Dades personals i multimèdia: 24 h després del tancament de l'exercici; després, eliminació o anonimització. Termini pendent de validació legal i operativa.", "Personal data and media: 24 hours after the exercise closes; then deletion or anonymisation. The period is awaiting legal and operational validation."],
    ["Acceso auditado", "Accés auditat", "Audited access"],
    ["Cada consulta de ubicación precisa deja operador, caso, hora y finalidad.", "Cada consulta d'ubicació precisa registra l'operador, el cas, l'hora i la finalitat.", "Every precise-location query records the operator, case, time and purpose."],
    ["PENDIENTE DE VALIDAR", "PENDENT DE VALIDAR", "AWAITING VALIDATION"],
    ["Detalle seleccionado:", "Detall seleccionat:", "Selected detail:"],
    ["Zona general visible para coordinación.", "Zona general visible per a coordinació.", "General area visible for coordination."],
    ["Calle visible para personal autorizado.", "Carrer visible per al personal autoritzat.", "Street visible to authorised staff."],
    ["Edificio visible solo cuando la operación lo requiere.", "Edifici visible només quan l'operació ho requerix.", "Building visible only when the operation requires it."],
    ["Coordenada exacta restringida, justificada y auditada.", "Coordenada exacta restringida, justificada i auditada.", "Exact coordinate restricted, justified and audited."],
    ["Ocultar registro", "Oculta el registre", "Hide access log"],
    ["Ver registro de accesos", "Mostra el registre d'accessos", "View access log"],
    ["Clasificación de fuentes", "Classificació de fonts", "Source classification"],
    ["Ciudadano directo", "Ciutadà directe", "Direct citizen report"],
    ["Operador verificado", "Operador verificat", "Operator verified"],
    ["Sensor / externo", "Sensor / extern", "Sensor / external"],
    ["Estimado", "Estimat", "Estimated"],
    ["Estimado por el sistema", "Estimat pel sistema", "System estimate"],
    ["Sesión conectada", "Sessió connectada", "Connected session"],
    ["La fuente, el método de verificación, el tamaño de muestra y la antigüedad siempre se muestran. Una estimación nunca se presenta como respuesta ciudadana.", "La font, el mètode de verificació, la grandària de la mostra i l'antiguitat sempre es mostren. Una estimació mai es presenta com a resposta ciutadana.", "The source, verification method, sample size and age are always shown. An estimate is never presented as a citizen response."],
    ["Registro simulado:", "Registre simulat:", "Simulated log:"],
    ["zona general consultada · finalidad: valorar asistencia. No se ha abierto ubicación exacta.", "zona general consultada · finalitat: valorar assistència. No s'ha obert la ubicació exacta.", "general area viewed · purpose: assess assistance. Exact location was not opened."],

    ["Mapa operativo", "Mapa operatiu", "Operational map"],
    ["Criticidad territorial y análisis multimedia", "Criticitat territorial i anàlisi multimèdia", "Area criticality and multimedia analysis"],
    ["Centrar el mapa en València", "Centra el mapa en València", "Centre map on València"],
    ["Centrar València", "Centra València", "Centre València"],
    ["Mostrar", "Mostra", "Show"],
    ["Color del mapa", "Color del mapa", "Map colour"],
    ["Necesidad por zona", "Necessitat per zona", "Need by area"],
    ["Prioridad de incidencias", "Prioritat de les incidències", "Incident priority"],
    ["Tipo de incidencia", "Tipus d'incidència", "Incident type"],
    ["Mapa de calor", "Mapa de calor", "Heatmap"],
    ["Emergencia", "Emergència", "Emergency"],
    ["Filtrar mapa de calor por tipo de emergencia", "Filtra el mapa de calor per tipus d'emergència", "Filter heatmap by emergency type"],
    ["Todas", "Totes", "All"],
    ["Otras", "Altres", "Other"],
    ["Leyenda del mapa", "Llegenda del mapa", "Map legend"],
    ["Mapa urbano interactivo de València con zoom, desplazamiento, zonas e incidencias", "Mapa urbà interactiu de València amb zoom, desplaçament, zones i incidències", "Interactive street map of València with zoom, panning, areas and incidents"],
    ["Mapa de incidencias activas de València", "Mapa d'incidències actives de València", "Map of active incidents in València"],
    ["Distritos oficiales de València con respuesta zonal e incidencias ficticias seleccionables. Los avisos sin GPS permanecen únicamente en la cola.", "Districtes oficials de València amb resposta per zona i incidències fictícies seleccionables. Els avisos sense GPS es mantenen únicament en la cua.", "Official València districts with area responses and selectable fictional incidents. Reports without GPS remain in the queue only."],
    ["El visor cartográfico no está disponible. La cola mantiene la zona, la precisión GPS y la antigüedad para continuar la operación.", "El visor cartogràfic no està disponible. La cua manté la zona, la precisió GPS i l'antiguitat per a continuar l'operació.", "The map viewer is unavailable. The queue retains the area, GPS accuracy and age so work can continue."],
    ["Capa operativa: distritos Ajuntament de València · incidencias ficticias", "Capa operativa: districtes de l'Ajuntament de València · incidències fictícies", "Operational layer: Ajuntament de València districts · fictional incidents"],
    ["Asistencia prioritaria", "Assistència prioritària", "Priority assistance"],
    ["Revisar", "Revisar", "Review"],
    ["Sin muestra", "Sense mostra", "No sample"],
    ["Color violeta/azul = necesidad · opacidad = tamaño de muestra", "Color violeta/blau = necessitat · opacitat = grandària de la mostra", "Purple/blue = need · opacity = sample size"],
    ["Inundación", "Inundació", "Flood"],
    ["Incendio", "Incendi", "Fire"],
    ["Lluvia", "Pluja", "Rain"],
    ["Otro", "Un altre", "Other"],
    ["Alta", "Alta", "High"],
    ["Crítica", "Crítica", "Critical"],
    ["Media", "Mitjana", "Medium"],
    ["Baja", "Baixa", "Low"],
    ["Sin valorar", "Sense valorar", "Not assessed"],
    ["GPS pendiente", "GPS pendent", "GPS pending"],
    ["Distrito", "Districte", "District"],
    ["Mapa de calles no disponible; se mantiene la cartografía operativa sin conexión", "Mapa de carrers no disponible; es manté la cartografia operativa sense connexió", "Street map unavailable; offline operational mapping remains available"],
    ["Cola unificada · llamadas + app", "Cua unificada · telefonades + app", "Unified queue · calls + app"],
    ["Detalle del aviso seleccionado", "Detall de l'avís seleccionat", "Selected report details"],
    ["Escalado automático", "Escalat automàtic", "Automatic escalation"],
    ["regla configurada", "regla configurada", "configured rule"],
    ["Política", "Política", "Policy"],
    ["peligro:", "perill:", "danger:"],
    ["sabe actuar:", "sap actuar:", "knows what to do:"],
    ["necesita ayuda:", "necessita ajuda:", "needs help:"],
    ["Llamada 112 recomendada", "Telefonada al 112 recomanada", "112 call recommended"],
    ["Trazabilidad del triaje", "Traçabilitat del triatge", "Triage traceability"],
    ["Alerta", "Alerta", "Alert"],
    ["Check-in", "Check-in", "Check-in"],
    ["Prioridad inicial automática; requiere verificación humana.", "Prioritat inicial automàtica; requerix verificació humana.", "Automatic initial priority; human verification required."],
    ["Sí", "Sí", "Yes"],
    ["No", "No", "No"],

    ["Entrando", "Entrant", "Incoming"],
    ["Cerrada", "Tancada", "Closed"],
    ["App móvil", "App mòbil", "Mobile app"],
    ["App móvil · sincronizada", "App mòbil · sincronitzada", "Mobile app · synced"],
    ["Llamada VT-01", "Telefonada VT-01", "VT-01 call"],
    ["Ubicación pendiente", "Ubicació pendent", "Location pending"],
    ["Posible duplicado ×", "Possible duplicat ×", "Possible duplicate ×"],
    ["Grupo de", "Grup de", "Group of"],
    ["≤ 5 min · reciente", "≤ 5 min · recent", "≤ 5 min · recent"],
    ["6–15 min · vigente", "6–15 min · vigent", "6–15 min · current"],
    ["16–30 min · revisar", "16–30 min · revisar", "16–30 min · review"],
    ["> 30 min · dato antiguo", "> 30 min · dada antiga", "> 30 min · old data"],
    ["DANA / inundación", "DANA / inundació", "DANA / flood"],
    ["Lluvia intensa", "Pluja intensa", "Heavy rain"],
    ["Vía bloqueada", "Via bloquejada", "Blocked road"],
    ["Otra emergencia", "Una altra emergència", "Other emergency"],
    ["Llamada entrante", "Telefonada entrant", "Incoming call"],
    ["Evacuación asistida", "Evacuació assistida", "Assisted evacuation"],
    ["Comprobar incendio y proteger perímetro", "Comprovar l'incendi i protegir el perímetre", "Check the fire and secure the perimeter"],
    ["Señalizar vía anegada", "Senyalitzar la via inundada", "Mark the flooded road"],
    ["Por confirmar", "Per confirmar", "To be confirmed"],
    ["Persona aislada; el agua continúa subiendo.", "Persona aïllada; l'aigua continua pujant.", "Person cut off; the water continues to rise."],
    ["Humo visible en garaje comunitario.", "Fum visible en el garatge comunitari.", "Smoke visible in a shared garage."],
    ["Paso inferior anegado; circulación detenida.", "Pas inferior inundat; circulació detinguda.", "Underpass flooded; traffic stopped."],
    ["Árbol caído sobre un carril.", "Arbre caigut sobre un carril.", "Tree fallen across a lane."],
    ["Persona solicita ayuda desde una planta baja.", "Una persona demana ajuda des d'una planta baixa.", "A person is requesting help from a ground floor."],
    ["La persona informa de una emergencia; faltan ubicación y evidencia.", "La persona informa d'una emergència; falten la ubicació i les proves.", "The caller reports an emergency; location and evidence are missing."],
    ["Estoy a salvo", "Estic fora de perill", "I am safe"],
    ["Necesito ayuda", "Necessite ajuda", "I need help"],
    ["No puedo salir", "No puc eixir", "I cannot get out"],
    ["Sin confirmar", "Sense confirmar", "Unconfirmed"],
    ["Sin respuesta", "Sense resposta", "No response"],
    ["Sin comentario", "Sense comentaris", "No comment"],
    ["Número oculto", "Número ocult", "Hidden number"],
    ["Sin asignar", "Sense assignar", "Unassigned"],
    ["Pendiente", "Pendent", "Pending"],
    ["Policía local", "Policia local", "Local police"],
    ["Protección Civil", "Protecció Civil", "Civil Protection"],

    ["Verificación", "Verificació", "Verification"],
    ["Coordinación", "Coordinació", "Coordination"],
    ["Cronología y CAP", "Cronologia i CAP", "Timeline and CAP"],
    ["Prioridad", "Prioritat", "Priority"],
    ["Prioridad del aviso", "Prioritat de l'avís", "Report priority"],
    ["Aceptar incidencia", "Accepta la incidència", "Accept incident"],
    ["Incidencia aceptada", "Incidència acceptada", "Incident accepted"],
    ["Incidencia cerrada", "Incidència tancada", "Incident closed"],
    ["Cerrar tras aceptar", "Tanca després d'acceptar", "Close after accepting"],
    ["Cerrar incidencia", "Tanca la incidència", "Close incident"],
    ["Confirmar cierre", "Confirma el tancament", "Confirm closure"],
    ["Información del caso", "Informació del cas", "Case information"],
    ["Fuente:", "Font:", "Source:"],
    ["Confianza:", "Confiança:", "Confidence:"],
    ["Frescura:", "Actualitat:", "Freshness:"],
    ["Por revisar", "Per revisar", "To review"],
    ["Detalle geográfico · acceso por necesidad", "Detall geogràfic · accés segons la necessitat", "Geographic detail · need-based access"],
    ["vista agregada", "vista agregada", "aggregated view"],
    ["Calle disponible para personal autorizado", "Carrer disponible per al personal autoritzat", "Street available to authorised staff"],
    ["Edificio restringido · acceso según necesidad operativa", "Edifici restringit · accés segons la necessitat operativa", "Restricted building · access based on operational need"],
    ["acceso exacto auditado", "accés exacte auditat", "audited exact access"],
    ["nivel seleccionado:", "nivell seleccionat:", "selected level:"],
    ["1 · Contacto", "1 · Contacte", "1 · Contact"],
    ["2 · Ubicación", "2 · Ubicació", "2 · Location"],
    ["3 · Evidencia", "3 · Evidència", "3 · Evidence"],
    ["4 · Decisión humana", "4 · Decisió humana", "4 · Human decision"],
    ["Callback o conversación confirmada", "Callback o conversa confirmada", "Callback or conversation confirmed"],
    ["Callback pendiente", "Callback pendent", "Callback pending"],
    ["Ubicación aún no compartida", "Ubicació encara no compartida", "Location not shared yet"],
    ["Sin imagen vinculada", "Sense cap imatge vinculada", "No linked image"],
    ["Estado manual:", "Estat manual:", "Manual status:"],
    ["La fotografía y el GPS son indicios: por sí solos no verifican el aviso. Solo una decisión humana cambia su estado.", "La fotografia i el GPS són indicis: per si mateixos no verifiquen l'avís. Només una decisió humana en canvia l'estat.", "The photo and GPS are indicators: they do not verify the report by themselves. Only a human decision changes its status."],
    ["Confirmado", "Confirmat", "Confirmed"],
    ["No confirmado", "No confirmat", "Not confirmed"],
    ["Requiere revisión", "Requerix revisió", "Needs review"],
    ["Estado:", "Estat:", "Status:"],
    ["Registrar callback completado", "Registra el callback completat", "Record completed callback"],
    ["Cambiar estado de verificación", "Canvia l'estat de verificació", "Change verification status"],
    ["Coincidencia detectada", "Coincidència detectada", "Match detected"],
    ["Grupo consolidado", "Grup consolidat", "Consolidated group"],
    ["Los avisos se mantienen como casos individuales.", "Els avisos es mantenen com a casos individuals.", "Reports remain as individual cases."],
    ["Ubicación", "Ubicació", "Location"],
    ["Necesidad", "Necessitat", "Need"],
    ["Personas", "Persones", "People"],
    ["Contacto / verificación", "Contacte / verificació", "Contact / verification"],
    ["Antigüedad ≤ 15 min", "Antiguitat ≤ 15 min", "Age ≤ 15 min"],
    ["Checklist de apoyo: completar los cinco datos no ordena el despacho. La decisión y la prioridad siguen siendo humanas.", "Llista de suport: completar les cinc dades no ordena el despatx. La decisió i la prioritat continuen sent humanes.", "Support checklist: completing all five items does not order deployment. The decision and priority remain human."],
    ["Revisión registrada", "Revisió registrada", "Review recorded"],
    ["Registrar revisión previa", "Registra la revisió prèvia", "Record prior review"],
    ["Responsable y recurso", "Responsable i recurs", "Lead and resource"],
    ["Responsable", "Responsable", "Lead"],
    ["Unidad", "Unitat", "Unit"],
    ["Solicitudes de evidencia", "Sol·licituds de proves", "Evidence requests"],
    ["Fotografía", "Fotografia", "Photo"],
    ["Vídeo", "Vídeo", "Video"],
    ["No solicitada", "No sol·licitada", "Not requested"],
    ["Solicitada · pendiente", "Sol·licitada · pendent", "Requested · pending"],
    ["Recibida", "Rebuda", "Received"],
    ["Solicitar foto", "Sol·licita una foto", "Request photo"],
    ["Solicitar vídeo", "Sol·licita un vídeo", "Request video"],
    ["Registrar recepción", "Registra la recepció", "Record receipt"],
    ["Fotografía recibida", "Fotografia rebuda", "Photo received"],
    ["Vídeo recibida", "Vídeo rebut", "Video received"],
    ["Central → ciudadano", "Central → ciutadà", "Control centre → citizen"],
    ["Ciudadano → central", "Ciutadà → central", "Citizen → control centre"],
    ["Sin enviar", "Sense enviar", "Not sent"],
    ["Aún no se han enviado instrucciones.", "Encara no s'han enviat instruccions.", "No instructions have been sent yet."],
    ["No puede hablar", "No pot parlar", "Cannot speak"],
    ["Instrucción segura", "Instrucció segura", "Safe instruction"],
    ["Enviar instrucción", "Envia la instrucció", "Send instruction"],
    ["Suba a una planta superior", "Puge a una planta superior", "Move to an upper floor"],
    ["Permanezca en un lugar seguro", "Quede's en un lloc segur", "Remain in a safe place"],
    ["Evite el paso inferior", "Evite el pas inferior", "Avoid the underpass"],
    ["Confirme si necesita ayuda", "Confirme si necessita ajuda", "Confirm whether you need help"],
    ["Comparta su ubicación si puede hacerlo con seguridad", "Compartisca la seua ubicació si pot fer-ho amb seguretat", "Share your location if you can do so safely"],
    ["Enviado", "Enviat", "Sent"],
    ["Recibido", "Rebut", "Received"],
    ["Leído", "Llegit", "Read"],
    ["Cronología del caso", "Cronologia del cas", "Case timeline"],
    ["Ocultar borrador CAP", "Oculta l'esborrany CAP", "Hide CAP draft"],
    ["Ver borrador CAP · ejercicio", "Mostra l'esborrany CAP · exercici", "View CAP draft · exercise"],
    ["Exportar CAP de ejercicio", "Exporta el CAP de l'exercici", "Export exercise CAP"],

    ["Movilidad reducida", "Mobilitat reduïda", "Reduced mobility"],
    ["Falta de transporte", "Falta de transport", "No transport"],
    ["Menores o dependientes", "Menors o dependents", "Children or dependants"],
    ["Necesidad médica o medicación", "Necessitat mèdica o medicació", "Medical need or medication"],
    ["Ruta bloqueada", "Ruta bloquejada", "Blocked route"],
    ["Otro / prefiere no indicar", "Un altre / preferix no indicar-ho", "Other / prefer not to say"],

    ["Aviso recibido desde la app", "Avís rebut des de l'app", "Report received from the app"],
    ["Aviso recibido desde la aplicación ciudadana", "Avís rebut des de l'aplicació ciutadana", "Report received from the citizen app"],
    ["Ubicación compartida · precisión ± 12 m", "Ubicació compartida · precisió ± 12 m", "Location shared · accuracy ± 12 m"],
    ["Ubicación compartida · precisión ± 9 m", "Ubicació compartida · precisió ± 9 m", "Location shared · accuracy ± 9 m"],
    ["Fotografía recibida y vinculada al caso", "Fotografia rebuda i vinculada al cas", "Photo received and linked to the case"],
    ["Llamada VT-01 recibida", "Telefonada VT-01 rebuda", "VT-01 call received"],
    ["Callback completado", "Callback completat", "Callback completed"],
    ["Unidad B-14 asignada", "Unitat B-14 assignada", "Unit B-14 assigned"],
    ["Instrucción marcada como leída", "Instrucció marcada com a llegida", "Instruction marked as read"],
    ["Incidencia aceptada por Joan P.", "Incidència acceptada per Joan P.", "Incident accepted by Joan P."],
    ["Enlace seguro enviado; ubicación pendiente", "Enllaç segur enviat; ubicació pendent", "Secure link sent; location pending"],
    ["Caso marcado no confirmado; requiere seguimiento", "Cas marcat com a no confirmat; requerix seguiment", "Case marked unconfirmed; follow-up required"],
    ["Aviso app recibido con GPS y fotografía", "Avís de l'app rebut amb GPS i fotografia", "App report received with GPS and photo"],
    ["Llamada VT-01 recibida; ubicación pendiente", "Telefonada VT-01 rebuda; ubicació pendent", "VT-01 call received; location pending"]
  ];

  var exact = {val: Object.create(null), en: Object.create(null)};
  catalogue.forEach(function (entry) {
    exact.val[entry[0]] = entry[1];
    exact.en[entry[0]] = entry[2];
  });

  var phraseEntries = catalogue.slice().sort(function (a, b) {
    return b[0].length - a[0].length;
  });

  var patterns = [
    [/^Sincronizado · (.+)$/, function (match, language) { return (language === "val" ? "Sincronitzat · " : "Synced · ") + match[1]; }],
    [/^Guardando (.+)…$/, function (match, language) { return (language === "val" ? "Guardant " : "Saving ") + match[1] + "…"; }],
    [/^Copia hace (\d+) min$/, function (match, language) { return language === "val" ? "Còpia de fa " + match[1] + " min" : "Backup from " + match[1] + " min ago"; }],
    [/^(\d+) cambios pendientes de sincronizar\.$/, function (match, language) { return language === "val" ? match[1] + " canvis pendents de sincronitzar." : match[1] + " changes waiting to sync."; }],
    [/^(\d+) cambios pendientes\.$/, function (match, language) { return language === "val" ? match[1] + " canvis pendents." : match[1] + " pending changes."; }],
    [/^actualizada hace (\d+) min$/, function (match, language) { return language === "val" ? "actualitzada fa " + match[1] + " min" : "updated " + match[1] + " min ago"; }],
    [/^actualizado ahora$/, function (match, language) { return language === "val" ? "actualitzat ara" : "updated now"; }],
    [/^actualizada ahora$/, function (match, language) { return language === "val" ? "actualitzada ara" : "updated now"; }],
    [/^hace (\d+) s$/, function (match, language) { return language === "val" ? "fa " + match[1] + " s" : match[1] + " sec ago"; }],
    [/^hace (\d+) min$/, function (match, language) { return language === "val" ? "fa " + match[1] + " min" : match[1] + " min ago"; }],
    [/^(\d[\d.,]*) estimadas$/, function (match, language) { return language === "val" ? match[1] + " estimades" : match[1] + " estimated"; }],
    [/^muestra (alta|media|baja) · n=(.+)$/, function (match, language) { var level = translateValue(match[1], language); return language === "val" ? "mostra " + level + " · n=" + match[2] : level + " sample · n=" + match[2]; }],
    [/^(\d[\d.,]*) respuestas simuladas\.$/, function (match, language) { return language === "val" ? match[1] + " respostes simulades." : match[1] + " simulated responses."; }],
    [/^(\d[\d.,]*) respuestas de la muestra indican que entienden la alerta pero no pueden actuar\.$/, function (match, language) { return language === "val" ? match[1] + " respostes de la mostra indiquen que entenen l'alerta però no poden actuar." : match[1] + " sample responses indicate that people understand the alert but cannot act."; }],
    [/^(\d+) fotografía vinculada$/, function (match, language) { return language === "val" ? match[1] + " fotografia vinculada" : match[1] + " linked photo"; }],
    [/^(\d+) fotografías vinculadas$/, function (match, language) { return language === "val" ? match[1] + " fotografies vinculades" : match[1] + " linked photos"; }],
    [/^(\d+) archivo$/, function (match, language) { return language === "val" ? match[1] + " arxiu" : match[1] + " file"; }],
    [/^(\d+) archivos$/, function (match, language) { return language === "val" ? match[1] + " arxius" : match[1] + " files"; }],
    [/^(\d+) avisos próximos en tiempo y ubicación\.$/, function (match, language) { return language === "val" ? match[1] + " avisos pròxims en el temps i la ubicació." : match[1] + " reports close in time and location."; }],
    [/^Agrupar (\d+) avisos relacionados$/, function (match, language) { return language === "val" ? "Agrupa " + match[1] + " avisos relacionats" : "Group " + match[1] + " related reports"; }],
    [/^Revisión mínima antes de movilizar · (\d+)\/5$/, function (match, language) { return (language === "val" ? "Revisió mínima abans de mobilitzar · " : "Minimum review before deployment · ") + match[1] + "/5"; }],
    [/^Detalle de (.+)$/, function (match, language) { return (language === "val" ? "Detall de " : "Details for ") + match[1]; }],
    [/^(.+) · motivos para no evacuar$/, function (match, language) { return match[1] + (language === "val" ? " · motius per a no evacuar" : " · reasons for not evacuating"); }],
    [/^Seleccionar (.+)$/, function (match, language) { return (language === "val" ? "Selecciona " : "Select ") + replacePhrases(match[1], language); }],
    [/^Zona seleccionada: (.+)$/, function (match, language) { return (language === "val" ? "Zona seleccionada: " : "Selected area: ") + match[1]; }],
    [/^Zona seleccionada en el mapa: (.+)$/, function (match, language) { return (language === "val" ? "Zona seleccionada en el mapa: " : "Area selected on the map: ") + match[1]; }],
    [/^Aviso (.+) seleccionado en el mapa$/, function (match, language) { return language === "val" ? "Avís " + match[1] + " seleccionat en el mapa" : "Report " + match[1] + " selected on the map"; }],
    [/^Aviso app (.+) añadido a la cola$/, function (match, language) { return language === "val" ? "Avís de l'app " + match[1] + " afegit a la cua" : "App report " + match[1] + " added to the queue"; }],
    [/^Llamada (.+) añadida solo a la cola hasta recibir GPS$/, function (match, language) { return language === "val" ? "Telefonada " + match[1] + " afegida només a la cua fins a rebre el GPS" : "Call " + match[1] + " added only to the queue until GPS is received"; }],
    [/^Actualización solicitada para (.+)$/, function (match, language) { return language === "val" ? "Actualització sol·licitada per a " + match[1] : "Update requested for " + match[1]; }],
    [/^Confirma el cierre de (.+)$/, function (match, language) { return language === "val" ? "Confirma el tancament de " + match[1] : "Confirm closure of " + match[1]; }]
  ];

  function normalizeLanguage(value) {
    var candidate = String(value || "").toLowerCase().replace("_", "-");
    if (candidate === "val" || candidate === "ca" || candidate.indexOf("ca-") === 0) return "val";
    if (candidate === "en" || candidate.indexOf("en-") === 0) return "en";
    if (candidate === "es" || candidate.indexOf("es-") === 0) return "es";
    return null;
  }

  function readSavedLanguage() {
    try { return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY)) || "es"; }
    catch (error) { return "es"; }
  }

  function saveLanguage(language) {
    try { window.localStorage.setItem(STORAGE_KEY, language); }
    catch (error) {}
  }

  function replacePhrases(value, language) {
    var translated = value;
    phraseEntries.forEach(function (entry) {
      var source = entry[0], replacement = language === "val" ? entry[1] : entry[2];
      if (/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(source)) {
        var escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        translated = translated.replace(new RegExp("\\b" + escaped + "\\b", "g"), replacement);
      } else if (translated.indexOf(source) !== -1) translated = translated.split(source).join(replacement);
    });
    return translated;
  }

  function replaceDynamicFragments(value, language) {
    var valencian = language === "val";
    return value
      .replace(/\bactualizada hace (\d+) min\b/g, function (_, amount) { return valencian ? "actualitzada fa " + amount + " min" : "updated " + amount + " min ago"; })
      .replace(/\bhace (\d+) s\b/g, function (_, amount) { return valencian ? "fa " + amount + " s" : amount + " sec ago"; })
      .replace(/\bhace (\d+) min\b/g, function (_, amount) { return valencian ? "fa " + amount + " min" : amount + " min ago"; })
      .replace(/\bde (\d[\d.,]*) estimadas\b/g, function (_, amount) { return valencian ? "de " + amount + " estimades" : "of " + amount + " estimated"; })
      .replace(/\b(\d+)% de entregadas\b/g, function (_, amount) { return valencian ? amount + "% de les entregades" : amount + "% of delivered alerts"; })
      .replace(/\b(\d+) fotos\b/g, function (_, amount) { return valencian ? amount + " fotos" : amount + " photos"; })
      .replace(/\b(\d+) foto\b/g, function (_, amount) { return valencian ? amount + " foto" : amount + " photo"; })
      .replace(/\b(\d+) vídeos\b/g, function (_, amount) { return valencian ? amount + " vídeos" : amount + " videos"; })
      .replace(/\b(\d+) vídeo\b/g, function (_, amount) { return valencian ? amount + " vídeo" : amount + " video"; })
      .replace(/\b(\d+) archivos\b/g, function (_, amount) { return valencian ? amount + " arxius" : amount + " files"; })
      .replace(/\b(\d+) archivo\b/g, function (_, amount) { return valencian ? amount + " arxiu" : amount + " file"; })
      .replace(/\bprioridad\b/g, valencian ? "prioritat" : "priority")
      .replace(/\bubicación pendiente\b/g, valencian ? "ubicació pendent" : "location pending")
      .replace(/población potencial estimada/g, valencian ? "població potencial estimada" : "estimated potential population")
      .replace(/alerta entregada/g, valencian ? "alerta entregada" : "alert delivered")
      .replace(/respuesta activa/g, valencian ? "resposta activa" : "active response")
      .replace(/respuestas de la muestra indican que entienden la alerta pero no pueden actuar/g, valencian ? "respostes de la mostra indiquen que entenen l'alerta però no poden actuar" : "sample responses indicate that people understand the alert but cannot act")
      .replace(/nunca se interpreta como seguridad ni peligro/g, valencian ? "mai s'interpreta com a seguretat ni perill" : "it must never be interpreted as safe or dangerous");
  }

  function translateValue(value, language, exactOnly) {
    if (language === "es" || !value) return value;
    if (Object.prototype.hasOwnProperty.call(exact[language], value)) return exact[language][value];
    for (var index = 0; index < patterns.length; index += 1) {
      var match = value.match(patterns[index][0]);
      if (match) return patterns[index][1](match, language);
    }
    return exactOnly ? value : replaceDynamicFragments(replacePhrases(value, language), language);
  }

  function splitWhitespace(value) {
    var leading = (value.match(/^\s*/) || [""])[0];
    var trailing = (value.match(/\s*$/) || [""])[0];
    return {leading: leading, content: value.slice(leading.length, value.length - trailing.length), trailing: trailing};
  }

  function shouldSkipElement(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.closest && element.closest("[data-vt01-i18n-ignore]")) return true;
    if (element.closest && element.closest("[contenteditable='true']")) return true;
    if (element.closest && element.closest("#session-name, #temp-password, .admin-row > div:first-child, .v-summary, .v-detail-copy, .v-message strong, .v-cap-preview")) return true;
    return /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|CODE|PRE)$/.test(element.tagName);
  }

  function translateTextNode(node) {
    var parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;
    var current = node.nodeValue;
    if (!current || !current.trim()) return;
    var record = textRecords.get(node);
    var source = record && current === record.output ? record.source : current;
    var parts = splitWhitespace(source);
    var output = parts.leading + translateValue(parts.content, currentLanguage, parent.tagName === "OPTION") + parts.trailing;
    textRecords.set(node, {source: source, output: output});
    if (current !== output) node.nodeValue = output;
  }

  function translateAttribute(element, name) {
    if (!element.hasAttribute(name)) return;
    var current = element.getAttribute(name);
    if (!current || !current.trim()) return;
    var records = attributeRecords.get(element);
    if (!records) { records = Object.create(null); attributeRecords.set(element, records); }
    var record = records[name];
    var source = record && current === record.output ? record.source : current;
    var output = translateValue(source, currentLanguage);
    records[name] = {source: source, output: output};
    if (current !== output) element.setAttribute(name, output);
  }

  function translateTree(node) {
    if (!node) return;
    if (node.nodeType === 3) { translateTextNode(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (shouldSkipElement(node)) return;
      ["aria-label", "aria-description", "title", "alt", "placeholder"].forEach(function (name) { translateAttribute(node, name); });
    }
    Array.prototype.forEach.call(node.childNodes || [], translateTree);
  }

  function createFallbackSwitch() {
    if (!document.body || document.querySelector("[data-language-switch]")) return;
    var holder = document.createElement("label");
    holder.id = "operator-language-control";
    holder.className = "language-control";
    holder.setAttribute("data-vt01-i18n-ignore", "");
    holder.innerHTML = '<span id="operator-language-label">Idioma</span><select id="operator-language" data-language-switch aria-labelledby="operator-language-label"><option value="es">ES</option><option value="val">VAL</option><option value="en">EN</option></select>';
    var style = document.createElement("style");
    style.setAttribute("data-vt01-i18n-ignore", "");
    style.textContent = "#operator-language-control{position:fixed;right:16px;bottom:16px;z-index:80;padding:8px 10px;border:1px solid var(--a-line,#d9e3e6);border-radius:10px;background:var(--a-panel,#fff);box-shadow:0 5px 20px #0002}#operator-language-control select{min-height:38px}";
    document.head.appendChild(style);
    document.body.appendChild(holder);
  }

  function syncSwitches() {
    createFallbackSwitch();
    Array.prototype.forEach.call(document.querySelectorAll("[data-language-switch]"), function (select) {
      if (!boundSwitches.has(select)) {
        boundSwitches.add(select);
        select.addEventListener("change", function () { setLanguage(select.value); });
      }
      if (select.value !== currentLanguage) select.value = currentLanguage;
    });
  }

  function refresh(root) {
    if (!document.documentElement) return currentLanguage;
    syncSwitches();
    document.documentElement.lang = currentLanguage === "val" ? "ca-valencia" : currentLanguage;
    translateTree(root && root.nodeType ? root : document.body || document.documentElement);
    return currentLanguage;
  }

  function setLanguage(language) {
    var normalized = normalizeLanguage(language);
    if (!normalized || SUPPORTED.indexOf(normalized) === -1) return currentLanguage;
    var changed = normalized !== currentLanguage;
    currentLanguage = normalized;
    saveLanguage(currentLanguage);
    refresh();
    if (changed && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("vt01:languagechange", {detail: {language: currentLanguage}}));
    }
    return currentLanguage;
  }

  function getLanguage() { return currentLanguage; }

  function queueRoot(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 3 && root.nodeType !== 11)) return;
    if (root.nodeType === 1 && root.closest && root.closest("[data-vt01-i18n-ignore]")) return;
    pendingRoots.add(root);
    if (flushScheduled) return;
    flushScheduled = true;
    Promise.resolve().then(function () {
      flushScheduled = false;
      syncSwitches();
      pendingRoots.forEach(translateTree);
      pendingRoots.clear();
    });
  }

  function start() {
    currentLanguage = readSavedLanguage();
    refresh();
    if (window.MutationObserver && document.documentElement) {
      observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === "characterData") queueRoot(mutation.target);
          else if (mutation.type === "attributes") queueRoot(mutation.target);
          else Array.prototype.forEach.call(mutation.addedNodes, queueRoot);
        });
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "aria-description", "title", "alt", "placeholder"]
      });
    }
  }

  window.VT01I18n = {
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    refresh: refresh
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
  else start();
})();
