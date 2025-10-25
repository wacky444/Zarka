import {
  ActionCategory,
  type ActionLibraryDefinition,
} from "./Action";

export const ActionLibrary: ActionLibraryDefinition = {
  create_fire: {
    id: "create_fire",
    name: "Crear un incendio",
    category: ActionCategory.Secondary,
    energyCost: 2,
    cooldown: 3,
    texture: "Board Game Icons",
    frame: "fire.png",
    actionOrder: 0,
    actionSubOrder: 0,
    requiredItems: ["fuel"],
    requirements: [
      { description: "Consume 2 combustibles.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Genera un incendio que inflige [color=#f97373]2[/color] de vida a quienes actúan en la localización durante los próximos 3 turnos.",
      },
    ],
    notes: [
      "Gastando 3 combustibles adicionales el incendio puede iniciarse en una localización adyacente.",
      "Solo jugadores con Percepción 4 detectan el incendio en el turno en que se crea.",
    ],
    tags: ["Attack", "Area", "Ranged"],
  },
  recover: {
    id: "recover",
    name: "Recuperarse",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    texture: "Board Game Icons",
    frame: "suit_hearts.png",
    actionOrder: 1,
    actionSubOrder: 0,
    requirements: [{ description: "Debe realizarse en el hospital." }],
    effects: [
      {
        description: "Recupera [color=#4ade80]5[/color] puntos de vida.",
      },
    ],
    tags: ["Support", "Status"],
  },
  feed: {
    id: "feed",
    name: "Alimentar",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    developed: true,
    texture: "Board Game Icons",
    frame: "resource_apple.png",
    actionOrder: 1,
    actionSubOrder: 1,
    requirements: [
      {
        description:
          "Requiere tener comida, bebida o estar hambriento junto a un cadáver visible.",
      },
    ],
    effects: [
      {
        description:
          "Recupera [color=#facc15]20[/color] de esfuerzo con comida o cadáver, [color=#facc15]12[/color] con bebida; comer cadáver resta [color=#f97373]1[/color] de vida.",
      },
      {
        description:
          "Puede alimentar a otro personaje en la misma localización.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description:
        "Permite consumir una segunda ración en la misma acción, incluidos cadáveres si se es caníbal.",
    },
    notes: [
      "Si no se dispone de esfuerzo suficiente al ejecutar la acción se pierde [color=#f97373]1[/color] punto de vida adicional tras completarla.",
    ],
    tags: ["Support", "Status", "SingleTarget"],
  },
  breakfast: {
    id: "breakfast",
    name: "Desayunar",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    texture: "Board Game Icons",
    frame: "resource_apple.png",
    actionOrder: 1,
    actionSubOrder: 2,
    requirements: [{ description: "Debe realizarse en el restaurante." }],
    effects: [
      {
        description:
          "Recupera [color=#facc15]20[/color] puntos de esfuerzo sin consumir recursos propios.",
      },
    ],
    tags: ["Support", "Status"],
  },
  use_bandage: {
    id: "use_bandage",
    name: "Usar venda",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    developed: true,
    texture: "Board Game Icons",
    frame: "pouch_add.png",
    actionOrder: 1,
    actionSubOrder: 3,
    requiredItems: ["bandage"],
    requirements: [
      {
        description: "Requiere tener una venda disponible.",
        consumesResource: true,
      },
    ],
    effects: [
      {
        description:
          "Recupera [color=#4ade80]5[/color] puntos de vida y puede aplicarse a un aliado en la misma localización.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description: "Permite gastar una segunda venda en la misma acción.",
    },
    tags: ["Support", "Status", "SingleTarget"],
  },
  use_medicine: {
    id: "use_medicine",
    name: "Usar medicamento",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    texture: "Board Game Icons",
    frame: "flask_full.png",
    actionOrder: 1,
    actionSubOrder: 4,
    requiredItems: ["medicine"],
    requirements: [
      { description: "Requiere tener un medicamento.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Recupera [color=#4ade80]8[/color] puntos de vida y puede aplicarse a otro personaje en la misma localización.",
      },
    ],
    extraExecution: {
      cost: 1,
      maxRepetitions: 1,
      description: "Permite emplear un segundo medicamento.",
    },
    tags: ["Support", "Status", "SingleTarget"],
  },
  talk: {
    id: "talk",
    name: "Hablar",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 1,
    requirements: [
      { description: "Debe verse a un personaje neutral o a un sicario." },
    ],
    effects: [
      {
        description:
          "Permite interactuar con neutrales o sicarios; la conversación se oye en la localización sin revelar el contenido.",
      },
    ],
    texture: "Board Game Icons",
    frame: "book_open.png",
    actionOrder: 2,
    actionSubOrder: 0,
    tags: ["Utility", "Support"],
  },
  place_tracker: {
    id: "place_tracker",
    name: "Poner localizador",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requiredItems: ["tracker"],
    requirements: [
      {
        description: "Requiere disponer de un localizador.",
        consumesResource: true,
      },
    ],
    effects: [
      {
        description:
          "Otorga visibilidad durante 6 turnos de la posición del objetivo; puede colocarse en una localización adyacente con visión o enlaces de walkie talkie.",
      },
    ],
    extraExecution: {
      cost: 1,
      description: "Permite colocar un segundo localizador en el mismo turno.",
    },
    texture: "Board Game Icons",
    frame: "token.png",
    actionOrder: 2,
    actionSubOrder: 1,
    tags: ["Recon", "Utility", "Ranged", "SingleTarget"],
  },
  place_c4: {
    id: "place_c4",
    name: "Colocar C4",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    requiredItems: ["c4"],
    requirements: [
      {
        description: "Requiere tener una carga de C4.",
        consumesResource: true,
      },
    ],
    effects: [
      {
        description:
          "Instala un explosivo en la localización actual que podrá detonarse en turnos posteriores.",
      },
    ],
    extraExecution: {
      cost: 2,
      description: "Permite colocar una segunda carga de C4.",
    },
    texture: "Board Game Icons",
    frame: "exploding.png",
    actionOrder: 2,
    actionSubOrder: 2,
    tags: ["Attack", "Area", "Logistics"],
  },
  place_trap: {
    id: "place_trap",
    name: "Colocar trampa",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    requiredItems: ["trap"],
    requirements: [
      { description: "Requiere tener una trampa.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Instala una trampa en una entrada que inflige [color=#f97373]7[/color] de vida al primer personaje que entre o salga por ella.",
      },
    ],
    extraExecution: {
      cost: 2,
      description: "Permite colocar una trampa adicional.",
    },
    texture: "Board Game Icons",
    frame: "puzzle.png",
    actionOrder: 2,
    actionSubOrder: 3,
    tags: ["Attack", "Logistics"],
  },
  protect: {
    id: "protect",
    name: "Proteger",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    developed: true,
    experience: {
      base: 0,
      conditional: [{ value: 3, condition: "Si la protección evita daño." }],
    },
    effects: [
      {
        description:
          "Reduce un tercio del daño recibido y puede asignarse a otro personaje; bloquea asaltos, robos y registros salvo consentimiento.",
      },
    ],
    texture: "Board Game Icons",
    frame: "shield.png",
    actionOrder: 3,
    actionSubOrder: 0,
    tags: ["Support", "Status", "SingleTarget"],
  },
  dodge: {
    id: "dodge",
    name: "Esquivar",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    experience: {
      base: 0,
      conditional: [{ value: 5, condition: "Si la esquiva tiene éxito." }],
    },
    effects: [
      {
        description:
          "Otorga un 25% de probabilidad de evitar la primera agresión recibida; no afecta a daños de área como incendios o C4.",
      },
    ],
    extraExecution: {
      cost: 2,
      description: "Permite intentar esquivar una agresión adicional.",
    },
    texture: "Board Game Icons",
    frame: "pawn_skip.png",
    actionOrder: 3,
    actionSubOrder: 1,
    tags: ["Support", "Status"],
  },
  knife_attack: {
    id: "knife_attack",
    name: "Atacar con cuchillo",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si causa daño." },
        { value: 5, condition: "Si mata al objetivo." },
      ],
    },
    requiredItems: ["knife"],
    requirements: [{ description: "Requiere portar un cuchillo." }],
    effects: [
      {
        description:
          "Inflige [color=#f97373]4[/color] puntos de vida al objetivo.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 3,
      description:
        "Cada repetición aumenta el daño en [color=#f97373]1[/color] punto, hasta +[color=#f97373]3[/color].",
    },
    texture: "Board Game Icons",
    frame: "hand_cross.png",
    actionOrder: 4,
    actionSubOrder: 0,
    tags: ["Attack", "SingleTarget"],
  },
  move: {
    id: "move",
    name: "Desplazarse",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    developed: true,
    effects: [{ description: "Se mueve a una localización adyacente." }],
    extraExecution: {
      cost: 3,
      maxRepetitions: 3,
      description:
        "Cada repetición permite avanzar una localización adicional indicando el recorrido.",
    },
    texture: "Board Game Icons",
    frame: "arrow_right.png",
    actionOrder: 5,
    actionSubOrder: 0,
    tags: ["Movement", "Ranged"],
  },
  refuel: {
    id: "refuel",
    name: "Repostar",
    category: ActionCategory.Secondary,
    energyCost: 2,
    cooldown: 3,
    requirements: [{ description: "Debe ejecutarse en la gasolinera." }],
    effects: [{ description: "Obtiene 3 unidades de combustible." }],
    texture: "Board Game Icons",
    frame: "tokens.png",
    actionOrder: 6,
    actionSubOrder: 0,
    tags: ["Logistics", "Economy"],
  },
  pick_up: {
    id: "pick_up",
    name: "Coger",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    requirements: [{ description: "Debe ver los objetos a recoger." }],
    effects: [{ description: "Permite recoger hasta 3 objetos visibles." }],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description: "Cada repetición añade un objeto adicional.",
    },
    texture: "Board Game Icons",
    frame: "hand_token.png",
    actionOrder: 6,
    actionSubOrder: 1,
    tags: ["Logistics"],
  },
  search: {
    id: "search",
    name: "Buscar",
    category: ActionCategory.Secondary,
    energyCost: 3,
    cooldown: 2,
    effects: [{ description: "Revela 5 objetos ocultos en la localización." }],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description: "Cada repetición descubre un objeto adicional.",
    },
    texture: "Board Game Icons",
    frame: "cards_seek.png",
    actionOrder: 6,
    actionSubOrder: 2,
    tags: ["Recon", "Logistics"],
  },
  manipulate: {
    id: "manipulate",
    name: "Manipular",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requirements: [{ description: "Debe poseer los objetos a transformar." }],
    effects: [{ description: "Combina o separa objetos para generar otros." }],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description: "Permite realizar manipulaciones adicionales.",
    },
    texture: "Board Game Icons",
    frame: "card_flip.png",
    actionOrder: 6,
    actionSubOrder: 3,
    tags: ["Crafting"],
  },
  give: {
    id: "give",
    name: "Dar",
    category: ActionCategory.Primary,
    energyCost: 1,
    cooldown: 3,
    requirements: [{ description: "Debe tener el objeto a entregar." }],
    effects: [{ description: "Transfiere un objeto a otro personaje." }],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description: "Permite entregar objetos adicionales en la misma acción.",
    },
    texture: "Board Game Icons",
    frame: "token_give.png",
    actionOrder: 6,
    actionSubOrder: 4,
    tags: ["Support", "Logistics", "SingleTarget"],
  },
  poison_food: {
    id: "poison_food",
    name: "Envenenar alimento",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    experience: {
      base: 0,
      conditional: [{ value: 3, condition: "Si alguien resulta intoxicado." }],
    },
    requiredItems: ["poison"],
    requirements: [
      {
        description: "Requiere veneno y un objetivo con alimento.",
        consumesResource: true,
      },
    ],
    effects: [
      {
        description:
          "Envenena una ración, bebida o alimento visible; al consumirlo el objetivo pierde [color=#f97373]1[/color] de vida durante 5 acciones y duplica su esfuerzo extra.",
      },
    ],
    extraExecution: {
      cost: 1,
      description: "Permite envenenar un segundo alimento.",
    },
    notes: [
      "Si el objetivo ya estaba intoxicado se desmaya; si estaba herido muere.",
      "Otorga 5 zarkans en el siguiente turno múltiplo de 5 cuando el veneno se activa sin pacto previo.",
    ],
    texture: "Board Game Icons",
    frame: "skull.png",
    actionOrder: 7,
    actionSubOrder: 0,
    tags: ["Attack", "Status"],
  },
  drop: {
    id: "drop",
    name: "Dejar",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requirements: [{ description: "Debe poseer el objeto a dejar." }],
    effects: [
      {
        description:
          "Permite soltar un objeto en la localización o almacenarlo en taquilla para venta diferida.",
      },
    ],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description: "Permite dejar objetos adicionales.",
    },
    texture: "Board Game Icons",
    frame: "token_remove.png",
    actionOrder: 8,
    actionSubOrder: 0,
    tags: ["Logistics"],
  },
  throw_object: {
    id: "throw_object",
    name: "Lanzar",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si impacta." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requirements: [{ description: "Debe poseer el objeto que lanza." }],
    effects: [
      {
        description:
          "Inflige [color=#f97373]4[/color] de vida si es un molotov o [color=#f97373]1[/color] con otro objeto; puede lanzarse a la misma localización o a una adyacente sin priorizar salvo visión especial.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 3,
      description: "Permite lanzar objetos adicionales.",
    },
    texture: "Board Game Icons",
    frame: "hand.png",
    actionOrder: 8,
    actionSubOrder: 1,
    tags: ["Attack", "Area", "Ranged"],
  },
  use_chemical_weapon: {
    id: "use_chemical_weapon",
    name: "Usar arma química",
    category: ActionCategory.Secondary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 1, condition: "Por cada objetivo afectado." },
        { value: 5, condition: "Si alguna víctima muere." },
      ],
    },
    requiredItems: ["chemical_weapon"],
    requirements: [
      { description: "Requiere un arma química.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Inflige [color=#f97373]9[/color] de vida a todos en la localización (excepto al usuario) o [color=#f97373]11[/color] a un único objetivo; no puede esquivarse.",
      },
    ],
    texture: "Board Game Icons",
    frame: "flask_full.png",
    actionOrder: 9,
    actionSubOrder: 0,
    tags: ["Attack", "Area"],
  },
  scare: {
    id: "scare",
    name: "Asustar",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    developed: true,
    effects: [
      {
        description:
          "Obliga al objetivo a huir a una localización aleatoria adyacente y le hace perder [color=#facc15]3[/color] de esfuerzo.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 1,
      description:
        "Permite elegir la dirección o asustar a un segundo personaje.",
    },
    texture: "Board Game Icons",
    frame: "character_lift.png",
    actionOrder: 10,
    actionSubOrder: 0,
    tags: ["Attack", "Utility", "Ranged", "SingleTarget"],
  },
  detonate_c4: {
    id: "detonate_c4",
    name: "Detonar C4",
    category: ActionCategory.Primary,
    energyCost: 1,
    cooldown: 3,
    requiredItems: ["detonator"],
    requirements: [
      { description: "Requiere portar el detonador vinculado al C4." },
    ],
    effects: [
      {
        description:
          "Activa todas las cargas colocadas por el usuario en esa localización infligiendo [color=#f97373]12[/color] de vida; la explosión se oye a dos casillas.",
      },
    ],
    extraExecution: {
      cost: 1,
      description: "Permite detonar una segunda carga independiente.",
    },
    texture: "Board Game Icons",
    frame: "exploding_6.png",
    actionOrder: 11,
    actionSubOrder: 0,
    tags: ["Attack", "Area"],
  },
  axe_attack: {
    id: "axe_attack",
    name: "Atacar con hacha",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si causa daño." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["axe"],
    requirements: [{ description: "Requiere tener un hacha." }],
    effects: [
      {
        description: "Inflige [color=#f97373]8[/color] de vida al objetivo.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 3,
      description:
        "Cada repetición añade [color=#f97373]1[/color] punto de daño adicional hasta +[color=#f97373]3[/color].",
    },
    texture: "Board Game Icons",
    frame: "sword.png",
    actionOrder: 11,
    actionSubOrder: 1,
    tags: ["Attack", "SingleTarget"],
  },
  bat_attack: {
    id: "bat_attack",
    name: "Golpear con bate",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 1, condition: "Por cada objetivo impactado." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["bat"],
    requirements: [{ description: "Requiere tener un bate." }],
    effects: [
      {
        description:
          "Inflige [color=#f97373]5[/color] de vida a todos en la localización ([color=#f97373]7[/color] con bate de clavos) permitiendo excluir objetivos específicos.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 3,
      description:
        "Cada repetición aumenta el daño en [color=#f97373]1[/color] punto.",
    },
    texture: "Board Game Icons",
    frame: "sword.png",
    actionOrder: 11,
    actionSubOrder: 2,
    tags: ["Attack", "Area"],
  },
  chainsaw_attack: {
    id: "chainsaw_attack",
    name: "Atacar con motosierra",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 1, condition: "Si causa daño." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["chainsaw"],
    requirements: [
      {
        description: "Requiere una motosierra encendida durante el turno.",
      },
    ],
    effects: [{ description: "Elimina de inmediato al objetivo." }],
    texture: "Board Game Icons",
    frame: "sword.png",
    actionOrder: 11,
    actionSubOrder: 4,
    tags: ["Attack", "SingleTarget"],
  },
  start_chainsaw: {
    id: "start_chainsaw",
    name: "Arrancar motosierra",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requiredItems: ["chainsaw", "fuel"],
    requirements: [
      {
        description: "Requiere motosierra y 1 unidad de combustible.",
        consumesResource: true,
      },
    ],
    effects: [
      {
        description:
          "Activa la motosierra durante 5 turnos; el sonido se escucha en la localización.",
      },
    ],
    texture: "Board Game Icons",
    frame: "spinner.png",
    actionOrder: 11,
    actionSubOrder: 3,
    tags: ["Logistics"],
  },
  shoot_pistol: {
    id: "shoot_pistol",
    name: "Disparar pistola",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si impacta." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["pistol", "bullet"],
    requirements: [
      { description: "Requiere pistola y bala.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Inflige [color=#f97373]10[/color] de vida a un objetivo en la misma localización o adyacente; el disparo se oye a una casilla salvo silenciador.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description: "Permite disparar una segunda bala.",
    },
    texture: "Board Game Icons",
    frame: "dice_sword.png",
    actionOrder: 11,
    actionSubOrder: 5,
    tags: ["Attack", "Ranged", "SingleTarget"],
  },
  shoot_harpoon: {
    id: "shoot_harpoon",
    name: "Disparar arpón",
    category: ActionCategory.Primary,
    energyCost: 2,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si impacta." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["harpoon", "arrow"],
    requirements: [
      { description: "Requiere arpón y flecha.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Inflige [color=#f97373]7[/color] de vida en la misma localización o [color=#f97373]6[/color] a una adyacente sin generar ruido.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description: "Permite disparar una segunda flecha.",
    },
    texture: "Board Game Icons",
    frame: "bow.png",
    actionOrder: 11,
    actionSubOrder: 6,
    tags: ["Attack", "Ranged", "SingleTarget"],
  },
  fire_rocket_launcher: {
    id: "fire_rocket_launcher",
    name: "Disparar lanzacohetes",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 1,
      conditional: [
        { value: 1, condition: "Por cada objetivo afectado." },
        { value: 5, condition: "Si mata." },
      ],
    },
    requiredItems: ["rocket_launcher"],
    requirements: [
      { description: "Requiere un lanzacohetes.", consumesResource: true },
    ],
    effects: [
      {
        description:
          "Destruye la localización objetivo y todos los objetos, infligiendo [color=#f97373]20[/color] de vida a cada presencia; visible desde todo el pueblo.",
      },
    ],
    texture: "Board Game Icons",
    frame: "exploding.png",
    actionOrder: 11,
    actionSubOrder: 7,
    tags: ["Attack", "Area", "Ranged"],
  },
  punch: {
    id: "punch",
    name: "Puñetazo",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    developed: true,
    experience: {
      base: 1,
      conditional: [
        { value: 2, condition: "Si impacta." },
        { value: 5, condition: "Si mata." },
      ],
    },
    effects: [
      {
        description: "Inflige [color=#f97373]2[/color] puntos de vida.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 3,
      description:
        "Cada repetición añade [color=#f97373]1[/color] punto de daño.",
    },
    texture: "Board Game Icons",
    frame: "hand.png",
    actionOrder: 11,
    actionSubOrder: 8,
    tags: ["Attack", "SingleTarget"],
  },
  pick_lock: {
    id: "pick_lock",
    name: "Forzar cerradura",
    category: ActionCategory.Secondary,
    energyCost: 2,
    cooldown: 3,
    experience: {
      base: 0,
      conditional: [{ value: 2, condition: "Si la cerradura se abre." }],
    },
    requirements: [{ description: "Debe ver una caja fuerte." }],
    effects: [
      {
        description:
          "Tras 4 turnos continuados revela los contenidos de la caja fuerte; moverse interrumpe el proceso.",
      },
    ],
    notes: ["Ganzúas o la habilidad Destreza 1 reducen el tiempo requerido."],
    texture: "Board Game Icons",
    frame: "lock_open.png",
    actionOrder: 12,
    actionSubOrder: 0,
    tags: ["Logistics", "Recon"],
  },
  steal: {
    id: "steal",
    name: "Robar",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    experience: {
      base: 0,
      conditional: [{ value: 4, condition: "Por cada objeto robado." }],
    },
    effects: [
      {
        description:
          "Sustrae un objeto aleatorio o uno identificado previamente mediante registro; puede aplicarse a desmayados o muertos.",
      },
    ],
    extraExecution: {
      cost: 3,
      maxRepetitions: 1,
      description: "Permite realizar un segundo robo en la misma acción.",
    },
    texture: "Board Game Icons",
    frame: "pouch_remove.png",
    actionOrder: 13,
    actionSubOrder: 0,
    tags: ["Attack", "Economy", "SingleTarget"],
  },
  fabricate: {
    id: "fabricate",
    name: "Fabricar",
    category: ActionCategory.Secondary,
    energyCost: 3,
    cooldown: 3,
    requirements: [
      {
        description:
          "Debe realizarse en el taller salvo que se posea la habilidad Destreza 4.",
      },
    ],
    effects: [
      {
        description:
          "Permite fabricar pistola, bala, molotov, bate, hacha, cuchillo, arpón, flecha, trampa o C4 siguiendo las recetas del juego.",
      },
    ],
    texture: "Board Game Icons",
    frame: "cards_stack.png",
    actionOrder: 14,
    actionSubOrder: 0,
    tags: ["Crafting", "Logistics"],
  },
  black_market_trade: {
    id: "black_market_trade",
    name: "Traficar en el mercado negro",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requirements: [{ description: "Debe realizarse en el mercado negro." }],
    effects: [
      {
        description:
          "Permite vender hasta 4 objetos obteniendo 1 zarkan adicional por cada uno; el pago es inmediato.",
      },
    ],
    texture: "Board Game Icons",
    frame: "dollar.png",
    actionOrder: 14,
    actionSubOrder: 1,
    tags: ["Economy", "Logistics"],
  },
  inspect: {
    id: "inspect",
    name: "Registrar",
    category: ActionCategory.Secondary,
    energyCost: 2,
    cooldown: 3,
    effects: [
      {
        description:
          "Descubre 3 objetos que porta un personaje vivo o muerto; puede usarse en uno mismo para localizar rastreadores.",
      },
    ],
    extraExecution: {
      cost: 2,
      description:
        "Permite realizar un segundo registro o revelar 3 objetos adicionales.",
    },
    texture: "Board Game Icons",
    frame: "notepad.png",
    actionOrder: 14,
    actionSubOrder: 2,
    tags: ["Recon", "Logistics", "SingleTarget"],
  },
  focus: {
    id: "focus",
    name: "Concentrarse",
    category: ActionCategory.Secondary,
    energyCost: 0,
    cooldown: 3,
    developed: true,
    effects: [
      {
        description:
          "Otorga [color=#facc15]6[/color] puntos de esfuerzo gratuito para el próximo turno.",
      },
    ],
    extraExecution: {
      cost: 1,
      maxRepetitions: 3,
      description:
        "Por cada punto de vida sacrificado se recuperan [color=#facc15]3[/color] puntos de esfuerzo, hasta [color=#facc15]9[/color] puntos totales.",
    },
    notes: [
      "Concentrarse no provoca pérdida de vida adicional si se está intoxicado.",
    ],
    texture: "Board Game Icons",
    frame: "hourglass.png",
    actionOrder: 15,
    actionSubOrder: 0,
    tags: ["Support", "Status"],
  },
  train: {
    id: "train",
    name: "Entrenar",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    effects: [{ description: "Gana 5 puntos de experiencia." }],
    extraExecution: {
      cost: 3,
      maxRepetitions: 1,
      description: "Añade 3 puntos de experiencia adicionales.",
    },
    texture: "Board Game Icons",
    frame: "award.png",
    actionOrder: 15,
    actionSubOrder: 1,
    tags: ["Support", "Status"],
  },
  activate_cameras: {
    id: "activate_cameras",
    name: "Activar cámaras",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 1,
    requirements: [{ description: "Debe estar en la sala de seguridad." }],
    effects: [
      {
        description:
          "Permite ver a los personajes visibles en todas las localizaciones salvo casas e industria; todos perciben que las cámaras están encendidas.",
      },
    ],
    texture: "Board Game Icons",
    frame: "hand_token_open.png",
    actionOrder: 16,
    actionSubOrder: 0,
    tags: ["Recon", "Utility"],
  },
  look_through_window: {
    id: "look_through_window",
    name: "Mirar por la ventana",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 1,
    requirements: [{ description: "Debe encontrarse en una casa." }],
    effects: [
      {
        description:
          "Permite ver a los personajes visibles de una localización adyacente; no distingue desmayados.",
      },
    ],
    texture: "Board Game Icons",
    frame: "hexagon_question.png",
    actionOrder: 16,
    actionSubOrder: 1,
    tags: ["Recon", "Ranged"],
  },
  use_binoculars: {
    id: "use_binoculars",
    name: "Usar prismáticos",
    category: ActionCategory.Primary,
    energyCost: 1,
    cooldown: 3,
    requiredItems: ["binoculars"],
    requirements: [{ description: "Requiere tener prismáticos." }],
    effects: [
      {
        description:
          "Revela los personajes visibles de una localización adyacente; no distingue desmayados.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description: "Permite observar una localización a 2 de distancia.",
    },
    texture: "Board Game Icons",
    frame: "card_target.png",
    actionOrder: 16,
    actionSubOrder: 2,
    tags: ["Recon", "Ranged"],
  },
  detect: {
    id: "detect",
    name: "Detectar",
    category: ActionCategory.Primary,
    energyCost: 3,
    cooldown: 3,
    effects: [
      {
        description:
          "Identifica todos los personajes de la misma localización y los que se encuentren a una distancia de 1 (sin precisar ubicación exacta).",
      },
    ],
    extraExecution: {
      cost: 3,
      description: "Permite detectar también a distancia 2.",
    },
    texture: "Board Game Icons",
    frame: "hexagon_tile.png",
    actionOrder: 16,
    actionSubOrder: 3,
    tags: ["Recon"],
  },
  use_antidote: {
    id: "use_antidote",
    name: "Usar antídoto",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requirements: [
      { description: "Requiere poseer un antídoto.", consumesResource: true },
    ],
    requiredItems: ["antidote"],
    effects: [
      {
        description:
          "Cura una intoxicación propia o de un aliado en la misma localización, evitando pérdida de vida posterior.",
      },
    ],
    extraExecution: {
      cost: 2,
      description: "Permite aplicar un segundo antídoto.",
    },
    texture: "Board Game Icons",
    frame: "flask_half.png",
    actionOrder: 17,
    actionSubOrder: 0,
    tags: ["Support", "Status", "SingleTarget"],
  },
  inject_virus: {
    id: "inject_virus",
    name: "Inyectar virus",
    category: ActionCategory.Primary,
    energyCost: 1,
    cooldown: 3,
    requirements: [
      {
        description: "Requiere tener un vial de virus.",
        consumesResource: true,
      },
    ],
    requiredItems: ["virus"],
    effects: [
      {
        description:
          "Infecta al objetivo; quienes compartan localización al final del turno pierden [color=#f97373]1[/color] de vida salvo desmayados o el propio infectado.",
      },
    ],
    texture: "Board Game Icons",
    frame: "flask_full.png",
    actionOrder: 17,
    actionSubOrder: 1,
    tags: ["Attack", "Area", "Status", "SingleTarget"],
  },
  inject_vaccine: {
    id: "inject_vaccine",
    name: "Inyectar vacuna",
    category: ActionCategory.Secondary,
    energyCost: 1,
    cooldown: 3,
    requirements: [
      { description: "Requiere tener una vacuna.", consumesResource: true },
    ],
    requiredItems: ["vaccine"],
    effects: [
      {
        description:
          "Otorga inmunidad frente a pérdidas de vida por virus ajenos; puede aplicarse a otro personaje en la misma localización.",
      },
    ],
    texture: "Board Game Icons",
    frame: "flask_half.png",
    actionOrder: 17,
    actionSubOrder: 2,
    tags: ["Support", "Status", "SingleTarget"],
  },
  sleep: {
    id: "sleep",
    name: "Dormir",
    category: ActionCategory.Primary,
    energyCost: 0,
    cooldown: 3,
    developed: true,
    experience: {
      base: 0,
      conditional: [
        { value: 4, condition: "Si se realiza con esfuerzo extra compartido." },
      ],
    },
    effects: [
      {
        description: "Recupera [color=#4ade80]2[/color] puntos de vida.",
      },
    ],
    extraExecution: {
      cost: 2,
      maxRepetitions: 1,
      description:
        "Si otro personaje duerme con esfuerzo se recuperan [color=#4ade80]5[/color] puntos de vida adicionales.",
    },
    texture: "Board Game Icons",
    frame: "pawn_table.png",
    actionOrder: 17,
    actionSubOrder: 3,
    tags: ["Support", "Status"],
  },
};
