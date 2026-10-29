export type Locale = "en" | "es";

type TextValue = string | string[];

const LOCALE_STORAGE_KEY = "zarka_locale";

const SPANISH_TRANSLATIONS: Record<string, string> = {
  "End Game Report": "Informe final",
  "View replay": "Ver repetición",
  "Back to Report": "Volver al informe",
  "Continue to Report": "Continuar al informe",
  "continue to report": "continuar al informe",
  "Loading end-game report...": "Cargando informe final...",
  "Loading game...": "Cargando partida...",
  "Tip:": "Consejo:",
  "Don't attack randomly, you could be hitting your teammates":
    "No ataques al azar, podrías golpear a tus compañeros de equipo",
  "Don't attack randonly, you could be hitting your teammates":
    "No ataques al azar, podrías golpear a tus compañeros de equipo",
  "Avoid crowded areas": "Evita las zonas concurridas",
  "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)":
    "Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)",
  "If your health drops to 5 or less, you become unconscious, you become invulnerable(fire, bombard, c4, rocket and virus still damages you)":
    "Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)",
  "After being unconscious your max health becomes 5":
    "Tras quedar inconsciente, tu salud máxima pasa a ser 5",
  "After being unconscious your max health become 5":
    "Tras quedar inconsciente, tu salud máxima pasa a ser 5",
  "Same actions of different players are resolved in a random order, unless one player has more agility 2":
    "Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2",
  "Same actions of diferent players are resolved in a random order, unless one player has more agility2":
    "Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2",
  "Put trusted people in your testament, you never know if you will survive one more turn":
    "Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más",
  "Put trust people in your testament, you never know if you will survive one turn more":
    "Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más",
  "Tip: Don't attack randomly, you could be hitting your teammates":
    "Consejo: No ataques al azar, podrías golpear a tus compañeros de equipo",
  "Tip: Avoid crowded areas": "Consejo: Evita las zonas concurridas",
  "Tip: If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)":
    "Consejo: Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)",
  "Tip: After being unconscious your max health becomes 5":
    "Consejo: Tras quedar inconsciente, tu salud máxima pasa a ser 5",
  "Tip: Same actions of different players are resolved in a random order, unless one player has more agility 2":
    "Consejo: Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2",
  "Tip: Put trusted people in your testament, you never know if you will survive one more turn":
    "Consejo: Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más",
  "Report unavailable": "Informe no disponible",
  counterattacked: "contraatacó",
  "with a punch": "con un puñetazo",
  "missed with a punch": "falló el puñetazo",
  "started the chainsaw": "arrancó la motosierra",
  "chainsaw turned off": "apagó la motosierra",
  "chainsaw will shutdown in": "la motosierra se apagará en",
  turns: "turnos",
  "a chainsaw": "una motosierra",
  "Chainsaw is not running": "La motosierra no está arrancada",
  "The chainsaw attack order goes first, it won't be started, it requires two turns, first start then attack":
    "El ataque con motosierra va primero, no estará arrancada, requiere dos turnos, primero arrancar y luego atacar",
  "Chainsaw order": "Orden de motosierra",
  "Requires running chainsaw": "Requiere la motosierra arrancada",
  "Victory!": "¡Victoria!",
  Defeat: "Derrota",
  "Defeat!": "¡Derrota!",
  "Match Draw": "Empate",
  Turns: "Turnos",
  "Team Leaderboard": "Clasificación de equipos",
  Winner: "Ganador",
  Damage: "Daño",
  Received: "Recibido",
  Kills: "Bajas",
  Winners: "Ganadores",
  "Player Statistics": "Estadísticas de jugadores",
  "Average weight": "Peso medio",
  Actions: "Acciones",
  Alive: "Vivo",
  Eliminated: "Eliminado",
  Achievements: "Logros",
  "No achievements awarded": "No se otorgaron logros",
  Scavenger: "Carroñero",
  Executioner: "Verdugo",
  Tank: "Tanque",
  Pacifist: "Pacifista",
  Hoarder: "Acaparador",
  Glutton: "Glotón",
  Medic: "Médico",
  Runner: "Corredor",
  Finished: "Finalizada",
  Win: "Victoria",
  Report: "Informe",
  "Account Settings": "Configuración de la cuenta",
  Settings: "Ajustes",
  Account: "Cuenta",
  "Available for random games": "Disponible para partidas aleatorias",
  "Choose how many ranked matches Zarka can assign at once. Another match may be assigned while one is in progress.":
    "Elige cuántas partidas clasificatorias puede asignarte Zarka a la vez. Puede asignarte otra mientras una partida está en curso.",
  "Maximum active matches": "Máximo de partidas activas",
  "Choose how many active matches you can join. Existing matches remain if you lower this limit.":
    "Elige cuántas partidas activas puedes tener. Las partidas actuales se conservan si reduces este límite.",
  Saved: "Guardado",
  Disabled: "Desactivado",
  Enabled: "Activado",
  "Saving...": "Guardando...",
  "Could not save. Restored saved value.":
    "No se pudo guardar. Se restauró el valor guardado.",
  "Fetching ranked queue status...": "Consultando la cola clasificatoria...",
  "Ranked queue status unavailable.":
    "Estado de la cola clasificatoria no disponible.",
  "Random games": "Partidas aleatorias",
  Desired: "Solicitadas",
  Queued: "En cola",
  Starting: "Iniciando",
  Running: "En curso",
  Appearance: "Apariencia",
  Audio: "Audio",
  Notifications: "Notificaciones",
  Language: "Idioma",
  "Select language": "Seleccionar idioma",
  Donate: "Donar",
  "Donate zarkans": "Donar zarkans",
  Recipient: "Destinatario",
  Amount: "Cantidad",
  Available: "Disponible",
  "Sending...": "Enviando...",
  "Sending donation...": "Enviando donación...",
  "Failed to send donation.": "No se pudo enviar la donación.",
  "has donated": "ha donado",
  "Turn reminders can be delayed by Android or browser power management.":
    "Los recordatorios de turno pueden retrasarse por el ahorro de batería de Android o del navegador.",
  "Checking notification support...":
    "Comprobando compatibilidad con notificaciones...",
  "Enable notifications": "Activar notificaciones",
  "Disable notifications": "Desactivar notificaciones",
  "Web Push is not supported by this browser.":
    "Este navegador no admite notificaciones Web Push.",
  "Push notifications are not configured for this app.":
    "Las notificaciones push no están configuradas para esta aplicación.",
  "Notifications are blocked. Allow them in browser settings.":
    "Las notificaciones están bloqueadas. Permítelas en la configuración del navegador.",
  "Notifications are off on this device.":
    "Las notificaciones están desactivadas en este dispositivo.",
  "Notifications are on for this device.":
    "Las notificaciones están activadas en este dispositivo.",
  "Notification setup failed. Check connection and retry.":
    "No se pudieron configurar las notificaciones. Comprueba la conexión e inténtalo de nuevo.",
  "Enabling notifications...": "Activando notificaciones...",
  "Disabling notifications...": "Desactivando notificaciones...",
  "Failed to enable notifications.":
    "No se pudieron activar las notificaciones.",
  "Failed to disable notifications.":
    "No se pudieron desactivar las notificaciones.",
  "Nakama Server Logs": "Registros del servidor Nakama",
  "Enter the Nakama console password to continue.":
    "Introduce la contraseña de consola de Nakama para continuar.",
  "Admin authentication": "Autenticación de administrador",
  "Console password": "Contraseña de consola",
  "Console password is required.": "La contraseña de consola es obligatoria.",
  "Checking password...": "Comprobando contraseña...",
  "Errors only": "Solo errores",
  "Loading Nakama logs...": "Cargando registros de Nakama...",
  "No logs returned.": "No se recibieron registros.",
  "Logs loaded.": "Registros cargados.",
  "Pull changes and rebuild Nakama?":
    "¿Descargar los cambios y reconstruir Nakama?",
  "Pulling changes and rebuilding Nakama...":
    "Descargando cambios y reconstruyendo Nakama...",
  "Update in progress. Please keep this page open.":
    "Actualización en curso. Mantén esta página abierta.",
  "Update completed.": "Actualización completada.",
  "Update completed. Refreshing logs...":
    "Actualización completada. Actualizando registros...",
  "Update completed, but logs could not be refreshed.":
    "Actualización completada, pero no se pudieron actualizar los registros.",
  "Admin operation failed.": "La operación de administración falló.",
  "Invalid console password.": "La contraseña de consola no es válida.",
  "Too many failed password attempts. Try again later.":
    "Demasiados intentos fallidos. Inténtalo más tarde.",
  "The repository has local changes. Commit or discard them before updating.":
    "El repositorio tiene cambios locales. Confírmalos o descártalos antes de actualizar.",
  "The server checkout is not on the main branch.":
    "El servidor no está en la rama main.",
  "An update is already in progress.": "Ya hay una actualización en curso.",
  "Nakama logs are unavailable.":
    "Los registros de Nakama no están disponibles.",
  "Admin API is unreachable.":
    "No se puede acceder a la API de administración.",
  "Update failed while checking the repository.":
    "La actualización falló al comprobar el repositorio.",
  "Update failed while pulling changes.":
    "La actualización falló al descargar los cambios.",
  "Update failed while installing dependencies.":
    "La actualización falló al instalar dependencias.",
  "Update failed while building the module.":
    "La actualización falló al compilar el módulo.",
  "Update failed while restarting Nakama.":
    "La actualización falló al reiniciar Nakama.",
  "The host repository path could not be resolved from Docker.":
    "No se pudo obtener de Docker la ruta del repositorio del servidor.",
  "Unable to inspect the Docker repository mount.":
    "No se pudo inspeccionar el montaje del repositorio en Docker.",
  "Player Stats": "Estadísticas del jugador",
  "Skin Customization": "Personalización de apariencia",
  "Facebook Account": "Cuenta de Facebook",
  "Checking Facebook link status...": "Comprobando el estado de Facebook...",
  "Link Facebook": "Vincular Facebook",
  "Unlink Facebook": "Desvincular Facebook",
  "Audio Settings": "Configuración de audio",
  "Music: ON": "Música: Activada",
  "Music: OFF": "Música: Desactivada",
  "[ ] View all actions and players": "[ ] Ver todas las acciones y jugadores",
  "[x] View all actions and players": "[x] Ver todas las acciones y jugadores",
  "Back to Game": "Volver al juego",
  Preview: "Vista previa",
  "Skin saved!": "¡Apariencia guardada!",
  "Stats unavailable": "Estadísticas no disponibles",
  "Error loading account information":
    "Error al cargar la información de la cuenta",
  "Linking Facebook account...": "Vinculando la cuenta de Facebook...",
  "Facebook SDK not available": "El SDK de Facebook no está disponible",
  "Facebook SDK not available. Please check your internet connection.":
    "El SDK de Facebook no está disponible. Comprueba tu conexión a internet.",
  "Facebook login cancelled": "Inicio de sesión de Facebook cancelado",
  "Facebook account linked successfully!":
    "¡Cuenta de Facebook vinculada correctamente!",
  "Failed to link Facebook account":
    "No se pudo vincular la cuenta de Facebook",
  "Unlinking Facebook account...": "Desvinculando la cuenta de Facebook...",
  "Facebook account unlinked successfully!":
    "¡Cuenta de Facebook desvinculada correctamente!",
  "Facebook account is linked": "La cuenta de Facebook está vinculada",
  "Facebook account is not linked": "La cuenta de Facebook no está vinculada",
  "Failed to unlink Facebook account":
    "No se pudo desvincular la cuenta de Facebook",
  "Display name must be 128 characters or less":
    "El nombre visible debe tener 128 caracteres o menos",
  "Enter new display name:": "Escribe el nuevo nombre visible:",
  "Match name": "Nombre de la partida",
  "Are you sure you want to start the match? Players will no longer be able to join.":
    "¿Seguro que quieres comenzar la partida? Los jugadores ya no podrán unirse.",
  "Are you sure you want to remove this match? This action cannot be undone.":
    "¿Seguro que quieres eliminar esta partida? Esta acción no se puede deshacer.",
  "Updating display name...": "Actualizando el nombre visible...",
  "Display name updated!": "¡Nombre visible actualizado!",
  "Failed to update display name": "No se pudo actualizar el nombre visible",
  "Auto-advance time unavailable": "Hora de avance automático no disponible",
  "Auto-advance in": "Avance automático en",
  "Connecting...": "Conectando...",
  "Join OK": "Unión correcta",
  "Join match": "Unirse a la partida",
  "Change Name": "Cambiar nombre",
  Save: "Guardar",
  Cancel: "Cancelar",
  Clear: "Limpiar",
  "Select target": "Seleccionar objetivo",
  "Target Location": "Ubicación objetivo",
  "Target Player": "Jugador objetivo",
  "Select Target Player": "Selecciona un jugador",
  "Second Target Player": "Segundo jugador objetivo",
  "Second Steal Target Player": "Objetivo del segundo robo",
  "Second tracker target player": "Jugador objetivo del segundo localizador",
  "Additional inspected player": "Jugador inspeccionado adicional",
  "Second Shot Target Player": "Objetivo del segundo disparo",
  "Second Shot Destination": "Destino del segundo disparo",
  "Second Trap Destination": "Destino de la segunda trampa",
  "Second C4 Destination": "Destino del segundo C4",
  "None selected": "Ninguno seleccionado",
  "Extra power": "Potencia adicional",
  "Priority Items": "Objetos prioritarios",
  "Food or drink to poison": "Comida o bebida que envenenar",
  "Select a visible food or drink from the ground or an inventory.":
    "Elige comida o bebida visible del suelo o de un inventario.",
  inventory: "inventario",
  "Poison food or drink carried by this character.":
    "Envenena comida o bebida que lleve este personaje.",
  "Item to throw": "Objeto a lanzar",
  "Second Steal Item Priorities": "Prioridades del segundo robo",
  "No items carried.": "No llevas objetos.",
  Toggle: "Alternar",
  Edit: "Editar",
  Map: "Mapa",
  Panel: "Panel",
  "Settings sync:": "Sincronización de ajustes:",
  "Authenticated. Use the buttons below.":
    "Autenticado. Usa los botones de abajo.",
  "Left match.": "Has abandonado la partida.",
  "Back to main menu (still in match).":
    "Volver al menú principal (sigues en la partida).",
  "Match was already started.": "La partida ya había comenzado.",
  "Match started.": "Partida comenzada.",
  "Failed to update settings": "No se pudieron actualizar los ajustes",
  "Match removed successfully.": "Partida eliminada correctamente.",
  "Failed to remove match (see console).":
    "No se pudo eliminar la partida (consulta la consola).",
  "Maximum of 3 matches per user reached":
    "Has alcanzado el máximo de 3 partidas por usuario",
  "Failed to create match (see console).":
    "No se pudo crear la partida (consulta la consola).",
  "List Matches": "Lista de partidas",
  "My Matches": "Mis partidas",
  "Create Match": "Crear partida",
  Logout: "Cerrar sesión",
  "Match Lobby": "Sala de partida",
  "Waiting for players...": "Esperando a los jugadores...",
  Waiting: "Esperando",
  Host: "Anfitrión",
  Manual: "Manual",
  Match: "Partida",
  "Time left": "Tiempo restante",
  "Map unavailable": "Mapa no disponible",
  "Online matches": "Partidas online",
  "Finished matches": "Partidas terminadas",
  "No online matches": "No hay partidas online",
  "No finished matches": "No hay partidas terminadas",
  "Fetching my matches...": "Cargando mis partidas...",
  "You haven't joined any matches yet.":
    "Aún no te has unido a ninguna partida.",
  "In Progress": "En curso",
  "Carried items:": "Objetos transportados:",
  "Return to Game": "Volver al juego",
  "Back to Menu": "Volver al menú",
  "Leave Match": "Abandonar partida",
  "End Turn": "Terminar turno",
  "Start Match": "Comenzar partida",
  "Not enough spawn tiles. Increase map size or remove players/bots.":
    "No hay suficientes casillas de aparición. Aumenta el mapa o elimina jugadores/bots.",
  "Remove Match": "Eliminar partida",
  Rename: "Cambiar nombre",
  Players: "Jugadores",
  Teams: "Equipos",
  Matches: "Partidas",
  "Fetching...": "Cargando...",
  Refresh: "Actualizar",
  Pull: "Pull",
  Continue: "Continuar",
  Back: "Atrás",
  View: "Ver",
  Leave: "Abandonar",
  "No matches found.": "No se encontraron partidas.",
  "This match is no longer available.": "Esta partida ya no está disponible.",
  "Match is full.": "La partida está llena.",
  "Ranked match roster is locked.":
    "La lista de jugadores de la partida clasificatoria está bloqueada.",
  "Complete the tutorial before joining matches.":
    "Completa el tutorial antes de unirte a partidas.",
  "You have reached your active match limit.":
    "Has alcanzado tu límite de partidas activas.",
  "Could not join match. Try again.":
    "No se pudo unir a la partida. Inténtalo de nuevo.",
  "No players found.": "No se encontraron jugadores.",
  "No teams found.": "No se encontraron equipos.",
  "Choose your login method": "Elige un método de inicio de sesión",
  "Login with Facebook": "Iniciar sesión con Facebook",
  "Login with Google": "Iniciar sesión con Google",
  Login: "Iniciar sesión",
  Register: "Registrarse",
  "Continue as Guest": "Continuar como invitado",
  "Email:": "Correo electrónico:",
  "Password:": "Contraseña:",
  "Username:": "Nombre de usuario:",
  "Email or Username:": "Correo o nombre de usuario:",
  "Click to enter email...": "Pulsa para escribir el correo...",
  "Click to enter email or username...":
    "Pulsa para escribir el correo o usuario...",
  "Click to enter password...": "Pulsa para escribir la contraseña...",
  "Click to enter username...": "Pulsa para escribir el nombre de usuario...",
  "Create your account": "Crea tu cuenta",
  "Login with username or email": "Inicia sesión con usuario o correo",
  "Initializing Facebook login...":
    "Inicializando el inicio de sesión de Facebook...",
  "Please complete Facebook login...":
    "Completa el inicio de sesión de Facebook...",
  "Facebook login was cancelled or failed.":
    "El inicio de sesión de Facebook se canceló o falló.",
  "Authenticating with game server...":
    "Autenticando con el servidor del juego...",
  "Initializing Google login...":
    "Inicializando el inicio de sesión de Google...",
  "Please complete Google login...":
    "Completa el inicio de sesión de Google...",
  "Google login was cancelled or failed.":
    "El inicio de sesión de Google se canceló o falló.",
  "Google login is not configured. Please use another login method.":
    "El inicio de sesión de Google no está configurado. Usa otro método.",
  "Google login is unavailable. Please check your internet connection.":
    "El inicio de sesión de Google no está disponible. Comprueba tu conexión.",
  "Logging in...": "Iniciando sesión...",
  "Please enter username/email and password.":
    "Escribe el usuario/correo y la contraseña.",
  "Please enter a username.": "Escribe un nombre de usuario.",
  "Please enter both email and password.": "Escribe el correo y la contraseña.",
  "Password must be at least 8 characters long.":
    "La contraseña debe tener al menos 8 caracteres.",
  "Creating account...": "Creando cuenta...",
  "Account created successfully!": "¡Cuenta creada correctamente!",
  "Logging in as guest...": "Iniciando sesión como invitado...",
  "Guest login failed. Please try again.":
    "El inicio de sesión como invitado falló. Inténtalo de nuevo.",
  "Login successful! Starting game...":
    "¡Inicio de sesión correcto! Iniciando el juego...",
  "Main Action": "Acción principal",
  "Secondary Action": "Acción secundaria",
  "Extra Secondary Action": "Acción secundaria adicional",
  Inventory: "Inventario",
  "Cell contents": "Contenido de la celda",
  "Items in cell": "Objetos en la casilla",
  "Possible items for this cell": "Objetos posibles de la casilla",
  "No visible items": "No hay objetos visibles",
  "No possible items": "No hay objetos posibles",
  House: "Casa",
  Pharmacy: "Farmacia",
  "Police station": "Comisaría",
  "Hardware store": "Ferretería",
  Factory: "Fábrica",
  Hospital: "Hospital",
  Workshop: "Taller",
  "Security room": "Sala de seguridad",
  "Gas station": "Gasolinera",
  Market: "Mercado",
  Restaurant: "Restaurante",
  Road: "Carretera",
  Path: "Camino",
  Alley: "Callejón",
  Close: "Cerrar",
  Shop: "Tienda",
  Buy: "Comprar",
  Confirm: "Confirmar",
  Location: "Ubicación",
  "Select location": "Seleccionar ubicación",
  "Choose target location": "Elige la ubicación objetivo",
  "Detective target": "Objetivo del detective",
  "Testament recipient": "Receptor del testamento",
  "Zarkans: 0": "Zarkans: 0",
  Trafficker: "Traficante",
  Applications: "Aplicaciones",
  Mercenaries: "Mercenarios",
  Arrow: "Flecha",
  Antidote: "Antídoto",
  Bullet: "Bala",
  Food: "Comida",
  Bandage: "Venda",
  Harpoon: "Arpón",
  Trap: "Trampa",
  Pistol: "Pistola",
  "C4 explosive": "Explosivo C4",
  "Bulletproof vest": "Chaleco antibalas",
  "Rocket launcher": "Lanzacohetes",
  "Security room camera app": "Aplicación de cámara de la sala de seguridad",
  "Spy drone": "Dron espía",
  Detective: "Detective",
  "Tracking app": "Aplicación de seguimiento",
  Helicopter: "Helicóptero",
  Fumigator: "Fumigador",
  Pyromaniac: "Pirómano",
  "Confirm hiring Pyromaniac for 20 Zarkans?":
    "¿Confirmas contratar al Pirómano por 20 zarkans?",
  "Confirm this purchase?": "¿Confirmas esta compra?",
  Bomber: "Bombardero",
  Hitman: "Sicario",
  Cocoman: "Cocoman",
  "The trafficker delivers an arrow at the end of the turn.":
    "El traficante entrega una flecha al final del turno.",
  "The trafficker delivers an antidote at the end of the turn.":
    "El traficante entrega un antídoto al final del turno.",
  "The trafficker delivers a bullet at the end of the turn.":
    "El traficante entrega una bala al final del turno.",
  "The trafficker delivers food at the end of the turn.":
    "El traficante entrega comida al final del turno.",
  "The trafficker delivers a bandage at the end of the turn.":
    "El traficante entrega una venda al final del turno.",
  "The trafficker delivers a harpoon at the end of the turn.":
    "El traficante entrega un arpón al final del turno.",
  "The trafficker delivers a trap at the end of the turn.":
    "El traficante entrega una trampa al final del turno.",
  "The trafficker delivers a pistol at the end of the turn.":
    "El traficante entrega una pistola al final del turno.",
  "The trafficker delivers a C4 explosive at the end of the turn.":
    "El traficante entrega un explosivo C4 al final del turno.",
  "The trafficker delivers a bulletproof vest at the end of the turn.":
    "El traficante entrega un chaleco antibalas al final del turno.",
  "The trafficker delivers a rocket launcher at the end of the turn.":
    "El traficante entrega un lanzacohetes al final del turno.",
  "Reports the characters visible in the security room that turn.":
    "Informa de los personajes visibles en la sala de seguridad durante ese turno.",
  "Reports the players visible in a chosen location that turn.":
    "Informa de los jugadores visibles en una ubicación elegida durante ese turno.",
  "Reports the investigated player's team immediately.":
    "Informa inmediatamente del equipo del jugador investigado.",
  "Reports the number of traps or C4 one location away.":
    "Informa del número de trampas o C4 a una ubicación de distancia.",
  "Transports up to four consenting people between locations.":
    "Transporta hasta cuatro personas que acepten entre ubicaciones.",
  "Intoxicates every character in a location.":
    "Intoxica a todos los personajes de una ubicación.",
  "Creates a three-turn fire in a location.":
    "Crea un incendio de tres turnos en una ubicación.",
  "hired a pyromaniac": "contrató un pirómano",
  "hired a bomber": "contrató un bombardero",
  "was hit by a bomber and lost": "fue alcanzado por un bombardero y perdió",
  "Deals five unavoidable damage to every player in a location.":
    "Inflige cinco puntos de daño inevitable a todos los jugadores de una ubicación.",
  "A mercenary that attacks the assigned target team.":
    "Un mercenario que ataca al equipo objetivo asignado.",
  "A prestigious hitman with a chainsaw and bulletproof vest.":
    "Un sicario prestigioso con una motosierra y un chaleco antibalas.",
  "20 + 5 per person": "20 + 5 por persona",
  "Match Chat": "Chat de partida",
  Tutorial: "Tutorial",
  Step: "Paso",
  Hint: "Pista",
  "Show hint": "Mostrar pista",
  "Hide hint": "Ocultar pista",
  "Tutorial complete": "Tutorial completado",
  "You learned to inspect, prepare, verify, and plan ahead.":
    "Aprendiste a inspeccionar, prepararte, verificar y planificar.",
  "Look around first. Drag the map to see the whole 2×2 board before choosing an action.":
    "Primero, observa el mapa. Arrástralo para ver todo el tablero de 2×2 antes de elegir una acción.",
  "Press or touch an empty part of the map, then drag in any direction.":
    "Pulsa o toca una parte vacía del mapa y arrastra en cualquier dirección.",
  "Open the information for the cell your character is standing on.":
    "Abre la información de la casilla donde está tu personaje.",
  "Select your current cell on the map to open its information panel.":
    "Selecciona tu casilla actual en el mapa para abrir su panel de información.",
  "Now inspect one nearby cell. Knowing where you can move helps you plan safely.":
    "Ahora inspecciona una casilla cercana. Saber adónde puedes moverte te ayuda a planificar con seguridad.",
  "Choose any cell directly next to your current one.":
    "Elige cualquier casilla junto a la actual.",
  "Choose Vitality for more HP and Strength 2 to make axe attacks cost less energy.":
    "Elige Vitalidad para tener más PV y Fuerza 2 para reducir la energía de los ataques con hacha.",
  "Open Character → Skills. Buy both skills; you can switch between Offensive and Defense.":
    "Abre Personaje → Habilidades. Compra ambas habilidades; puedes cambiar entre Ataque y Defensa.",
  "Search this cell to reveal objects that are hidden from you.":
    "Busca en esta casilla para revelar los objetos ocultos.",
  "Search is the only available secondary action. Submit the turn with Ready.":
    "Buscar es la única acción secundaria disponible. Envía el turno con Listo.",
  "Pick up the visible bandage, axe, and food so you can use them later.":
    "Recoge la venda, el hacha y la comida visibles para usarlos más tarde.",
  "Pick Up is the only available main action. The visible objects are on your cell.":
    "Coger es la única acción principal disponible. Los objetos visibles están en tu casilla.",
  "Use Feed on yourself. It restores energy.":
    "Usa Alimentar contigo. Recuperarás energía.",
  "Feed is the only available secondary action. Submit the turn with Ready.":
    "Alimentar es la única acción secundaria disponible. Envía el turno con Listo.",
  "The bot has entered your cell and sent a message. Open Chat to read it.":
    "El bot ha entrado en tu casilla y ha enviado un mensaje. Abre Chat para leerlo.",
  "The orange marker means Chat has an unread message.":
    "El indicador naranja señala que hay un mensaje sin leer en Chat.",
  "Read the bot’s claim in Chat. Do not trust a team claim until you verify it.":
    "Lee en Chat lo que afirma el bot. No confíes en su equipo hasta comprobarlo.",
  "Open the Chat tab. Its unread marker clears when the tab is opened.":
    "Abre la pestaña Chat. El indicador desaparece al abrirla.",
  "Use the Detective shop item to check the bot’s team instead of trusting its claim.":
    "Usa el Detective de la tienda para comprobar el equipo del bot en vez de confiar en lo que dice.",
  "Open Shop, choose Detective, select the bot, then confirm the purchase.":
    "Abre Tienda, elige Detective, selecciona al bot y confirma la compra.",
  "Read the private Detective result in the Log to learn the bot’s real team.":
    "Lee el resultado privado del Detective en el Registro para conocer el equipo real del bot.",
  "Open Log and select the current turn if the result is not already shown.":
    "Abre Registro y selecciona el turno actual si el resultado aún no aparece.",
  "Plan an Axe attack against the bot. Your attack is planned now, but it resolves later.":
    "Planea un ataque con hacha contra el bot. El ataque queda planeado y se resuelve después.",
  "He is lying, he is not on your team! Plan an Axe attack against him.":
    "¡Está mintiendo, no está en tu equipo! Planea un ataque con hacha contra él.",
  "Axe Attack is prepared. Select Tutorial Bot as the target, then press Ready.":
    "Atacar con hacha está preparado. Selecciona Tutorial Bot como objetivo y pulsa Listo.",
  "Watch the order: the bot’s Scare scares you away before your planned Axe attack resolves.":
    "Observa el orden: el Asustar del bot te asusta y te aleja antes de que se resuelva tu ataque con hacha.",
  "He is lying, he is not on your team! Attack him with the axe.":
    "¡Está mintiendo, no está en tu equipo! Atácale con el hacha.",
  "Press Ready to submit your attack.": "Pulsa Listo para enviar tu ataque.",
  "Press Ready to submit the plan. The Log will show why the attack misses.":
    "Pulsa Listo para enviar el plan. El Registro mostrará por qué falla el ataque.",
  "Move back toward the bot. The map is about to become dangerous.":
    "Vuelve a acercarte al bot. El mapa pronto será peligroso.",
  "Actions resolve by priority order: the bot’s Scare scared you away before your Axe attack could resolve! Now move back toward the bot.":
    "Las acciones se resuelven por orden de prioridad: ¡el Asustar del bot te hizo huir antes de que se resolviera tu ataque con hacha! Ahora vuelve a acercarte al bot.",
  "Move is prepared. Select the bot’s cell, then press Ready.":
    "Desplazarse está preparado. Selecciona la casilla del bot y pulsa Listo.",
  "Notice the skull warning: this cell will be destroyed on the next turn.":
    "Observa la calavera: esta casilla será destruida en el próximo turno.",
  "The warning and Log show how many turns remain before destruction.":
    "El aviso y el Registro muestran cuántos turnos faltan para la destrucción.",
  "Use Scare with extra power to choose the bot’s destination: the doomed cell.":
    "Usa Asustar con una potencia adicional para elegir el destino del bot: la casilla condenada.",
  "Scare is prepared. Set Extra Power to 1, target the bot, and select the skull-marked cell.":
    "Asustar está preparado. Establece Potencia adicional en 1, selecciona al bot y elige la casilla marcada con la calavera.",
  "Submit the final plan. The bot will be moved onto the doomed cell and normal destruction will resolve.":
    "Envía el plan final. El bot llegará a la casilla condenada y se resolverá la destrucción normal.",
  "Selecting a target location requires extra power, set the power to 6 and then select the location that is about to be destroyed.":
    "Seleccionar una ubicación objetivo requiere potencia adicional, establece la potencia en 6 y luego selecciona la ubicación que está a punto de ser destruida.",
  "You won by combining information, preparation, positioning, and timing.":
    "Ganaste al combinar información, preparación, posicionamiento y tiempo.",
  "The victory screen recaps the lessons before opening the normal match report.":
    "La pantalla de victoria resume las lecciones antes de abrir el informe normal de la partida.",
  "I am on your team. You can trust me.":
    "Estoy en tu equipo. Puedes confiar en mí.",
  "You checked instead of trusting me. Information can be more valuable than an attack.":
    "Comprobaste la información en vez de confiar en mí. La información puede valer más que un ataque.",
  "You planned to attack me, but actions resolve in an order. Scare can frighten you away before your attack resolves.":
    "Planeaste atacarme, pero las acciones se resuelven en orden. Asustar puede hacerte huir asustado antes de que se resuelva tu ataque.",
  "The map itself is dangerous. Watch the warning, then use positioning to survive.":
    "El propio mapa es peligroso. Observa la advertencia y usa el posicionamiento para sobrevivir.",
  "No messages yet.": "Todavía no hay mensajes.",
  "Type a message": "Escribe un mensaje",
  Send: "Enviar",
  "Be the first.": "Sé el primero.",
  Connecting: "Conectando",
  Connected: "Conectado",
  Unavailable: "No disponible",
  System: "Sistema",
  You: "Tú",
  Unknown: "Desconocido",
  Character: "Personaje",
  Items: "Objetos",
  Chat: "Chat",
  Log: "Registro",
  Status: "Estado",
  State: "Estado",
  Normal: "Normal",
  Unconscious: "Desmayado",
  Injured: "Herido",
  Hungry: "Hambriento",
  Intoxicated: "Intoxicado",
  Burned: "Quemado",
  Infected: "Infectado",
  Dead: "Muerto",
  Protected: "Protegido",
  None: "Ninguno",
  "Carried items": "Objetos transportados",
  "Revealed carried items": "Objetos transportados revelados",
  "Chat is not connected": "El chat no está conectado",
  "Chat unavailable": "Chat no disponible",
  "Chat unavailable.": "Chat no disponible.",
  "Already chosen as extra secondary action":
    "Ya elegida como acción secundaria adicional",
  "Already chosen as secondary action": "Ya elegida como acción secundaria",
  "No action": "Sin acción",
  "Action failed": "Acción fallida",
  "Incoming Destruction": "Destrucción entrante",
  "Destroyed in": "Se destruirá en",
  "Tile destroyed at": "Casilla destruida en",
  turn: "turno",
  "Defeated in battle": "Derrotado en combate",
  "erupted in flames": "ardió en llamas",
  Skills: "Habilidades",
  "Unspent points": "Puntos sin gastar",
  "Insufficient energy": "Energía insuficiente",
  "Insufficient energy, actions hurt for 1 damage and actions with extra effort will fail.":
    "Energía insuficiente, las acciones causan 1 punto de daño y las acciones con esfuerzo adicional fallarán.",
  Overweight: "Sobrecargado",
  "Your current actions may make you overweight":
    "Tus acciones actuales pueden sobrecargarte.",
  Offensive: "Ataque",
  Defense: "Defensa",
  Utility: "Utilidad",
  NPC: "PNJ",
  Health: "Salud",
  Energy: "Energía",
  "Energy: Unknown": "Energía: Desconocida",
  CD: "Enf",
  "CD:": "Enf:",
  Weight: "Peso",
  Team: "Equipo",
  team: "equipo",
  used: "usó",
  "placed a tracker on": "colocó un localizador en",
  "a player at": "un jugador en",
  "placed a trap": "colocó una trampa",
  "triggered a trap set by": "activó una trampa colocada por",
  received: "recibió",
  delivered: "entregó",
  to: "a",
  "contracted the trafficker to deliver":
    "contrató al traficante para entregar",
  "daily zarkans": "zarkans diarios",
  "hired a detective": "contrató un detective",
  "and discovered": "y descubrió",
  "from a detective": "de un detective",
  "fled to": "huyó a",
  "activated the cameras": "activó las cámaras",
  "suffered poison damage": "sufrió daño por veneno",
  "actions remaining": "acciones restantes",
  "is affected by poison": "está afectado por veneno",
  "poisoned food carried by": "envenenó alimento de",
  "used an antidote on": "usó un antídoto en",
  "the overdose was fatal": "la sobredosis fue mortal",
  "the overdose caused unconsciousness": "la sobredosis causó inconsciencia",
  "became intoxicated": "se intoxicó",
  "was poisoned again": "volvió a ingerir veneno",
  "is lockpicking": "está forzando la cerradura",
  of: "de",
  "opened the safe": "abrió la caja fuerte",
  "opened the safe, it contains:": "abrió la caja fuerte, contiene:",
  "lockpicking was interrupted": "interrumpió el forzado de cerradura",
  "cannot see a safe": "no ve una caja fuerte",
  "looked through the window at": "miró por la ventana en",
  "looked through the window": "miró por la ventana",
  "used binoculars at": "usó prismáticos en",
  "used binoculars": "usó prismáticos",
  "used the security camera app and saw":
    "usó la aplicación de cámaras de seguridad y vio",
  "There are": "Hay",
  "c4 in current cell": "c4 en la casilla actual",
  "c4 at distance 1 and": "c4 a distancia 1 y",
  "traps in this location": "trampas en esta localización",
  characters: "personajes",
  Turn: "Turno",
  died: "murió",
  "fell unconscious": "quedó inconsciente",
  "is hidden": "está escondido",
  at: "en",
  "and hit": "y alcanzó a",
  "used a spy drone at": "usó un dron espía en",
  "and saw": "y vio",
  "used a spy drone and saw": "usó un dron espía y vio",
  "as testament": "como testamento",
  "moved to": "se movió a",
  "an axe": "un hacha",
  "a knife": "un cuchillo",
  "a nail bat": "un bate con clavos",
  "a bat": "un bate",
  dealt: "infligió",
  damage: "daño",
  with: "con",
  "failed to connect with": "falló con",
  "with a chemical weapon": "con un arma química",
  "hit nobody with the chemical weapon":
    "no alcanzó a nadie con el arma química",
  "a silenced pistol": "una pistola con silenciador",
  "a pistol": "una pistola",
  "missed with": "falló con",
  "a harpoon": "un arpón",
  "fired a rocket launcher": "disparó un lanzacohetes",
  "and dealt": "e infligió",
  "and lost": "y perdió",
  health: "salud",
  "injected a virus into": "inyectó un virus en",
  "injected a virus": "inyectó un virus",
  found: "encontró",
  "found nothing": "no encontró nada",
  inspected: "inspeccionó",
  "and found": "y encontró",
  "and found nothing new": "y no encontró nada nuevo",
  "same location": "misma ubicación",
  distance: "distancia",
  nearby: "cerca",
  "the target": "el objetivo",
  stole: "robó",
  from: "a",
  "stole nothing from": "no robó nada a",
  "picked up": "recogió",
  gave: "dio",
  sold: "vendió",
  "at the black market for": "en el mercado negro por",
  "sold nothing at the black market": "no vendió nada en el mercado negro",
  for: "por",
  dropped: "soltó",
  throws: "lanza",
  took: "sufrió",
  "was eliminated": "fue eliminado",
  "was damaged by fire": "fue dañado por el fuego",
  "damaged by fire": "dañado por el fuego",
  Cell: "Casilla",
  changed: "cambió",
  "was destroyed": "fue destruida",
  "filled with gas": "se llenó de gas",
  "failed to use": "no pudo usar",
  "target out of range": "objetivo fuera de rango",
  "target had no items to steal": "el objetivo no tiene objetos que robar",
  "is protected": "está protegido",
  "target is protected": "el objetivo está protegido",
  "an action": "una acción",
  extra: "extra",
  "belongs to the team": "pertenece al equipo",
  "infiltrated in team": "infiltrado en el equipo",
  energy: "energía",
  Detected: "Detectado",
  Affected: "Afectado",
  "was affected": "fue afectado",
  "is immune to scare": "es inmune a Asustar",
  recovered: "recuperó",
  lost: "perdió",
  "detected nobody": "no detectó a nadie",
  ea: "cada uno",
  "was affected by a virus": "fue afectado por un virus",
  "virus made": "virus enfermó a",
  "sick and suffered": "y sufrió",
  "was exposed to a virus": "estuvo expuesto a un virus",
  vaccinated: "vacunó a",
  "vaccinated themselves": "se vacunó",
  "used a vaccine": "usó una vacuna",
  Missing: "Falta",
  "Missing bat": "Falta el bate",
  "Missing pistol": "Falta la pistola",
  "Missing bullet": "Falta la bala",
  "Missing pistol, bullet": "Faltan la pistola y la bala",
  "Missing bandage": "Falta la venda",
  "Missing medicine": "Falta el medicamento",
  "Missing tracker": "Falta el localizador",
  "Missing throwable item": "Falta un objeto para lanzar",
  "Missing 2 units of fuel": "Faltan 2 unidades de combustible",
  "Not visible": "No visible",
  "Not in restaurant": "No estás en el restaurante",
  "Not in hospital": "No estás en el hospital",
  "Not in gas station": "No estás en la gasolinera",
  "Not in workshop": "No estás en el taller",
  "Not in security room": "No estás en la sala de seguridad",
  "Not in black market": "No estás en el mercado negro",
  "Not in house or pharmacy": "No estás en una casa o farmacia",
  "Not available in this build.": "No disponible en esta versión.",
  "[ ] Ready": "[ ] Listo",
  "[x] Ready": "[x] Listo",
  Ready: "Listo",
  "Player is ready": "El jugador está listo",
  "All other players are ready. Ready now to advance the turn?":
    "Todos los demás jugadores están listos. ¿Listo para avanzar el turno?",
  "[ ] Prioritize food/drink": "[ ] Priorizar comida/bebida",
  "[x] Prioritize food/drink": "[x] Priorizar comida/bebida",
  "[ ] Sell instead": "[ ] Vender en su lugar",
  "[x] Sell instead": "[x] Vender en su lugar",
  "[ ] Single target (Area)": "[ ] Objetivo único (área)",
  "[x] Single target": "[x] Objetivo único",
  "[x] Single target (Area)": "[x] Objetivo único (área)",
  "[ ] Place second tracker on another player":
    "[ ] Poner segundo localizador a otro jugador",
  "[x] Place second tracker on another player":
    "[x] Poner segundo localizador a otro jugador",
  "No replays yet.": "Todavía no hay repeticiones.",
  Play: "Reproducir",
  "Not Implemented": "No implementado",
  MAX: "MÁX",
  Revert: "Revertir",
  "Select action": "Seleccionar acción",
  "Choose action": "Elegir acción",
  "Choose Items": "Elegir objetos",
  "Choose crafted item": "Elegir objeto fabricado",
  "Dexterity 3": "Destreza 3",
  "Dexterity 3 product": "Producto de Destreza 3",
  "No product selected": "Ningún producto seleccionado",
  "Keep Dexterity 3 available for a later turn.":
    "Conserva Destreza 3 disponible para un turno posterior.",
  "Choose item": "Elegir objeto",
  "Choose operation": "Elegir operación",
  "Choose operation 1": "Elegir operación 1",
  "Choose operation 2": "Elegir operación 2",
  "Choose operation 3": "Elegir operación 3",
  "Choose operation 4": "Elegir operación 4",
  "Choose Combine or Separate recipe":
    "Elige una receta para combinar o separar",
  "Crafting uses no inventory ingredients":
    "La fabricación no consume ingredientes del inventario",
  Requires: "Requiere",
  Produces: "Produce",
  crafted: "fabricó",
  "leveled up": "subió de nivel",
  "Experience:": "Experiencia:",
  Level: "Nivel",
  "used Dexterity 3 to craft": "usó Destreza 3 para fabricar",
  combined: "combinó",
  separated: "separó",
  returned: "devolvió",
  "requires Workshop or Dexterity 4": "requiere un taller o Destreza 4",
  "inventory is full": "el inventario está lleno",
  "invalid product selection": "selección de producto no válida",
  "invalid recipe selection": "selección de receta no válida",
  "missing required items": "faltan objetos necesarios",
  "selected item": "objeto seleccionado",
  "Operation 1": "Operación 1",
  "Operation 2": "Operación 2",
  "Operation 3": "Operación 3",
  "Operation 4": "Operación 4",
  "No available players": "No hay jugadores disponibles",
  "No target": "Sin objetivo",
  "No priority": "Sin prioridad",
  "Stops after earlier picks; if first, picks one random item.":
    "Se detiene tras los objetos anteriores; si es el primero, recoge uno al azar.",
  "No prioritized items": "No hay objetos prioritarios",
  "No secondary action": "Sin acción secundaria",
  Crafting: "Fabricar",
  "Combine/Separate": "Combinar/Separar",
  Combine: "Combinar",
  Separate: "Separar",
  "Tap a player to target them": "Pulsa un jugador para seleccionarlo",
  "Tap an action to select it": "Pulsa una acción para seleccionarla",
  "Tap an item to prioritize it": "Pulsa un objeto para priorizarlo",
  "Select player": "Seleccionar jugador",
  "Selecting...": "Seleccionando...",
  "Add priority item": "Añadir objeto prioritario",
  "Removes every prioritized item.": "Elimina todos los objetos prioritarios.",
  "Removes the current priority target.":
    "Elimina el objetivo prioritario actual.",
  "Removes the extra secondary action.":
    "Elimina la acción secundaria adicional.",
  "Removes the planned secondary action.":
    "Elimina la acción secundaria planificada.",
  "Replay not available.": "Repetición no disponible.",
  "No events recorded.": "No hay eventos registrados.",
  "Skip Time": "Saltar tiempo",
  "Starting...": "Comenzando...",
  "Match Started": "Partida comenzada",
  "Starting Match": "Comenzando partida",
  "Server unavailable. Please check your connection or try again later.":
    "Servidor no disponible. Comprueba tu conexión e inténtalo de nuevo.",
  "Your session has expired. Please log in again.":
    "Tu sesión ha caducado. Inicia sesión de nuevo.",
  "Unsupported payload type: ": "Tipo de respuesta no compatible: ",
  "Select Main Action": "Seleccionar acción principal",
  "Select Secondary Action": "Seleccionar acción secundaria",
  "Select Extra Secondary Action": "Seleccionar acción secundaria adicional",
  "No extra secondary action": "Sin acción secundaria adicional",
  Upgrade: "Mejorar",
  "+ Upgrade": "+ Mejorar",
  "Available Skill: 0": "Puntos disponibles: 0",
  "Description coming soon.": "Descripción próximamente.",
  "Return to Main Menu": "Volver al menú principal",
  "VICTORY!": "¡VICTORIA!",
  DEFEAT: "DERROTA",
  "MATCH DRAW": "EMPATE",
  "You are the last character standing!": "¡Eres el último personaje en pie!",
  "All fighters were eliminated.": "Todos los combatientes fueron eliminados.",
  "Match completed in": "Partida completada en",
  "No character": "Sin personaje",
  "Waiting...": "Esperando...",
  "Match removed": "Partida eliminada",
  "Game over": "Fin de la partida",
  "Bienvenido a Zarka": "Bienvenido a Zarka",
  "Welcome to Zarka": "Bienvenido a Zarka",
  "Has llegado voluntariamente a un pueblo abandonado con un único objetivo: sobrevivir. En este juego de rol y estrategia por turnos, varios equipos se enfrentan a muerte, pero hay un problema: [b]aún no sabes quiénes son tus aliados.[/b]":
    "Has llegado voluntariamente a un pueblo abandonado con un único objetivo: sobrevivir. En este juego de rol y estrategia por turnos, varios equipos se enfrentan a muerte, pero hay un problema: [b]aún no sabes quiénes son tus aliados.[/b]",
  "Empiezas a solas, equipado únicamente con una mochila y una ración de comida. Cada día deberás elegir tus acciones, explorar el mapa, reunirte con tu equipo y eliminar a tus rivales.":
    "Empiezas a solas, equipado únicamente con una mochila y una ración de comida. Cada día deberás elegir tus acciones, explorar el mapa, reunirte con tu equipo y eliminar a tus rivales.",
  "Solo puede quedar un equipo en pie.": "Solo puede quedar un equipo en pie.",
  Comenzar: "Comenzar",
  "H1 Greedy": "H1 Codicioso",
  "H2 Cannibal": "H2 Caníbal",
  "H3 Salesman": "H3 Vendedor",
  "H4 Pensioner": "H4 Pensionista",
  "H5 Undetectable": "H5 Indetectable",
  "H6 Brave": "H6 Valiente",
  "H7 Vengeful": "H7 Vengativo",
  "H8 Charming": "H8 Encantador",
  "H9 Coward": "H9 Cobarde",
  "Increases maximum health by 1": "Aumenta la vida máxima en 1",
  "Reduces energy cost of punches by 3 points":
    "Reduce el esfuerzo de los puñetazos en 3 puntos",
  "Reduces energy cost of knife, bat, and axe attacks by 3 points":
    "Reduce el esfuerzo de los ataques con cuchillo, bate y hacha en 3 puntos",
  "Reduces energy cost of harpoon and pistol shots by 2 points":
    "Reduce el esfuerzo de los disparos con arpón y pistola en 2 puntos",
  "Reduces energy cost of placing C4 and traps, and detonating C4, by 2 points":
    "Reduce el esfuerzo en 2 puntos en colocación de C4 y trampas y detonación de C4",
  "Reduces energy cost of throwing objects by 2 points":
    "Reduce en 2 puntos el esfuerzo de lanzar objetos",
  "Reduces lockpicking time by 1 turn and prevents the lockpick from breaking":
    "Reduce en un turno el tiempo para forzar cerraduras y evita que se rompa la ganzúa",
  "Allows prioritizing up to 3 items when stealing from a player, even without inspecting them first.":
    "Permite priorizar hasta 3 objetos al robar a un jugador, incluso sin registro previo",
  "Allows crafting a chemical weapon, medicine, poison, or antidote chosen by the player for free. Activates when the product is specified and available, with a 7-turn cooldown; not consumed if unspecified.":
    "Permite fabricar gratuitamente un arma química, medicamento, veneno o antídoto elegido por el jugador. Se activa cuando se especifica el producto y está disponible, con un cooldown de 7 turnos; no se pierde si no se especifica.",
  "Allows performing the crafting action without being at the workshop":
    "Permite realizar la acción fabricar sin estar en el taller",
  "Increases maximum weight capacity by 5 units":
    "Aumenta en 5 unidades la capacidad máxima de peso",
  "Reduces damage taken by 1 (poison and virus still deal damage)":
    "Reduce en 1 el daño recibido (veneno y virus restan igualmente)",
  "Decreases the health threshold to faint and become wounded to 3":
    "Disminuye a 3 el mínimo de vida para desmayarse y quedar herido",
  "Can only die if taking damage while at 1 health; otherwise, any lethal damage leaves the character at 1 health, even from a chainsaw":
    "Solo puede morir si recibe daño estando a 1 de vida, si no cualquier daño que le fuera a matar le deja en 1 punto de vida, incluso la motosierra",
  "Increases dodge action success chance by 25%":
    "Aumenta un 25% la probabilidad de éxito de la acción esquivar",
  "Increases speed by 1 point": "Aumenta 1 punto de rapidez",
  "Reduces movement energy cost by 1 point":
    "Reduce en 1 punto el esfuerzo por desplazamiento",
  "Allows performing an additional secondary action":
    "Permite hacer una acción secundaria adicional",
  "Neutral players reveal 5 unseen items at the location (requires talking). Takes effect even if considered an enemy. Increases charisma by 2 points":
    "Los jugadores neutrales muestran 5 objetos que el personaje no vea de la localización (requiere hablar). Tiene efecto incluso si se considera enemigo. Aumenta 2 punto de simpatía",
  "Allows sleeping with neutral players. Takes effect even if considered an enemy. Increases charisma by 2 points each time you sleep with a neutral":
    "Se puede dormir con jugadores neutrales. Tiene efecto incluso si se considera enemigo. Cada vez que se duerma con un neutral aumenta 2 puntos de simpatía",
  "Allows controlling 1 civilian neutral (requires talking). Takes effect even if considered an enemy. Once per match, reveals the position of all civilian neutrals. Increases charisma by 1 point":
    "Permite controlar a 1 neutral civil (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales civiles. Aumenta 1 punto de simpatía",
  "Allows controlling 1 military neutral (requires talking). Takes effect even if considered an enemy. Once per match, reveals the position of all military neutrals. Increases charisma by 1 point":
    "Permite controlar a 1 neutral militar (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales militares. Aumenta 1 puntos de simpatía",
  "Reduces detection energy cost by 3 points":
    "Reduce en 3 puntos el esfuerzo por detectar",
  "Reveals hidden characters in the current location":
    "Ve a los escondidos en la propia localización",
  "Finds 1 extra item when performing the search action":
    "Encuentra 1 objeto extra al realizar la acción buscar",
  "Detects fires at any distance and identifies players in the same location or up to 1 location away":
    "Detecta incendios a cualquier distancia e identifica a los jugadores en la misma localización o hasta 1 localización de distancia",
  "Detects fires at any distance and identifies players in the same or an adjacent location":
    "Detecta incendios a cualquier distancia e identifica a los jugadores en la misma localización o hasta 1 localización de distancia",
  "Can prioritize searching for a food or drink in each search":
    "Puede priorizar buscar una comida o bebida en cada búsqueda",
  "Detects energy points (including bonuses if focused that turn), status, and items of all characters seen at the location (still requires items to be discovered via search to specify what to steal). If knocked out that turn, detects nothing":
    "Detecta puntos de esfuerzo (incluso los extras si se hubiera concentrado en ese turno), estado y objetos de todos los personajes que ve en la localización (igualmente requiere que los objetos sean descubiertos mediante un registro que se podría condicionar para poder concretar qué objeto robar). Si está desmayado ese turno no detecta nada",
  "Picks up 1 extra item without energy cost when performing the pick up action":
    "Coge 1 objeto extra sin esfuerzo al realizar la acción coger",
  "Allows feeding on corpses without being hungry and prevents health loss from eating a corpse":
    "Permite alimentarse de los cadáveres sin necesidad de estar hambriento y no pierde vida por comer cadáver",
  "Receives 1 extra zarkan for each sale in lockers":
    "Recibe 1 zarkan extra por cada venta en taquillas",
  "Receives 1 extra zarkan each turn": "Recibe 1 zarkan extra cada turno",
  "Cannot be discovered by the detect action":
    "No puede ser descubierto mediante la acción detectar",
  "Cannot be scared without consent":
    "No puede ser asustado si no da su consentimiento",
  "When attacked, immediately counterattacks the attacker with a knife, nail/regular bat, or axe (random) if in the same location, even if knocked out. Counterattacks with a punch if none of these weapons are available. Counterattacks do not affect cooldowns or count as an action for intoxication. Can choose not to counterattack a neutral player (with prior notice). Does not trigger from a counterattack":
    "Al ser atacado contrataca de inmediato con cuchillo, bate con o sin clavos o hacha (aleatorio) al agresor siempre que esté en la misma localización, incluso si se desmayara. Si no dispusiera de ninguna de estas armas contrataca con puñetazo. Los contrataques no afectan al cooldown ni se consideran una acción en cuanto a la intoxicación. Se puede decidir no contratacar a un jugador neutral (previo aviso). La habilidad no se activa si es por un contrataque",
  "Neutral players perform these actions to help the player with this skill when sharing a location:\n- If the player with this skill is poisoned, uses an antidote to cure them. Takes effect even if considered an enemy\n- Protects the player with this skill, provided they are not considered an enemy\nIncreases charisma by 3 points":
    "Los jugadores neutrales realizan estas acciones para favorecer al jugador que tenga esta habilidad al compartir localización:\n- Si el jugador con esta habilidad está intoxicado usa un antídoto para desintoxicarle. Tiene efecto incluso si se considera enemigo\n- Protege al jugador con esta habilidad, siempre que no sea considerado enemigo\nAumenta 3 puntos de simpatía",
  "Automatically hides to stay unseen in the location. Also invisible to binoculars, spy drone, neutrals, and hitman. Comes out of hiding if attacking, shooting (unless using a silencer), moving, throwing, scaring, stealing, sleeping with effort, or falling in love. Also if protecting an unhidden player or being protected by one (with permission). Cannot be prioritized for attacks or scaring, but can be attacked/scared if an attack hits no one or is a bat attack. Even if assaulted, stays hidden that turn unless one of the conditions occurs":
    "Se esconde automáticamente para no ser visto en la localización. Tampoco es visible a los prismáticos, al dron espía, a los neutrales ni al sicario. Sale de su escondite en un turno si ataca, dispara (salvo si usa silenciador), se desplaza, lanza, asusta, roba, duerme con esfuerzo o se enamora. También si protege a otro jugador que no esté escondido o si un jugador que no esté escondido le protege (esto último requiere autorización del escondido). No puede priorizarse atacar o asustar a un escondido, pero puede ser asustado o atacado si el ataque no fuera a dar a nadie o fuera un ataque con bate. Aunque un jugador escondido fuese agredido no sería visible en ese turno si no se da alguno de los casos anteriores"
};

const ENGLISH_GAME_NAMES: Record<string, string> = {
  "Bienvenido a Zarka": "Welcome to Zarka",
  Enf: "CD",
  "Enf:": "CD:",
  "Has llegado voluntariamente a un pueblo abandonado con un único objetivo: sobrevivir. En este juego de rol y estrategia por turnos, varios equipos se enfrentan a muerte, pero hay un problema: [b]aún no sabes quiénes son tus aliados.[/b]":
    "You have voluntarily arrived at an abandoned town with a single goal: to survive. In this turn-based role-playing and strategy game, several teams fight to the death, but there is a problem: [b]you still don't know who your allies are.[/b]",
  "Empiezas a solas, equipado únicamente con una mochila y una ración de comida. Cada día deberás elegir tus acciones, explorar el mapa, reunirte con tu equipo y eliminar a tus rivales.":
    "You start alone, equipped only with a backpack and a ration of food. Each day you must choose your actions, explore the map, regroup with your team, and eliminate your rivals.",
  "Solo puede quedar un equipo en pie.": "Only one team can be left standing.",
  Comenzar: "Start",
  "Continuar al informe": "Continue to Report",
  "continuar al informe": "continue to report",
  "Casilla destruida en": "Tile destroyed at",
  "Consejo:": "Tip:",
  "No ataques al azar, podrías golpear a tus compañeros de equipo":
    "Don't attack randomly, you could be hitting your teammates",
  "Evita las zonas concurridas": "Avoid crowded areas",
  "Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)":
    "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
  "Tras quedar inconsciente, tu salud máxima pasa a ser 5":
    "After being unconscious your max health becomes 5",
  "Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2":
    "Same actions of different players are resolved in a random order, unless one player has more agility 2",
  "Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más":
    "Put trusted people in your testament, you never know if you will survive one more turn",
  "Consejo: No ataques al azar, podrías golpear a tus compañeros de equipo":
    "Tip: Don't attack randomly, you could be hitting your teammates",
  "Consejo: Evita las zonas concurridas": "Tip: Avoid crowded areas",
  "Consejo: Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)":
    "Tip: If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
  "Consejo: Tras quedar inconsciente, tu salud máxima pasa a ser 5":
    "Tip: After being unconscious your max health becomes 5",
  "Consejo: Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2":
    "Tip: Same actions of different players are resolved in a random order, unless one player has more agility 2",
  "Consejo: Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más":
    "Tip: Put trusted people in your testament, you never know if you will survive one more turn",
  "Detecta incendios a cualquier distancia e identifica a los jugadores en la misma localización o hasta 1 localización de distancia":
    "Detects fires at any distance and identifies players in the same or an adjacent location",
  "Crear un incendio": "Start a fire",
  "Consume 2 unidades de combustible. Gastando 3 combustibles adicionales, el incendio puede iniciarse en una localización adyacente.":
    "Consume 2 units of fuel. Spend 3 additional fuel to start the fire at an adjacent location.",
  "Daño por incendio": "Fire damage",
  Recuperarse: "Recover",
  Alimentar: "Feed",
  Desayunar: "Have breakfast",
  "Usar venda": "Use bandage",
  "Usar medicamento": "Use medicine",
  Hablar: "Talk",
  "Poner localizador": "Place tracker",
  "Requiere disponer de un localizador.": "Requires a tracker.",
  "Informa de la posición del objetivo durante 6 turnos; un jugador autorizado también puede recibir la señal si ambos tienen walkie talkie.":
    "Reports the target's position for six turns; an authorized player also receives the signal if both have walkie-talkies.",
  "Permite colocar un segundo localizador en el mismo personaje o en otro.":
    "Allows placing a second tracker on the same or a different character.",
  "Puede colocarse en la localización actual o en una adyacente.":
    "Can be placed on a character in the current or an adjacent location.",
  "En una localización adyacente, sin prismáticos o un aliado con walkie talkie, se desconoce la identidad del objetivo.":
    "At an adjacent location, the target's identity remains unknown unless you have binoculars or an ally there with a walkie-talkie.",
  "Colocar C4": "Place C4",
  "Requiere tener una carga de C4.": "Requires a C4 charge.",
  "Requiere portar un detonador y tener una carga de C4 propia colocada.":
    "Requires a detonator and one of your own placed C4 charges.",
  "Detona una carga propia de C4 en la localización seleccionada e inflige [health-damage]12[/health-damage] a todos los personajes allí; la explosión se oye a dos casillas y no puede esquivarse.":
    "Detonates one of your C4 charges at the selected location, dealing [health-damage]12[/health-damage] damage to everyone there; the explosion can be heard two tiles away and cannot be dodged.",
  "Permite detonar una segunda carga de C4 independiente.":
    "Allows detonating a second independent C4 charge.",
  "Instala un explosivo en la localización actual, añade un detonador al inventario y podrá detonarse en turnos posteriores.":
    "Places a C4 charge at your current location, adds a detonator to your inventory, and lets you detonate it on a later turn.",
  "Permite colocar una segunda carga de C4.":
    "Allows placing a second C4 charge.",
  "Colocar trampa": "Place trap",
  Proteger: "Protect",
  Esquivar: "Dodge",
  "Atacar con cuchillo": "Knife attack",
  Desplazarse: "Move",
  Repostar: "Refuel",
  "Debe ejecutarse en la gasolinera.": "Must be performed at the gas station.",
  "Obtiene 3 unidades de combustible.": "Obtains 3 units of fuel.",
  Coger: "Pick up",
  Buscar: "Search",
  Manipular: "Combine/Separate",
  "Combinar/Separar": "Combine/Separate",
  "Debe poseer los objetos a transformar.":
    "Requires the items to be transformed.",
  "Requiere tener en el inventario los objetos necesarios para la operación seleccionada.":
    "Requires the items needed for the selected operation to be in your inventory.",
  "Combina o separa objetos del inventario siguiendo las recetas disponibles.":
    "Combines or separates inventory items using the available recipes.",
  "Debe realizarse en el taller salvo que se posea la habilidad Destreza 4.":
    "Must be performed at a Workshop unless you have Dexterity 4.",
  "Permite fabricar pistola, bala, molotov, bate, hacha, cuchillo, arpón, flecha, trampa o C4 con recursos del entorno o del taller, sin consumir objetos del inventario.":
    "Creates a Pistol, Bullet, Molotov, Bat, Axe, Knife, Harpoon, Arrow, Trap, or C4 using resources available at the Workshop or in the environment, without consuming inventory items.",
  "Debe realizarse en el taller salvo que se posea la habilidad Destreza 4.\n\nPermite fabricar pistola, bala, molotov, bate, hacha, cuchillo, arpón, flecha, trampa o C4 con recursos del entorno o del taller, sin consumir objetos del inventario.":
    "Must be performed at a Workshop unless you have Dexterity 4.\n\nCreates a Pistol, Bullet, Molotov, Bat, Axe, Knife, Harpoon, Arrow, Trap, or C4 using resources available at the Workshop or in the environment, without consuming inventory items.",
  "Requiere tener en el inventario los objetos necesarios para la operación seleccionada.\n\nCombina o separa objetos del inventario siguiendo las recetas disponibles.":
    "Requires the items needed for the selected operation to be in your inventory.\n\nCombines or separates inventory items using the available recipes.",
  Dar: "Give",
  "Debe tener el objeto a entregar.": "Must have an item to give.",
  "Transfiere un objeto a otro personaje.":
    "Transfers an item to another character.",
  "Permite entregar objetos adicionales en la misma acción.":
    "Allows giving additional items in the same action.",
  "Envenenar alimento": "Poison food",
  Dejar: "Drop",
  "Permite soltar un objeto en la localización o almacenarlo en taquilla para venta.":
    "Allows dropping an item at the location or storing it in a locker for sale.",
  Lanzar: "Throw",
  "Usar arma química": "Use chemical weapon",
  Asustar: "Scare",
  "Detonar C4": "Detonate C4",
  "detonó un C4 en": "detonated a C4 at",
  "Atacar con hacha": "Axe attack",
  "Golpear con bate": "Bat attack",
  "Atacar con motosierra": "Chainsaw attack",
  "Arrancar motosierra": "Start chainsaw",
  "Disparar pistola": "Shoot pistol",
  "Disparar arpón": "Shoot harpoon",
  "Disparar lanzacohetes": "Shoot rocket launcher",
  Puñetazo: "Punch",
  "Forzar cerradura": "Pick lock",
  Robar: "Steal",
  Fabricar: "Crafting",
  "Traficar en el mercado negro": "Black market trade",
  "Debe realizarse en el mercado negro.":
    "Must be performed at the black market.",
  "Permite vender hasta 4 objetos obteniendo 1 zarkan adicional por cada uno.":
    "Allows selling up to 4 items, receiving 1 additional zarkan for each one.",
  "Permite vender objetos adicionales.": "Allows selling additional items.",
  "Debe encontrarse en una casa o farmacia.": "Must be in a house or pharmacy.",
  "Permite ver a los personajes visibles de una localización adyacente.":
    "Allows viewing visible characters in an adjacent location.",
  "Revela los personajes visibles de una localización adyacente.":
    "Reveals visible characters in an adjacent location.",
  "Permite observar una localización a 2 de distancia.":
    "Allows observing a location two spaces away.",
  Registrar: "Search",
  Concentrarse: "Focus",
  Entrenar: "Train",
  "Activar cámaras": "Activate cameras",
  "Mirar por la ventana": "Look through window",
  "Usar prismáticos": "Use binoculars",
  Detectar: "Detect",
  "Usar antídoto": "Use antidote",
  "Inyectar virus": "Inject virus",
  "Inyectar vacuna": "Inject vaccine",
  "Requiere tener una vacuna.": "Requires a vaccine.",
  "Otorga inmunidad frente a pérdidas de vida por virus ajenos; puede aplicarse a otro personaje en la misma localización.":
    "Grants immunity to damage from other viruses; can be applied to another character in the same location.",
  Dormir: "Sleep",
  Muere: "Dies",
  "Queda inconsciente": "Knocked unconscious",
  "Acción fallida": "Failed action",
  "Equipo asignado": "Team assigned",
  Mercurio: "Mercury",
  Venus: "Venus",
  Tierra: "Earth",
  Marte: "Mars",
  Júpiter: "Jupiter",
  Saturno: "Saturn",
  Urano: "Uranus",
  Neptuno: "Neptune",
  Plutón: "Pluto",
  Ceres: "Ceres",
  Eris: "Eris",
  Makemake: "Makemake",
  Haumea: "Haumea",
  Sedna: "Sedna",
  Caronte: "Charon",
  Ganímedes: "Ganymede",
  Titán: "Titan",
  Calisto: "Callisto",
  Ío: "Io",
  Europa: "Europa",
  Manzana: "Apple",
  Plátano: "Banana",
  Fresa: "Strawberry",
  Naranja: "Orange",
  Limón: "Lemon",
  Uva: "Grape",
  Sandía: "Watermelon",
  Melón: "Melon",
  Piña: "Pineapple",
  Melocotón: "Peach",
  Cereza: "Cherry",
  Mango: "Mango",
  Pera: "Pear",
  Kiwi: "Kiwi",
  Ciruela: "Plum",
  Higo: "Fig",
  Frambuesa: "Raspberry",
  Mora: "Blackberry",
  Granada: "Pomegranate",
  Papaya: "Papaya",
  Orión: "Orion",
  Andrómeda: "Andromeda",
  Casiopea: "Cassiopeia",
  Fénix: "Phoenix",
  Pegaso: "Pegasus",
  Perseo: "Perseus",
  Centauro: "Centaurus",
  Dragón: "Draco",
  Lira: "Lyra",
  Cisne: "Cygnus",
  "Osa Mayor": "Ursa Major",
  "Osa Menor": "Ursa Minor",
  Hércules: "Hercules",
  Acuario: "Aquarius",
  Tauro: "Taurus",
  Géminis: "Gemini",
  Leo: "Leo",
  Escorpio: "Scorpio",
  Sagitario: "Sagittarius",
  Aries: "Aries",
  Gemelos: "Twins",
  Héroe: "Hero",
  Botella: "Bottle",
  Bebida: "Drink",
  Comida: "Food",
  Venda: "Bandage",
  Medicamento: "Medicine",
  Antídoto: "Antidote",
  "Chaleco antibalas": "Bulletproof vest",
  "Reduce en 1 el daño recibido y en 3 si procede de balas o flechas mientras permanezca en el inventario. No protege frente a fuego, veneno, virus, motosierra ni arma química.":
    "Reduces damage received by 1, or by 3 when it comes from bullets or arrows, while kept in the inventory. Does not protect against fire, poison, virus, chainsaws, or chemical weapons.",
  "No se puede robar.": "Cannot be stolen.",
  Bandolera: "Bandolier",
  "Aumenta la capacidad máxima de carga en 5 unidades mientras está en el inventario. Solo una bandolera puede aportar esta bonificación.":
    "Increases maximum load capacity by 5 while in the inventory. Only one bandolier grants this bonus.",
  Madera: "Wood",
  Pincho: "Spike",
  Cuchillo: "Knife",
  Bate: "Bat",
  "Bate con clavos": "Nail bat",
  Hacha: "Axe",
  Motosierra: "Chainsaw",
  Molotov: "Molotov",
  Pistola: "Pistol",
  Silenciador: "Silencer",
  "Pistola con silenciador": "Silenced pistol",
  Bala: "Bullet",
  Arpón: "Harpoon",
  Flecha: "Arrow",
  "Arma química": "Chemical weapon",
  Lanzacohetes: "Rocket launcher",
  Trampa: "Trap",
  "Explosivo C4": "C4 explosive",
  Detonador: "Detonator",
  Combustible: "Fuel",
  Clavos: "Nails",
  Veneno: "Poison",
  Virus: "Virus",
  Vacuna: "Vaccine",
  Ganzúa: "Lockpick",
  Prismáticos: "Binoculars",
  "Walkie talkie": "Walkie-talkie",
  Localizador: "Tracker",
  Bicicleta: "Bicycle",
  Taquilla: "Locker",
  "Caja fuerte": "Safe",
  "Moneda de 3 zarkans": "3-Zarkan coin",
  "Moneda con valor de 3 zarkans. Al recogerla se añaden 3 zarkans al saldo.":
    "A coin worth 3 zarkans. Picking it up adds 3 zarkans to your balance.",
  Cadáver: "Corpse",
  Vitalidad: "Vitality",
  "Fuerza 1": "Strength 1",
  "Fuerza 2": "Strength 2",
  "Fuerza 3": "Strength 3",
  "Fuerza 4": "Strength 4",
  "Fuerza 5": "Strength 5",
  "Destreza 1": "Dexterity 1",
  "Destreza 2": "Dexterity 2",
  "Permite priorizar hasta 3 objetos al robar a un jugador, incluso sin registro previo":
    "Allows prioritizing up to 3 items when stealing from a player, even without inspecting them first.",
  "Destreza 3": "Dexterity 3",
  "Destreza 4": "Dexterity 4",
  "Resistencia 1": "Endurance 1",
  "Resistencia 2": "Endurance 2",
  "Resistencia 3": "Endurance 3",
  "Resistencia 4": "Endurance 4",
  "Agilidad 1": "Agility 1",
  "Agilidad 2": "Agility 2",
  "Agilidad 3": "Agility 3",
  "Agilidad 4": "Agility 4",
  "Simpatía 1": "Charisma 1",
  "Simpatía 2": "Charisma 2",
  "Simpatía 3": "Charisma 3",
  "Simpatía 4": "Charisma 4",
  "Percepción 1": "Perception 1",
  "Percepción 2": "Perception 2",
  "Percepción 3": "Perception 3",
  "Percepción 4": "Perception 4",
  "Percepción 5": "Perception 5",
  "Percepción 6": "Perception 6",
  "H1 Codicioso": "H1 Greedy",
  "H2 Caníbal": "H2 Cannibal",
  "H3 Vendedor": "H3 Salesman",
  "H4 Pensionista": "H4 Pensioner",
  "H5 Indetectable": "H5 Undetectable",
  "H6 Valiente": "H6 Brave",
  "H7 Vengativo": "H7 Vengeful",
  "H8 Encantador": "H8 Charming",
  "H9 Cobarde": "H9 Coward",
  "Aumenta la vida máxima en 1": "Increases maximum health by 1",
  "Reduce el esfuerzo de los puñetazos en 3 puntos":
    "Reduces energy cost of punches by 3 points",
  "Reduce el esfuerzo de los ataques con cuchillo, bate y hacha en 3 puntos":
    "Reduces energy cost of knife, bat, and axe attacks by 3 points",
  "Reduce el esfuerzo de los disparos con arpón y pistola en 2 puntos":
    "Reduces energy cost of harpoon and pistol shots by 2 points",
  "Reduce el esfuerzo en 2 puntos en colocación de C4 y trampas y detonación de C4":
    "Reduces energy cost of placing C4 and traps, and detonating C4, by 2 points",
  "Reduce en 2 puntos el esfuerzo de lanzar objetos":
    "Reduces energy cost of throwing objects by 2 points",
  "Reduce en un turno el tiempo para forzar cerraduras y evita que se rompa la ganzúa":
    "Reduces lockpicking time by 1 turn and prevents the lockpick from breaking",
  "Permite fabricar gratuitamente un arma química, medicamento, veneno o antídoto elegido por el jugador. Se activa cuando se especifica el producto y está disponible, con un cooldown de 7 turnos; no se pierde si no se especifica.":
    "Allows crafting a chemical weapon, medicine, poison, or antidote chosen by the player for free. Activates when the product is specified and available, with a 7-turn cooldown; not consumed if unspecified.",
  "Permite realizar la acción fabricar sin estar en el taller":
    "Allows performing the crafting action without being at the workshop",
  "Aumenta en 5 unidades la capacidad máxima de peso":
    "Increases maximum weight capacity by 5 units",
  "Reduce en 1 el daño recibido (veneno y virus restan igualmente)":
    "Reduces damage taken by 1 (poison and virus still deal damage)",
  "Disminuye a 3 el mínimo de vida para desmayarse y quedar herido":
    "Decreases the health threshold to faint and become wounded to 3",
  "Solo puede morir si recibe daño estando a 1 de vida, si no cualquier daño que le fuera a matar le deja en 1 punto de vida, incluso la motosierra":
    "Can only die if taking damage while at 1 health; otherwise, any lethal damage leaves the character at 1 health, even from a chainsaw",
  "Aumenta un 25% la probabilidad de éxito de la acción esquivar":
    "Increases dodge action success chance by 25%",
  "Aumenta 1 punto de rapidez": "Increases speed by 1 point",
  "Reduce en 1 punto el esfuerzo por desplazamiento":
    "Reduces movement energy cost by 1 point",
  "Permite hacer una acción secundaria adicional":
    "Allows performing an additional secondary action",
  "Los jugadores neutrales muestran 5 objetos que el personaje no vea de la localización (requiere hablar). Tiene efecto incluso si se considera enemigo. Aumenta 2 punto de simpatía":
    "Neutral players reveal 5 unseen items at the location (requires talking). Takes effect even if considered an enemy. Increases charisma by 2 points",
  "Se puede dormir con jugadores neutrales. Tiene efecto incluso si se considera enemigo. Cada vez que se duerma con un neutral aumenta 2 puntos de simpatía":
    "Allows sleeping with neutral players. Takes effect even if considered an enemy. Increases charisma by 2 points each time you sleep with a neutral",
  "Permite controlar a 1 neutral civil (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales civiles. Aumenta 1 punto de simpatía":
    "Allows controlling 1 civilian neutral (requires talking). Takes effect even if considered an enemy. Once per match, reveals the position of all civilian neutrals. Increases charisma by 1 point",
  "Permite controlar a 1 neutral militar (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales militares. Aumenta 1 puntos de simpatía":
    "Allows controlling 1 military neutral (requires talking). Takes effect even if considered an enemy. Once per match, reveals the position of all military neutrals. Increases charisma by 1 point",
  "Reduce en 3 puntos el esfuerzo por detectar":
    "Reduces detection energy cost by 3 points",
  "Ve a los escondidos en la propia localización":
    "Reveals hidden characters in the current location",
  "Encuentra 1 objeto extra al realizar la acción buscar":
    "Finds 1 extra item when performing the search action",
  "Puede priorizar buscar una comida o bebida en cada búsqueda":
    "Can prioritize searching for a food or drink in each search",
  "Detecta puntos de esfuerzo (incluso los extras si se hubiera concentrado en ese turno), estado y objetos de todos los personajes que ve en la localización (igualmente requiere que los objetos sean descubiertos mediante un registro que se podría condicionar para poder concretar qué objeto robar). Si está desmayado ese turno no detecta nada":
    "Detects energy points (including bonuses if focused that turn), status, and items of all characters seen at the location (still requires items to be discovered via search to specify what to steal). If knocked out that turn, detects nothing",
  "Coge 1 objeto extra sin esfuerzo al realizar la acción coger":
    "Picks up 1 extra item without energy cost when performing the pick up action",
  "Permite alimentarse de los cadáveres sin necesidad de estar hambriento y no pierde vida por comer cadáver":
    "Allows feeding on corpses without being hungry and prevents health loss from eating a corpse",
  "Recibe 1 zarkan extra por cada venta en taquillas":
    "Receives 1 extra zarkan for each sale in lockers",
  "Recibe 1 zarkan extra cada turno": "Receives 1 extra zarkan each turn",
  "No puede ser descubierto mediante la acción detectar":
    "Cannot be discovered by the detect action",
  "No puede ser asustado si no da su consentimiento":
    "Cannot be scared without consent",
  "Al ser atacado contrataca de inmediato con cuchillo, bate con o sin clavos o hacha (aleatorio) al agresor siempre que esté en la misma localización, incluso si se desmayara. Si no dispusiera de ninguna de estas armas contrataca con puñetazo. Los contrataques no afectan al cooldown ni se consideran una acción en cuanto a la intoxicación. Se puede decidir no contratacar a un jugador neutral (previo aviso). La habilidad no se activa si es por un contrataque":
    "When attacked, immediately counterattacks the attacker with a knife, nail/regular bat, or axe (random) if in the same location, even if knocked out. Counterattacks with a punch if none of these weapons are available. Counterattacks do not affect cooldowns or count as an action for intoxication. Can choose not to counterattack a neutral player (with prior notice). Does not trigger from a counterattack",
  "Los jugadores neutrales realizan estas acciones para favorecer al jugador que tenga esta habilidad al compartir localización:\n- Si el jugador con esta habilidad está intoxicado usa un antídoto para desintoxicarle. Tiene efecto incluso si se considera enemigo\n- Protege al jugador con esta habilidad, siempre que no sea considerado enemigo\nAumenta 3 puntos de simpatía":
    "Neutral players perform these actions to help the player with this skill when sharing a location:\n- If the player with this skill is poisoned, uses an antidote to cure them. Takes effect even if considered an enemy\n- Protects the player with this skill, provided they are not considered an enemy\nIncreases charisma by 3 points",
  "Se esconde automáticamente para no ser visto en la localización. Tampoco es visible a los prismáticos, al dron espía, a los neutrales ni al sicario. Sale de su escondite en un turno si ataca, dispara (salvo si usa silenciador), se desplaza, lanza, asusta, roba, duerme con esfuerzo o se enamora. También si protege a otro jugador que no esté escondido o si un jugador que no esté escondido le protege (esto último requiere autorización del escondido). No puede priorizarse atacar o asustar a un escondido, pero puede ser asustado o atacado si el ataque no fuera a dar a nadie o fuera un ataque con bate. Aunque un jugador escondido fuese agredido no sería visible en ese turno si no se da alguno de los casos anteriores":
    "Automatically hides to stay unseen in the location. Also invisible to binoculars, spy drone, neutrals, and hitman. Comes out of hiding if attacking, shooting (unless using a silencer), moving, throwing, scaring, stealing, sleeping with effort, or falling in love. Also if protecting an unhidden player or being protected by one (with permission). Cannot be prioritized for attacks or scaring, but can be attacked/scared if an attack hits no one or is a bat attack. Even if assaulted, stays hidden that turn unless one of the conditions occurs"
};

const PREFIX_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^Volume:\s*/, "Volumen: "],
  [/^Health\s+/, "Salud "],
  [/^Energy\s+/, "Energía "],
  [/^Energy:\s*/, "Energía: "],
  [/^CD:\s*/, "Enf: "],
  [/^Weight:\s*/, "Peso: "],
  [/^Team:\s*/, "Equipo: "],
  [/^Missing\s+/, "Falta "],
  [/^Inventory \(Load\s*/, "Inventario (Carga "],
  [/^Turn\s+/, "Turno "],
  [/^Rank:\s*/, "Rango: "],
  [/^Cost:\s*/, "Coste: "],
  [/^Available Skill:\s*/, "Puntos disponibles: "],
  [/^Players \(/, "Jugadores ("],
  [/^Teams \(/, "Equipos ("],
  [/^Match:\s*/, "Partida: "],
  [/^Name:\s*/, "Nombre: "],
  [/^Creator:\s*/, "Creador: "],
  [/^Save failed:\s*/, "Error al guardar: "],
  [/^Error:\s*/, "Error: "],
  [/^Found (\d+) matches:/, "Se encontraron $1 partidas:"],
  [
    /^Found (\d+) matches you've joined:/,
    "Se encontraron $1 partidas en las que participas:"
  ],
  [/^Auto-advance in\s*/, "Avance automático en "],
  [/^Match created:\s*/, "Partida creada: "],
  [/^Turn submitted\. Turn #:\s*/, "Turno enviado. Turno n.º: "],
  [/^Join OK:/, "Unión correcta:"],
  [/^Settings updated:/, "Ajustes actualizados:"],
  [/^Failed to save skin:/, "No se pudo guardar la apariencia: "],
  [/^Failed to update settings$/, "No se pudieron actualizar los ajustes"],
  [/^Match completed in (\d+) turn(s?)$/, "Partida completada en $1 turno$2"],
  [/^Match completed in\s*/, "Partida completada en "],
  [/^User ID:/gm, "ID de usuario:"],
  [/^Username:/gm, "Nombre de usuario:"],
  [/^Email:/gm, "Correo electrónico:"],
  [/^Display Name:/gm, "Nombre visible:"],
  [/\bMatches:/g, "Partidas:"],
  [/\bWins:/g, "Victorias:"],
  [/\bLosses:/g, "Derrotas:"],
  [/\bDraws:/g, "Empates:"],
  [/\bWin streak:/g, "Racha de victorias:"],
  [/\bRank:/g, "Rango:"],
  [/^Tile destroyed at\s*/, "Casilla destruida en "]
];

let locale: Locale = readInitialLocale();
let installed = false;
const localizedTexts = new Set<Phaser.GameObjects.Text>();
const hookedTexts = new WeakSet<Phaser.GameObjects.Text>();
const sourceTexts = new WeakMap<Phaser.GameObjects.Text, TextValue>();
let originalSetText:
  | ((
      this: Phaser.GameObjects.Text,
      value: TextValue
    ) => Phaser.GameObjects.Text)
  | null = null;

function readInitialLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "es") {
      return stored;
    }
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("es")
  ) {
    return "es";
  }
  return "en";
}

function translateRecipeText(value: string): string | null {
  const itemName = (name: string) => ENGLISH_GAME_NAMES[name] ?? name;
  const components = (value: string) =>
    value
      .split(", ")
      .map((component) => {
        const match = component.match(/^(.+) ×(\d+)$/);
        return match
          ? `${itemName(match[1])} ×${match[2]}`
          : itemName(component);
      })
      .join(", ");
  const label = value.match(/^(Combinar|Separar): (.+)$/);
  if (label) {
    return `${label[1] === "Combinar" ? "Combine" : "Separate"}: ${itemName(label[2])}`;
  }
  const translatedLines = value.split("\n").map((line) => {
    const match = line.match(/^(Requiere|Produce|Falta): (.*)$/);
    if (!match) {
      return null;
    }
    const prefix =
      match[1] === "Requiere"
        ? "Requires"
        : match[1] === "Produce"
          ? "Produces"
          : "Missing";
    return `${prefix}: ${components(match[2])}`;
  });
  return translatedLines.every((line) => line !== null)
    ? translatedLines.join("\n")
    : null;
}

function translateValue(value: string): string {
  if (locale === "en") {
    const recipeText = translateRecipeText(value);
    if (recipeText !== null) {
      return recipeText;
    }
    const numberedTeamName = value.match(/^Equipo (\d+)$/);
    if (numberedTeamName) {
      return `Team ${numberedTeamName[1]}`;
    }
    const tileDestroyed = value.match(/^Casilla destruida en(?:\s+(.*))?$/);
    if (tileDestroyed) {
      return tileDestroyed[1]
        ? `Tile destroyed at ${tileDestroyed[1]}`
        : "Tile destroyed at";
    }
    const cdMatch = value.match(/^Enf:\s*(.*)$/);
    if (cdMatch) {
      return cdMatch[1] ? `CD: ${cdMatch[1]}` : "CD:";
    }
    return ENGLISH_GAME_NAMES[value] ?? value;
  }
  const direct = SPANISH_TRANSLATIONS[value];
  if (direct) {
    return direct;
  }
  // Preserve BBCode generated for rich action descriptions. Treating a
  // `[color=...]...[/color]` value as a bracket label corrupts its tags.
  if (
    /\[(?:color|bgcolor)=[^\]]+\]/i.test(value) ||
    /\[\/(?:color|bgcolor)\]/i.test(value)
  ) {
    return value;
  }
  const bracketMatch = value.match(/^\[\s*(.*?)\s*\]$/);
  if (bracketMatch) {
    const translated = translateValue(bracketMatch[1]);
    return `[ ${translated} ]`;
  }
  for (const [pattern, replacement] of PREFIX_TRANSLATIONS) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement);
    }
  }
  return value;
}

function translateTextValue(value: TextValue): TextValue {
  return Array.isArray(value)
    ? value.map((entry) => translateValue(entry))
    : translateValue(value);
}

export function t(value: string): string {
  return translateValue(value);
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(nextLocale: Locale): void {
  if (locale === nextLocale) {
    return;
  }
  locale = nextLocale;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  refreshLocalizedTexts();
}

export function toggleLocale(): Locale {
  const nextLocale: Locale = locale === "en" ? "es" : "en";
  setLocale(nextLocale);
  return nextLocale;
}

export function installPhaserLocalization(): void {
  if (installed) {
    return;
  }
  installed = true;
  originalSetText = Phaser.GameObjects.Text.prototype.setText;
  const setText = originalSetText;
  Phaser.GameObjects.Text.prototype.setText = function (value: TextValue) {
    sourceTexts.set(this, value);
    localizedTexts.add(this);
    if (!hookedTexts.has(this)) {
      hookedTexts.add(this);
      this.once("destroy", () => {
        localizedTexts.delete(this);
        sourceTexts.delete(this);
      });
    }
    return setText.call(this, translateTextValue(value));
  };
}

function refreshLocalizedTexts(): void {
  if (!originalSetText) {
    return;
  }
  for (const text of localizedTexts) {
    const source = sourceTexts.get(text);
    if (!source || !text.scene) {
      localizedTexts.delete(text);
      continue;
    }
    originalSetText.call(text, translateTextValue(source));
  }
}
