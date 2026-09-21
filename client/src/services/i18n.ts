import Phaser from "phaser";

export type Locale = "en" | "es";

type TextValue = string | string[];

const LOCALE_STORAGE_KEY = "zarka_locale";

const SPANISH_TRANSLATIONS: Record<string, string> = {
  "End Game Report": "Informe final",
  "Loading end-game report...": "Cargando informe final...",
  "Loading game...": "Cargando partida...",
  "Report unavailable": "Informe no disponible",
  "Victory!": "¡Victoria!",
  "Match Draw": "Empate",
  Turns: "Turnos",
  "Team Leaderboard": "Clasificación de equipos",
  Winner: "Ganador",
  Damage: "Daño",
  Received: "Recibido",
  Kills: "Bajas",
  "Winning Characters": "Personajes ganadores",
  "Player Statistics": "Estadísticas de jugadores",
  "Average weight": "Peso medio",
  Actions: "Acciones",
  Alive: "Vivo",
  Eliminated: "Eliminado",
  Achievements: "Logros",
  "No achievements awarded": "No se otorgaron logros",
  Scavenger: "Carroñero",
  Glutton: "Glotón",
  Medic: "Médico",
  Runner: "Corredor",
  Finished: "Finalizada",
  Win: "Victoria",
  Report: "Informe",
  "Account Settings": "Configuración de la cuenta",
  "Player Stats": "Estadísticas del jugador",
  "Skin Customization": "Personalización de apariencia",
  "Facebook Account": "Cuenta de Facebook",
  "Checking Facebook link status...": "Comprobando el estado de Facebook...",
  "Link Facebook": "Vincular Facebook",
  "Unlink Facebook": "Desvincular Facebook",
  "Audio Settings": "Configuración de audio",
  "[ ] View all actions and players": "[ ] Ver todas las acciones y jugadores",
  "[x] View all actions and players": "[x] Ver todas las acciones y jugadores",
  "Back to Game": "Volver al juego",
  Preview: "Vista previa",
  "Skin saved!": "¡Apariencia guardada!",
  "Stats unavailable": "Estadísticas no disponibles",
  "Error loading account information": "Error al cargar la información de la cuenta",
  "Linking Facebook account...": "Vinculando la cuenta de Facebook...",
  "Facebook SDK not available": "El SDK de Facebook no está disponible",
  "Facebook SDK not available. Please check your internet connection.": "El SDK de Facebook no está disponible. Comprueba tu conexión a internet.",
  "Facebook login cancelled": "Inicio de sesión de Facebook cancelado",
  "Facebook account linked successfully!": "¡Cuenta de Facebook vinculada correctamente!",
  "Failed to link Facebook account": "No se pudo vincular la cuenta de Facebook",
  "Unlinking Facebook account...": "Desvinculando la cuenta de Facebook...",
  "Facebook account unlinked successfully!": "¡Cuenta de Facebook desvinculada correctamente!",
  "Facebook account is linked": "La cuenta de Facebook está vinculada",
  "Facebook account is not linked": "La cuenta de Facebook no está vinculada",
  "Failed to unlink Facebook account": "No se pudo desvincular la cuenta de Facebook",
  "Display name must be 128 characters or less": "El nombre visible debe tener 128 caracteres o menos",
  "Enter new display name:": "Escribe el nuevo nombre visible:",
  "Match name": "Nombre de la partida",
  "Are you sure you want to start the match? Players will no longer be able to join.": "¿Seguro que quieres comenzar la partida? Los jugadores ya no podrán unirse.",
  "Are you sure you want to remove this match? This action cannot be undone.": "¿Seguro que quieres eliminar esta partida? Esta acción no se puede deshacer.",
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
  "Second Target Player": "Segundo jugador objetivo",
  "None selected": "Ninguno seleccionado",
  "Extra power": "Potencia adicional",
  "Priority Items": "Objetos prioritarios",
  "No items carried.": "No llevas objetos.",
  Toggle: "Alternar",
  Edit: "Editar",
  Map: "Mapa",
  Panel: "Panel",
  "Settings sync:": "Sincronización de ajustes:",
  "Authenticated. Use the buttons below.": "Autenticado. Usa los botones de abajo.",
  "Left match.": "Has abandonado la partida.",
  "Back to main menu (still in match).": "Volver al menú principal (sigues en la partida).",
  "Match was already started.": "La partida ya había comenzado.",
  "Match started.": "Partida comenzada.",
  "Failed to update settings": "No se pudieron actualizar los ajustes",
  "Match removed successfully.": "Partida eliminada correctamente.",
  "Failed to remove match (see console).": "No se pudo eliminar la partida (consulta la consola).",
  "Maximum of 3 matches per user reached": "Has alcanzado el máximo de 3 partidas por usuario",
  "Failed to create match (see console).": "No se pudo crear la partida (consulta la consola).",
  "List Matches": "Lista de partidas",
  "My Matches": "Mis partidas",
  "Create Match": "Crear partida",
  Logout: "Cerrar sesión",
  "Match Lobby": "Sala de partida",
  "Waiting for players...": "Esperando a los jugadores...",
  "Waiting": "Esperando",
  "In Progress": "En curso",
  "Carried items:": "Objetos transportados:",
  "Return to Game": "Volver al juego",
  "Back to Menu": "Volver al menú",
  "Leave Match": "Abandonar partida",
  "End Turn": "Terminar turno",
  "Start Match": "Comenzar partida",
  "Remove Match": "Eliminar partida",
  Rename: "Cambiar nombre",
  "Players": "Jugadores",
  "Teams": "Equipos",
  "Matches": "Partidas",
  "Fetching...": "Cargando...",
  Refresh: "Actualizar",
  Back: "Atrás",
  View: "Ver",
  Leave: "Abandonar",
  "No matches found.": "No se encontraron partidas.",
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
  "Click to enter email or username...": "Pulsa para escribir el correo o usuario...",
  "Click to enter password...": "Pulsa para escribir la contraseña...",
  "Click to enter username...": "Pulsa para escribir el nombre de usuario...",
  "Create your account": "Crea tu cuenta",
  "Login with username or email": "Inicia sesión con usuario o correo",
  "Initializing Facebook login...": "Inicializando el inicio de sesión de Facebook...",
  "Please complete Facebook login...": "Completa el inicio de sesión de Facebook...",
  "Facebook login was cancelled or failed.": "El inicio de sesión de Facebook se canceló o falló.",
  "Authenticating with game server...": "Autenticando con el servidor del juego...",
  "Initializing Google login...": "Inicializando el inicio de sesión de Google...",
  "Please complete Google login...": "Completa el inicio de sesión de Google...",
  "Google login was cancelled or failed.": "El inicio de sesión de Google se canceló o falló.",
  "Google login is not configured. Please use another login method.": "El inicio de sesión de Google no está configurado. Usa otro método.",
  "Google login is unavailable. Please check your internet connection.": "El inicio de sesión de Google no está disponible. Comprueba tu conexión.",
  "Logging in...": "Iniciando sesión...",
  "Please enter username/email and password.": "Escribe el usuario/correo y la contraseña.",
  "Please enter a username.": "Escribe un nombre de usuario.",
  "Please enter both email and password.": "Escribe el correo y la contraseña.",
  "Password must be at least 8 characters long.": "La contraseña debe tener al menos 8 caracteres.",
  "Creating account...": "Creando cuenta...",
  "Account created successfully!": "¡Cuenta creada correctamente!",
  "Logging in as guest...": "Iniciando sesión como invitado...",
  "Guest login failed. Please try again.": "El inicio de sesión como invitado falló. Inténtalo de nuevo.",
  "Login successful! Starting game...": "¡Inicio de sesión correcto! Iniciando el juego...",
  "Main Action": "Acción principal",
  "Secondary Action": "Acción secundaria",
  "Extra Secondary Action": "Acción secundaria adicional",
  Inventory: "Inventario",
  Shop: "Tienda",
  Buy: "Comprar",
  Confirm: "Confirmar",
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
  Bomber: "Bombardero",
  Hitman: "Sicario",
  Cocoman: "Cocoman",
  "The trafficker delivers an arrow at the end of the turn.": "El traficante entrega una flecha al final del turno.",
  "The trafficker delivers an antidote at the end of the turn.": "El traficante entrega un antídoto al final del turno.",
  "The trafficker delivers a bullet at the end of the turn.": "El traficante entrega una bala al final del turno.",
  "The trafficker delivers food at the end of the turn.": "El traficante entrega comida al final del turno.",
  "The trafficker delivers a bandage at the end of the turn.": "El traficante entrega una venda al final del turno.",
  "The trafficker delivers a harpoon at the end of the turn.": "El traficante entrega un arpón al final del turno.",
  "The trafficker delivers a trap at the end of the turn.": "El traficante entrega una trampa al final del turno.",
  "The trafficker delivers a pistol at the end of the turn.": "El traficante entrega una pistola al final del turno.",
  "The trafficker delivers a C4 explosive at the end of the turn.": "El traficante entrega un explosivo C4 al final del turno.",
  "The trafficker delivers a bulletproof vest at the end of the turn.": "El traficante entrega un chaleco antibalas al final del turno.",
  "The trafficker delivers a rocket launcher at the end of the turn.": "El traficante entrega un lanzacohetes al final del turno.",
  "Reports the characters visible in the security room that turn.": "Informa de los personajes visibles en la sala de seguridad durante ese turno.",
  "Reports the players visible in a chosen location that turn.": "Informa de los jugadores visibles en una ubicación elegida durante ese turno.",
  "Reports the investigated player's team immediately.": "Informa inmediatamente del equipo del jugador investigado.",
  "Reports the number of traps or C4 one location away.": "Informa del número de trampas o C4 a una ubicación de distancia.",
  "Transports up to four consenting people between locations.": "Transporta hasta cuatro personas que acepten entre ubicaciones.",
  "Intoxicates every character in a location.": "Intoxica a todos los personajes de una ubicación.",
  "Creates a three-turn fire in a location.": "Crea un incendio de tres turnos en una ubicación.",
  "Deals five unavoidable damage to every player in a location.": "Inflige cinco puntos de daño inevitable a todos los jugadores de una ubicación.",
  "A mercenary that attacks the assigned target team.": "Un mercenario que ataca al equipo objetivo asignado.",
  "A prestigious hitman with a chainsaw and bulletproof vest.": "Un sicario prestigioso con una motosierra y un chaleco antibalas.",
  "20 + 5 per person": "20 + 5 por persona",
  "Match Chat": "Chat de partida",
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
  "Already chosen as extra secondary action": "Ya elegida como acción secundaria adicional",
  "Already chosen as secondary action": "Ya elegida como acción secundaria",
  "No action": "Sin acción",
  "Action failed": "Acción fallida",
  "Incoming Destruction": "Destrucción entrante",
  "Defeated in battle": "Derrotado en combate",
  "erupted in flames": "ardió en llamas",
  Skills: "Habilidades",
  Offensive: "Ataque",
  Defense: "Defensa",
  Utility: "Utilidad",
  NPC: "PNJ",
  Health: "Salud",
  Energy: "Energía",
  "Energy: Unknown": "Energía: Desconocida",
  Weight: "Peso",
  Team: "Equipo",
  team: "equipo",
  "belongs to the team": "pertenece al equipo",
  "infiltrated in team": "infiltrado en el equipo",
  energy: "energía",
  Detected: "Detectado",
  Affected: "Afectado",
  "was affected": "fue afectado",
  recovered: "recuperó",
  lost: "perdió",
  "detected nobody": "no detectó a nadie",
  ea: "cada uno",
  "was affected by a virus": "fue afectado por un virus",
  "was exposed to a virus": "estuvo expuesto a un virus",
  Missing: "Falta",
  "Missing bat": "Falta el bate",
  "Missing pistol": "Falta la pistola",
  "Missing bullet": "Falta la bala",
  "Missing pistol, bullet": "Faltan la pistola y la bala",
  "Not visible": "No visible",
  "Not available in this build.": "No disponible en esta versión.",
  "[ ] Ready":  "[ ] Listo",
  "[x] Ready": "[x] Listo",
  "[ ] Prioritize food/drink": "[ ] Priorizar comida/bebida",
  "[x] Prioritize food/drink": "[x] Priorizar comida/bebida",
  "[ ] Sell instead": "[ ] Vender en su lugar",
  "[x] Sell instead": "[x] Vender en su lugar",
  "[ ] Single target (Area)": "[ ] Objetivo único (área)",
  "[x] Single target (Area)": "[x] Objetivo único (área)",
  "No replays yet.": "Todavía no hay repeticiones.",
  Play: "Reproducir",
  "Not Implemented": "No implementado",
  MAX: "MÁX",
  Revert: "Revertir",
  "Select action": "Seleccionar acción",
  "Choose action": "Elegir acción",
  "Choose Items": "Elegir objetos",
  "No available players": "No hay jugadores disponibles",
  "No target": "Sin objetivo",
  "No priority": "Sin prioridad",
  "No prioritized items": "No hay objetos prioritarios",
  "No secondary action": "Sin acción secundaria",
  "Tap a player to target them": "Pulsa un jugador para seleccionarlo",
  "Tap an item to prioritize it": "Pulsa un objeto para priorizarlo",
  "Select player": "Seleccionar jugador",
  "Selecting...": "Seleccionando...",
  "Add priority item": "Añadir objeto prioritario",
  "Removes every prioritized item.": "Elimina todos los objetos prioritarios.",
  "Removes the current priority target.": "Elimina el objetivo prioritario actual.",
  "Removes the extra secondary action.": "Elimina la acción secundaria adicional.",
  "Removes the planned secondary action.": "Elimina la acción secundaria planificada.",
  "Replay not available.": "Repetición no disponible.",
  "No events recorded.": "No hay eventos registrados.",
  "Skip Time": "Saltar tiempo",
  "Starting...": "Comenzando...",
  "Match Started": "Partida comenzada",
  "Starting Match": "Comenzando partida",
  "Server unavailable. Please check your connection or try again later.": "Servidor no disponible. Comprueba tu conexión e inténtalo de nuevo.",
  "Your session has expired. Please log in again.": "Tu sesión ha caducado. Inicia sesión de nuevo.",
  "Unsupported payload type: ": "Tipo de respuesta no compatible: ",
  "Select Extra Secondary Action": "Seleccionar acción secundaria adicional",
  "No extra secondary action": "Sin acción secundaria adicional",
  "Upgrade": "Mejorar",
  "+ Upgrade": "+ Mejorar",
  "Available Skill: 0": "Puntos de habilidad disponibles: 0",
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
  "Game over": "Fin de la partida"
};

const ENGLISH_GAME_NAMES: Record<string, string> = {
  "Crear un incendio": "Start a fire",
  Recuperarse: "Recover",
  Alimentar: "Feed",
  Desayunar: "Have breakfast",
  "Usar venda": "Use bandage",
  "Usar medicamento": "Use medicine",
  Hablar: "Talk",
  "Poner localizador": "Place tracker",
  "Colocar C4": "Place C4",
  "Colocar trampa": "Place trap",
  Proteger: "Protect",
  Esquivar: "Dodge",
  "Atacar con cuchillo": "Knife attack",
  Desplazarse: "Move",
  Repostar: "Refuel",
  Coger: "Pick up",
  Buscar: "Search",
  Manipular: "Manipulate",
  Dar: "Give",
  "Envenenar alimento": "Poison food",
  Dejar: "Drop",
  "Permite soltar un objeto en la localización o almacenarlo en taquilla para venta.":
    "Allows dropping an item at the location or storing it in a locker for sale.",
  Lanzar: "Throw",
  "Usar arma química": "Use chemical weapon",
  Asustar: "Scare",
  "Detonar C4": "Detonate C4",
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
  Fabricar: "Craft",
  "Traficar en el mercado negro": "Black market trade",
  "Debe realizarse en el mercado negro.": "Must be performed at the black market.",
  "Permite vender hasta 4 objetos obteniendo 1 zarkan adicional por cada uno.":
    "Allows selling up to 4 items, receiving 1 additional zarkan for each one.",
  "Permite vender objetos adicionales.": "Allows selling additional items.",
  "Debe encontrarse en una casa o farmacia.":
    "Must be in a house or pharmacy.",
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
  Dormir: "Sleep",
  Muere: "Dies",
  "Queda inconsciente": "Knocked unconscious",
  "Acción fallida": "Failed action",
  "Equipo asignado": "Team assigned",
  Botella: "Bottle",
  Bebida: "Drink",
  Comida: "Food",
  Venda: "Bandage",
  Medicamento: "Medicine",
  Antídoto: "Antidote",
  "Chaleco antibalas": "Bulletproof vest",
  Bandolera: "Bandolier",
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
  Cadáver: "Corpse",
  Vitalidad: "Vitality",
  "Fuerza 1": "Strength 1",
  "Fuerza 2": "Strength 2",
  "Fuerza 3": "Strength 3",
  "Fuerza 4": "Strength 4",
  "Fuerza 5": "Strength 5",
  "Destreza 1": "Dexterity 1",
  "Destreza 2": "Dexterity 2",
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
  "Percepción 6": "Perception 6"
};

const PREFIX_TRANSLATIONS: Array<[RegExp, string]> = [
  [/^Volume:\s*/, "Volumen: "],
  [/^Health\s+/, "Salud "],
  [/^Energy\s+/, "Energía "],
  [/^Energy:\s*/, "Energía: "],
  [/^Weight:\s*/, "Peso: "],
  [/^Team:\s*/, "Equipo: "],
  [/^Missing\s+/, "Falta "],
  [/^Inventory \(Load\s*/, "Inventario (Carga "],
  [/^Turn\s+/, "Turno "],
  [/^Rank:\s*/, "Rango: "],
  [/^Cost:\s*/, "Coste: "],
  [/^Available Skill:\s*/, "Puntos de habilidad disponibles: "],
  [/^Players \(/, "Jugadores ("],
  [/^Teams \(/, "Equipos ("],
  [/^Match:\s*/, "Partida: "],
  [/^Name:\s*/, "Nombre: "],
  [/^Creator:\s*/, "Creador: "],
  [/^Save failed:\s*/, "Error al guardar: "],
  [/^Error:\s*/, "Error: "],
  [/^Found (\d+) matches:/, "Se encontraron $1 partidas:"],
  [/^Found (\d+) matches you've joined:/, "Se encontraron $1 partidas en las que participas:"],
  [/^Auto-advance in\s*/, "Avance automático en "],
  [/^Match created:\s*/, "Partida creada: "],
  [/^Turn submitted\. Turn #:\s*/, "Turno enviado. Turno n.º: "],
  [/^Join OK:/, "Unión correcta:"],
  [/^Settings updated:/, "Ajustes actualizados:"],
  [/^Failed to save skin:/, "No se pudo guardar la apariencia: "],
  [/^Failed to update settings$/, "No se pudieron actualizar los ajustes"],
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
  [/\bRank:/g, "Rango:"]
];

let locale: Locale = readInitialLocale();
let installed = false;
const localizedTexts = new Set<Phaser.GameObjects.Text>();
const hookedTexts = new WeakSet<Phaser.GameObjects.Text>();
const sourceTexts = new WeakMap<Phaser.GameObjects.Text, TextValue>();
let originalSetText: ((this: Phaser.GameObjects.Text, value: TextValue) => Phaser.GameObjects.Text) | null = null;

function readInitialLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "es") {
      return stored;
    }
  }
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("es")) {
    return "es";
  }
  return "en";
}

function translateValue(value: string): string {
  if (locale === "en") {
    return ENGLISH_GAME_NAMES[value] ?? value;
  }
  const direct = SPANISH_TRANSLATIONS[value];
  if (direct) {
    return direct;
  }
  // Preserve BBCode generated for rich action descriptions. Treating a
  // `[color=...]...[/color]` value as a bracket label corrupts its tags.
  if (/\[(?:color|bgcolor)=[^\]]+\]/i.test(value) ||
      /\[\/(?:color|bgcolor)\]/i.test(value)) {
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
  return Array.isArray(value) ? value.map((entry) => translateValue(entry)) : translateValue(value);
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
