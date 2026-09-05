import type { SkillLibraryDefinition } from "./Skill";

export const SkillLibrary: SkillLibraryDefinition = {
  vitality: {
    id: "vitality",
    name: "Vitalidad",
    description: "Aumenta la vida máxima en 1",
    cost: 2,
    max: 10,
    implemented: true,
    category: "Vitalidad"
  },
  strength1: {
    id: "strength1",
    name: "Fuerza 1",
    description: "Reduce el esfuerzo de los puñetazos en 3 puntos",
    cost: 1,
    max: 4,
    implemented: false,
    category: "Fuerza"
  },
  strength2: {
    id: "strength2",
    name: "Fuerza 2",
    description:
      "Reduce el esfuerzo de los ataques con cuchillo, bate y hacha en 3 puntos",
    cost: 3,
    max: 4,
    implemented: false,
    category: "Fuerza"
  },
  strength3: {
    id: "strength3",
    name: "Fuerza 3",
    description:
      "Reduce el esfuerzo de los disparos con arpón y pistola en 2 puntos",
    cost: 2,
    max: 2,
    implemented: false,
    category: "Fuerza"
  },
  strength4: {
    id: "strength4",
    name: "Fuerza 4",
    description:
      "Reduce el esfuerzo en 2 puntos en colocación de C4 y trampas y detonación de C4",
    cost: 2,
    max: 2,
    implemented: false,
    category: "Fuerza"
  },
  strength5: {
    id: "strength5",
    name: "Fuerza 5",
    description: "Permite lanzar 1 objeto extra sin coste",
    cost: 2,
    max: 1,
    implemented: false,
    category: "Fuerza"
  },
  dexterity1: {
    id: "dexterity1",
    name: "Destreza 1",
    description: "Reduce un turno en forzar cerraduras",
    cost: 2,
    max: 2,
    implemented: false,
    category: "Destreza"
  },
  dexterity2: {
    id: "dexterity2",
    name: "Destreza 2",
    description:
      "Permite concretar 1 objeto al robar a un jugador sin registro previo",
    cost: 3,
    max: 1,
    implemented: false,
    category: "Destreza"
  },
  dexterity3: {
    id: "dexterity3",
    name: "Destreza 3",
    description:
      "Permite fabricar gratuitamente (sin gasto de acción) un arma química, medicamento, veneno o antídoto (elegido por el propio jugador) en el turno 1- 8 - 15 - 22 - 29. Debe ser especificado en el turno exacto o se perderá",
    cost: 10,
    max: 1,
    implemented: false,
    category: "Destreza"
  },
  dexterity4: {
    id: "dexterity4",
    name: "Destreza 4",
    description: "Permite realizar la acción fabricar sin estar en el taller",
    cost: 10,
    max: 1,
    implemented: false,
    category: "Destreza"
  },
  resilience1: {
    id: "resilience1",
    name: "Resistencia 1",
    description: "Aumenta en 5 unidades la capacidad máxima de peso",
    cost: 2,
    max: 3,
    implemented: false,
    category: "Resistencia"
  },
  resilience2: {
    id: "resilience2",
    name: "Resistencia 2",
    description:
      "Reduce en 1 el daño recibido (veneno y virus restan igualmente)",
    cost: 4,
    max: 2,
    implemented: false,
    category: "Resistencia"
  },
  resilience3: {
    id: "resilience3",
    name: "Resistencia 3",
    description:
      "Disminuye a 3 el mínimo de vida para desmayarse y quedar herido",
    cost: 4,
    max: 1,
    implemented: false,
    category: "Resistencia"
  },
  resilience4: {
    id: "resilience4",
    name: "Resistencia 4",
    description:
      "Solo puede morir si recibe daño estando a 1 de vida, si no cualquier daño que le fuera a matar le deja en 1 punto de vida, incluso la motosierra",
    cost: 10,
    max: 1,
    implemented: false,
    category: "Resistencia"
  },
  agility1: {
    id: "agility1",
    name: "Agilidad 1",
    description:
      "Aumenta un 25% la probabilidad de éxito de la acción esquivar",
    cost: 1,
    max: 3,
    implemented: false,
    category: "Agilidad"
  },
  agility2: {
    id: "agility2",
    name: "Agilidad 2",
    description: "Aumenta 1 punto de rapidez",
    cost: 1,
    max: 3,
    implemented: false,
    category: "Agilidad"
  },
  agility3: {
    id: "agility3",
    name: "Agilidad 3",
    description: "Reduce en 1 punto el esfuerzo por desplazamiento",
    cost: 1,
    max: 3,
    implemented: false,
    category: "Agilidad"
  },
  agility4: {
    id: "agility4",
    name: "Agilidad 4",
    description: "Permite hacer una acción secundaria adicional",
    cost: 5,
    max: 1,
    implemented: false,
    category: "Agilidad"
  },
  charisma1: {
    id: "charisma1",
    name: "Simpatía 1",
    description:
      "Los jugadores neutrales muestran 5 objetos que el personaje no vea de la localización (requiere hablar). Tiene efecto incluso si se considera enemigo. Aumenta 2 punto de simpatía",
    cost: 3,
    max: 1,
    implemented: false,
    category: "Simpatía"
  },
  charisma2: {
    id: "charisma2",
    name: "Simpatía 2",
    description:
      "Se puede dormir con jugadores neutrales. Tiene efecto incluso si se considera enemigo. Cada vez que se duerma con un neutral aumenta 2 puntos de simpatía",
    cost: 2,
    max: 1,
    implemented: false,
    category: "Simpatía"
  },
  charisma3: {
    id: "charisma3",
    name: "Simpatía 3",
    description:
      "Permite controlar a 1 neutral civil (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales civiles. Aumenta 1 punto de simpatía",
    cost: 10,
    max: 1,
    implemented: false,
    category: "Simpatía"
  },
  charisma4: {
    id: "charisma4",
    name: "Simpatía 4",
    description:
      "Permite controlar a 1 neutral militar (requiere hablar). Tiene efecto incluso si se considera enemigo. Una vez en toda la partida podrá saber la posición de todos los neutrales militares. Aumenta 1 puntos de simpatía",
    cost: 15,
    max: 1,
    implemented: false,
    category: "Simpatía"
  },
  perception1: {
    id: "perception1",
    name: "Percepción 1",
    description: "Reduce en 3 puntos el esfuerzo por detectar",
    cost: 3,
    max: 3,
    implemented: false,
    category: "Percepción"
  },
  perception2: {
    id: "perception2",
    name: "Percepción 2",
    description: "Ve a los escondidos en la propia localización",
    cost: 2,
    max: 1,
    implemented: false,
    category: "Percepción"
  },
  perception3: {
    id: "perception3",
    name: "Percepción 3",
    description: "Encuentra 1 objeto extra al realizar la acción buscar",
    cost: 2,
    max: 2,
    implemented: false,
    category: "Percepción"
  },
  perception4: {
    id: "perception4",
    name: "Percepción 4",
    description:
      "Detecta fuego y número de personas hasta 1 localización de distancia. Desmayado no detecta. El incendio lo detecta en el mismo turno en el que se crea",
    cost: 5,
    max: 1,
    implemented: false,
    category: "Percepción"
  },
  perception5: {
    id: "perception5",
    name: "Percepción 5",
    description: "Puede priorizar buscar una comida o bebida en cada búsqueda",
    cost: 3,
    max: 1,
    implemented: false,
    category: "Percepción"
  },
  perception6: {
    id: "perception6",
    name: "Percepción 6",
    description:
      "Detecta puntos de esfuerzo (incluso los extras si se hubiera concentrado en ese turno), estado y objetos de todos los personajes que ve en la localización (igualmente requiere que los objetos sean descubiertos mediante un registro que se podría condicionar para poder concretar qué objeto robar). Si está desmayado ese turno no detecta nada",
    cost: 10,
    max: 1,
    implemented: false,
    category: "Percepción"
  },
  greedy: {
    id: "greedy",
    name: "H1 Codicioso",
    description: "Coge 1 objeto extra sin esfuerzo al realizar la acción coger",
    cost: 2,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  cannibal: {
    id: "cannibal",
    name: "H2 Caníbal",
    description:
      "Permite alimentarse de los cadáveres sin necesidad de estar hambriento y no pierde vida por comer cadáver",
    cost: 4,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  salesman: {
    id: "salesman",
    name: "H3 Vendedor",
    description: "Recibe 1 zarkan extra por cada venta en taquillas",
    cost: 2,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  pensioner: {
    id: "pensioner",
    name: "H4 Pensionista",
    description: "Recibe 1 zarkan cada día",
    cost: 3,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  undetectable: {
    id: "undetectable",
    name: "H5 Indetectable",
    description: "No puede ser descubierto mediante la acción detectar",
    cost: 4,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  brave: {
    id: "brave",
    name: "H6 Valiente",
    description: "No puede ser asustado si no da su consentimiento",
    cost: 6,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  vengeful: {
    id: "vengeful",
    name: "H7 Vengativo",
    description:
      "Al ser atacado contrataca de inmediato con cuchillo, bate con o sin clavos o hacha (aleatorio) al agresor siempre que esté en la misma localización, incluso si se desmayara. Si no dispusiera de ninguna de estas armas contrataca con puñetazo. Los contrataques no afectan al cooldown ni se consideran una acción en cuanto a la intoxicación. Se puede decidir no contratacar a un jugador neutral (previo aviso). La habilidad no se activa si es por un contrataque",
    cost: 5,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  charming: {
    id: "charming",
    name: "H8 Encantador",
    description:
      "Los jugadores neutrales realizan estas acciones para favorecer al jugador que tenga esta habilidad al compartir localización:\n- Si el jugador con esta habilidad está intoxicado usa un antídoto para desintoxicarle. Tiene efecto incluso si se considera enemigo\n- Protege al jugador con esta habilidad, siempre que no sea considerado enemigo\nAumenta 3 puntos de simpatía",
    cost: 5,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  },
  coward: {
    id: "coward",
    name: "H9 Cobarde",
    description:
      "Se esconde automáticamente para no ser visto en la localización. Tampoco es visible a los prismáticos, al dron espía, a los neutrales ni al sicario. Sale de su escondite en un turno si ataca, dispara (salvo si usa silenciador), se desplaza, lanza, asusta, roba, duerme con esfuerzo o se enamora. También si protege a otro jugador que no esté escondido o si un jugador que no esté escondido le protege (esto último requiere autorización del escondido). No puede priorizarse atacar o asustar a un escondido, pero puede ser asustado o atacado si el ataque no fuera a dar a nadie o fuera un ataque con bate. Aunque un jugador escondido fuese agredido no sería visible en ese turno si no se da alguno de los casos anteriores",
    cost: 8,
    max: 1,
    implemented: false,
    category: "Habilidades especiales"
  }
};
