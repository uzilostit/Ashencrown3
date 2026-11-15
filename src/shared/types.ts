export const BiomeId = {
  BASE_CAMP: 'BASE_CAMP',
  MARSH: 'MARSH',
  CINDER_FLATS: 'CINDER_FLATS',
  PINE_FOREST: 'PINE_FOREST',
  SALT_DUNES: 'SALT_DUNES',
  FROST_RIDGE: 'FROST_RIDGE',
  ORCHARD_RUINS: 'ORCHARD_RUINS',
} as const;
export type BiomeId = (typeof BiomeId)[keyof typeof BiomeId];

export const OUTER_BIOMES: BiomeId[] = [
  BiomeId.MARSH,
  BiomeId.CINDER_FLATS,
  BiomeId.PINE_FOREST,
  BiomeId.SALT_DUNES,
  BiomeId.FROST_RIDGE,
  BiomeId.ORCHARD_RUINS,
];

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  subtitle: string;
  sectorIndex: number; // -1 for BASE_CAMP, 0..5 for outer wedges
  ambientTemp: number;
  fogColor: string;
  groundColor: string;
  accentColor: string;
  hazardLabel: string;
}

export const BIOME_DEFINITIONS: Record<BiomeId, BiomeDefinition> = {
  BASE_CAMP: {
    id: BiomeId.BASE_CAMP,
    name: 'Base Camp',
    subtitle: 'Neutral Sanctuary & Helipad',
    sectorIndex: -1,
    ambientTemp: 20,
    fogColor: '#3a352e',
    groundColor: '#6d6558',
    accentColor: '#d4a853',
    hazardLabel: 'High Contention',
  },
  MARSH: {
    id: BiomeId.MARSH,
    name: 'Blackroot Marsh',
    subtitle: 'Bog, Dead Cypress & Mist',
    sectorIndex: 0,
    ambientTemp: 13,
    fogColor: '#2c3730',
    groundColor: '#3f4b3c',
    accentColor: '#6a8e62',
    hazardLabel: 'Mire Slow & Chill',
  },
  CINDER_FLATS: {
    id: BiomeId.CINDER_FLATS,
    name: 'Cinder Flats',
    subtitle: 'Scorched Basalt & Ash Vents',
    sectorIndex: 1,
    ambientTemp: 41,
    fogColor: '#3d2820',
    groundColor: '#332926',
    accentColor: '#d96b38',
    hazardLabel: 'Heat Exposure',
  },
  PINE_FOREST: {
    id: BiomeId.PINE_FOREST,
    name: 'Whispering Pines',
    subtitle: 'Dense Timber & Logging Trails',
    sectorIndex: 2,
    ambientTemp: 16,
    fogColor: '#26332c',
    groundColor: '#3a4a36',
    accentColor: '#5c8a58',
    hazardLabel: 'Ambush Cover',
  },
  SALT_DUNES: {
    id: BiomeId.SALT_DUNES,
    name: 'Salt Dunes',
    subtitle: 'Bleached Flats & Crust Pillars',
    sectorIndex: 3,
    ambientTemp: 35,
    fogColor: '#4e463a',
    groundColor: '#c8bca6',
    accentColor: '#e0c78e',
    hazardLabel: 'Exposed Sightlines',
  },
  FROST_RIDGE: {
    id: BiomeId.FROST_RIDGE,
    name: 'Frost Ridge',
    subtitle: 'Glacial Crags & Driving Snow',
    sectorIndex: 4,
    ambientTemp: -10,
    fogColor: '#384654',
    groundColor: '#cad6df',
    accentColor: '#7eb2d6',
    hazardLabel: 'Cold Exposure',
  },
  ORCHARD_RUINS: {
    id: BiomeId.ORCHARD_RUINS,
    name: 'Orchard Ruins',
    subtitle: 'Abandoned Terraces & Homesteads',
    sectorIndex: 5,
    ambientTemp: 19,
    fogColor: '#3c362e',
    groundColor: '#6b604a',
    accentColor: '#b8834b',
    hazardLabel: 'Overgrown Ruins',
  },
};

export interface HearthDefinition {
  id: string;
  name: string;
  motto: string;
  crestColor: string;
  passiveLabel: string;
}

export const HEARTHS: HearthDefinition[] = [
  { id: 'iron', name: 'Hearth of Iron', motto: 'Endure the ash', crestColor: '#8d99ae', passiveLabel: '+10 Max Armor Resilience' },
  { id: 'ember', name: 'Hearth of Ember', motto: 'Burn before fading', crestColor: '#d96b38', passiveLabel: 'Heat Resistance +15%' },
  { id: 'moss', name: 'Hearth of Moss', motto: 'Root in silence', crestColor: '#6a8e62', passiveLabel: 'Slower Hunger Drain' },
  { id: 'frost', name: 'Hearth of Frost', motto: 'Hold the ridge', crestColor: '#7eb2d6', passiveLabel: 'Cold Resistance +15%' },
  { id: 'salt', name: 'Hearth of Salt', motto: 'Walk the white expanse', crestColor: '#d4a853', passiveLabel: 'Faster Stamina Recovery' },
  { id: 'ash', name: 'Hearth of Ash', motto: 'Outlast all crowns', crestColor: '#b89f82', passiveLabel: 'Balanced Survivalist' },
];

export interface PaperAppearance {
  paperTone: string;
  cloakColor: string;
  trimColor: string;
  hatStyle: 'hood' | 'crown' | 'tricorn' | 'cap';
  foldDetail: 'crisp' | 'weathered' | 'gilded';
}

export const DEFAULT_APPEARANCE: PaperAppearance = {
  paperTone: '#e8dfd1',
  cloakColor: '#465446',
  trimColor: '#d4a853',
  hatStyle: 'hood',
  foldDetail: 'crisp',
};

export type PlayerAnimState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'sprinting'
  | 'crouching'
  | 'jumping'
  | 'falling'
  | 'landing'
  | 'damage'
  | 'attacking'
  | 'blocking'
  | 'collecting'
  | 'interacting'
  | 'death'
  | 'victory';

export type ItemCategory =
  | 'food'
  | 'medical'
  | 'weapon'
  | 'ammo'
  | 'resource'
  | 'defense'
  | 'utility';

export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  maxStack: number;
  protected?: boolean; // e.g. starting dagger cannot be dropped
  damage?: number;
  range?: number;
  cooldownSec?: number;
  ammoType?: string;
  healAmount?: number;
  hungerAmount?: number;
  staminaBoost?: number;
  coldResist?: number;
  heatResist?: number;
  armorBonus?: number;
}

export const ITEM_CATALOG: Record<string, ItemDefinition> = {
  dagger: {
    id: 'dagger',
    name: 'Ceremonial Dagger',
    category: 'weapon',
    description: 'Protected folded-steel blade bound to your Hearth. Fast melee strikes and parries.',
    maxStack: 1,
    protected: true,
    damage: 20,
    range: 2.6,
    cooldownSec: 0.45,
  },
  longbow: {
    id: 'longbow',
    name: 'Ashwood Longbow',
    category: 'weapon',
    description: 'Hand-carved bow firing fletched bolts at medium range.',
    maxStack: 1,
    damage: 28,
    range: 38,
    cooldownSec: 0.85,
    ammoType: 'arrows',
  },
  flintlock: {
    id: 'flintlock',
    name: 'Cinder Pistol',
    category: 'weapon',
    description: 'High-impact blackpowder pistol salvaged from the flats.',
    maxStack: 1,
    damage: 38,
    range: 34,
    cooldownSec: 1.25,
    ammoType: 'shells',
  },
  arrows: {
    id: 'arrows',
    name: 'Paper-Fletched Arrows',
    category: 'ammo',
    description: 'Ammunition for the Ashwood Longbow.',
    maxStack: 24,
  },
  shells: {
    id: 'shells',
    name: 'Brass Powder Shells',
    category: 'ammo',
    description: 'Ammunition for the Cinder Pistol.',
    maxStack: 12,
  },
  ration: {
    id: 'ration',
    name: 'Dried Orchard Ration',
    category: 'food',
    description: 'Restores 35 Hunger and a small burst of stamina.',
    maxStack: 5,
    hungerAmount: 35,
    staminaBoost: 18,
  },
  berries: {
    id: 'berries',
    name: 'Pine Hearth Berries',
    category: 'food',
    description: 'Restores 18 Hunger and 8 Health.',
    maxStack: 8,
    hungerAmount: 18,
    healAmount: 8,
  },
  bandage: {
    id: 'bandage',
    name: 'Linen Wrap',
    category: 'medical',
    description: 'Stops bleeding and restores 25 Health.',
    maxStack: 5,
    healAmount: 25,
  },
  medkit: {
    id: 'medkit',
    name: 'Apothecary Satchel',
    category: 'medical',
    description: 'Restores 55 Health and clears exposure penalties.',
    maxStack: 2,
    healAmount: 55,
  },
  cloak_fur: {
    id: 'cloak_fur',
    name: 'Frost-Lined Mantle',
    category: 'defense',
    description: 'Equip to gain +18 Cold Resistance and +10% armor.',
    maxStack: 1,
    coldResist: 18,
    armorBonus: 0.1,
  },
  cloak_ash: {
    id: 'cloak_ash',
    name: 'Cinderweave Shroud',
    category: 'defense',
    description: 'Equip to gain +18 Heat Resistance and +10% armor.',
    maxStack: 1,
    heatResist: 18,
    armorBonus: 0.1,
  },
  tonic: {
    id: 'tonic',
    name: 'Salt-Spring Tonic',
    category: 'utility',
    description: 'Grants temporary stamina surge and +12 Health.',
    maxStack: 4,
    staminaBoost: 45,
    healAmount: 12,
  },
  scrap: {
    id: 'scrap',
    name: 'Folded Brass & Timber',
    category: 'resource',
    description: 'Salvaged materials traded or used for field repairs (+10 Armor).',
    maxStack: 15,
  },
  flare_charge: {
    id: 'flare_charge',
    name: 'Signal Flare Charge',
    category: 'utility',
    description: 'Used at Base Camp Helipad to summon the extraction helicopter.',
    maxStack: 1,
  },
};

export interface InventoryItem {
  itemId: string;
  quantity: number;
}

export type StatusEffect =
  | 'bleeding'
  | 'exhaustion'
  | 'cold_exposure'
  | 'heat_exposure'
  | 'healing_surge'
  | 'stamina_boost';

export interface PlayerSurvivalStats {
  health: number;
  maxHealth: number;
  hunger: number;
  stamina: number;
  temperature: number;
  statusEffects: StatusEffect[];
}

export interface MatchSettings {
  healthRegenEnabled: boolean;
  friendlyFireAllies: boolean;
  collapseSpeedMultiplier: number; // 1 = normal, 1.5 = brisk
  startingRations: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  hearthId: string;
  appearance: PaperAppearance;
  ready: boolean;
  isHost: boolean;
  connected: boolean;
  ceremonyDaggerDrawn: boolean;
}

export interface WorldPlayerState {
  id: string;
  name: string;
  hearthId: string;
  appearance: PaperAppearance;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  animState: PlayerAnimState;
  alive: boolean;
  escaped: boolean;
  connected: boolean;
  blocking: boolean;
  crouching: boolean;
  equippedWeaponId: string;
  equippedDefenseId: string | null;
  stats: PlayerSurvivalStats;
  inventory: InventoryItem[];
  alliances: string[]; // player IDs
  eliminations: number;
  resourcesCollected: number;
  survivalTimeSec: number;
  placement: number | null;
  lastDamageAt: number;
  speaking: boolean;
}

export interface LootNode {
  id: string;
  kind: 'container' | 'ground';
  biome: BiomeId;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  items: InventoryItem[];
}

export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'ended';

export type HelicopterPhase = 'idle' | 'flare_active' | 'approaching' | 'landed' | 'departed';

export interface CollapseState {
  phaseIndex: number; // 0..5
  sequence: BiomeId[]; // seeded 5-biome collapse order (never BASE_CAMP)
  warningBiome: BiomeId | null;
  warningSecondsRemaining: number;
  collapsedBiomes: BiomeId[];
  nextEventInSeconds: number;
}

export interface HelicopterState {
  phase: HelicopterPhase;
  activatedBy: string | null;
  arrivalSecondsRemaining: number;
  departureSecondsRemaining: number;
  seatsOccupiedBy: string[]; // max 2 player IDs
  x: number;
  y: number;
  z: number;
}

export interface HeraldAnnouncement {
  id: string;
  title: string;
  message: string;
  tone: 'ceremony' | 'warning' | 'elimination' | 'escape' | 'victory';
  timestamp: number;
}

export interface EmoteMessage {
  id: string;
  fromId: string;
  fromName: string;
  text: string;
  x: number;
  z: number;
  timestamp: number;
}

export interface MatchResultSummary {
  winnerId: string | null;
  winnerName: string | null;
  reason: 'solo_survivor' | 'helicopter_escape' | 'time_over';
  escapedPlayers: Array<{ id: string; name: string; hearthId: string; eliminations: number; resourcesCollected: number }>;
  rankings: Array<{
    id: string;
    name: string;
    hearthId: string;
    placement: number;
    alive: boolean;
    escaped: boolean;
    eliminations: number;
    resourcesCollected: number;
    survivalTimeSec: number;
  }>;
}

export interface RoomStateSnapshot {
  roomCode: string;
  phase: MatchPhase;
  seed: number;
  hostId: string;
  settings: MatchSettings;
  countdownSecondsRemaining: number;
  matchElapsedSeconds: number;
  lobbyPlayers: LobbyPlayer[];
  worldPlayers: WorldPlayerState[];
  lootNodes: LootNode[];
  collapse: CollapseState;
  helicopter: HelicopterState;
  herald: HeraldAnnouncement | null;
  results: MatchResultSummary | null;
}

export interface ServerToClientMessage {
  type:
    | 'welcome'
    | 'room_joined'
    | 'room_state'
    | 'world_tick'
    | 'herald'
    | 'emote'
    | 'combat_event'
    | 'alliance_invite'
    | 'rtc_signal'
    | 'error'
    | 'pong';
  payload: unknown;
}

export interface ClientToServerMessage {
  type:
    | 'create_room'
    | 'join_room'
    | 'reconnect_room'
    | 'leave_room'
    | 'update_profile'
    | 'update_settings'
    | 'toggle_ready'
    | 'start_match'
    | 'ceremony_dagger'
    | 'player_input'
    | 'interact'
    | 'attack'
    | 'use_item'
    | 'drop_item'
    | 'equip_item'
    | 'reload'
    | 'alliance_action'
    | 'send_emote'
    | 'activate_flare'
    | 'board_helicopter'
    | 'rtc_signal'
    | 'voice_state'
    | 'ping';
  payload?: unknown;
}
