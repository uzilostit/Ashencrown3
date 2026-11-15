import gameConfig from '../config/gameConfig.json' with { type: 'json' };
import { BiomeId, OUTER_BIOMES, type LootNode, type InventoryItem } from './types.ts';

export const ARENA_RADIUS = gameConfig.world.arenaRadius; // 115
export const BASE_CAMP_RADIUS = gameConfig.world.baseCampRadius; // 24

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic 6-sector hexagonal biome lookup.
 * BASE_CAMP occupies the inner hexagon/circle (radius <= BASE_CAMP_RADIUS).
 * Six outer wedges occupy 60-degree sectors around BASE_CAMP.
 */
export function getBiomeAt(x: number, z: number): BiomeId {
  const dist = Math.hypot(x, z);
  if (dist <= BASE_CAMP_RADIUS) {
    return BiomeId.BASE_CAMP;
  }
  let angle = Math.atan2(z, x); // -PI..PI
  if (angle < 0) angle += Math.PI * 2;
  const sector = Math.floor((angle / (Math.PI * 2)) * 6) % 6;
  return OUTER_BIOMES[sector];
}

/**
 * Deterministic continuous heightfield shared identically by server and client.
 */
export function getGroundHeightAt(x: number, z: number, seed: number): number {
  const dist = Math.hypot(x, z);
  if (dist <= BASE_CAMP_RADIUS - 3) {
    // Base Camp plaza is mostly flat, with a raised helipad dais on the north side (z ~ -13)
    const dHeli = Math.hypot(x - gameConfig.world.helipadPos.x, z - gameConfig.world.helipadPos.z);
    if (dHeli < 6.5) {
      const t = Math.max(0, Math.min(1, (6.5 - dHeli) / 1.5));
      return 0.65 * t;
    }
    return 0.15;
  }

  const biome = getBiomeAt(x, z);
  const phase = (seed % 997) * 0.013;
  const blend = Math.min(1, Math.max(0, (dist - (BASE_CAMP_RADIUS - 3)) / 10));

  let h = 0;
  const n1 = Math.sin(x * 0.065 + phase) * Math.cos(z * 0.065 - phase);
  const n2 = Math.sin((x + z) * 0.12 - phase * 1.7) * 0.5;

  switch (biome) {
    case BiomeId.MARSH:
      // Low boggy basin with shallow water pockets
      h = -0.35 + n1 * 0.45 + n2 * 0.25;
      break;
    case BiomeId.CINDER_FLATS:
      // Jagged scorched basalt shelves
      h = 0.6 + Math.abs(n1) * 1.4 + n2 * 0.4;
      break;
    case BiomeId.PINE_FOREST:
      // Gentle rolling woodland hills
      h = 0.9 + n1 * 1.2 + n2 * 0.6;
      break;
    case BiomeId.SALT_DUNES:
      // Sweeping wind-carved sand ridges
      h = 0.4 + Math.sin(x * 0.09 + z * 0.04 + phase) * 1.5 + n2 * 0.3;
      break;
    case BiomeId.FROST_RIDGE:
      // Elevated mountainous crags rising outward
      h = 1.6 + ((dist - BASE_CAMP_RADIUS) / (ARENA_RADIUS - BASE_CAMP_RADIUS)) * 3.8 + Math.abs(n1) * 1.6;
      break;
    case BiomeId.ORCHARD_RUINS:
      // Terraced agricultural benches
      h = 0.7 + Math.round((n1 * 1.4 + n2 * 0.5) * 2) * 0.35;
      break;
    default:
      h = 0.15;
  }

  // Rim rise near outer hexagonal edge to bound the arena naturally
  const rimStart = ARENA_RADIUS - 14;
  if (dist > rimStart) {
    const rimT = Math.min(1.5, (dist - rimStart) / 14);
    h += rimT * rimT * 4.5;
  }

  return 0.15 * (1 - blend) + h * blend;
}

export function isInsideHexArena(x: number, z: number, margin = 3): boolean {
  const maxR = ARENA_RADIUS - margin;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const hexDist = Math.max(az / 0.8660254, ax + az * 0.57735027);
  return hexDist <= maxR;
}

export function clampInsideHexArena(x: number, z: number, margin = 4): { x: number; z: number } {
  const maxR = ARENA_RADIUS - margin;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  const hexDist = Math.max(az / 0.8660254, ax + az * 0.57735027);
  if (hexDist <= maxR) return { x, z };
  const scale = maxR / (hexDist || 1);
  return { x: x * scale, z: z * scale };
}

export interface WorldObstacle {
  id: string;
  kind: 'tree' | 'rock' | 'ruin' | 'pillar' | 'fence' | 'pavilion_pillar';
  biome: BiomeId;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
  rotation: number;
  scale: number;
}

export interface ArenaLayout {
  seed: number;
  obstacles: WorldObstacle[];
  lootNodes: LootNode[];
  spawnPoints: Array<{ x: number; z: number; yaw: number }>;
  collapseSequence: BiomeId[];
}

function makeLootItems(biome: BiomeId, rng: () => number, isBaseCamp: boolean): InventoryItem[] {
  const items: InventoryItem[] = [];
  if (isBaseCamp) {
    const roll = rng();
    if (roll < 0.35) items.push({ itemId: 'longbow', quantity: 1 }, { itemId: 'arrows', quantity: 8 });
    else if (roll < 0.65) items.push({ itemId: 'flintlock', quantity: 1 }, { itemId: 'shells', quantity: 5 });
    else items.push({ itemId: 'medkit', quantity: 1 });
    items.push({ itemId: 'flare_charge', quantity: 1 });
    return items;
  }

  // Biome-flavored loot distribution
  const roll = rng();
  if (biome === BiomeId.MARSH) {
    items.push({ itemId: 'bandage', quantity: 1 + Math.floor(rng() * 2) });
    if (roll < 0.45) items.push({ itemId: 'longbow', quantity: 1 }, { itemId: 'arrows', quantity: 6 });
    else items.push({ itemId: 'berries', quantity: 2 });
  } else if (biome === BiomeId.CINDER_FLATS) {
    if (roll < 0.5) items.push({ itemId: 'flintlock', quantity: 1 }, { itemId: 'shells', quantity: 5 });
    else items.push({ itemId: 'cloak_ash', quantity: 1 });
    items.push({ itemId: 'scrap', quantity: 2 });
  } else if (biome === BiomeId.PINE_FOREST) {
    items.push({ itemId: 'berries', quantity: 2 + Math.floor(rng() * 2) });
    if (roll < 0.55) items.push({ itemId: 'longbow', quantity: 1 }, { itemId: 'arrows', quantity: 7 });
    else items.push({ itemId: 'bandage', quantity: 1 });
  } else if (biome === BiomeId.SALT_DUNES) {
    items.push({ itemId: 'tonic', quantity: 1 + Math.floor(rng() * 2) });
    if (roll < 0.45) items.push({ itemId: 'shells', quantity: 5 });
    else items.push({ itemId: 'cloak_ash', quantity: 1 });
    if (rng() < 0.25) items.push({ itemId: 'flare_charge', quantity: 1 });
  } else if (biome === BiomeId.FROST_RIDGE) {
    items.push({ itemId: 'cloak_fur', quantity: 1 });
    if (roll < 0.4) items.push({ itemId: 'medkit', quantity: 1 });
    else items.push({ itemId: 'ration', quantity: 1 });
  } else {
    // ORCHARD_RUINS
    items.push({ itemId: 'ration', quantity: 1 + Math.floor(rng() * 2) });
    if (roll < 0.5) items.push({ itemId: 'bandage', quantity: 2 });
    else items.push({ itemId: 'arrows', quantity: 8 });
    if (rng() < 0.25) items.push({ itemId: 'flare_charge', quantity: 1 });
  }

  return items;
}

export function generateCollapseSequence(seed: number): BiomeId[] {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const pool = [...OUTER_BIOMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // 5 collapses leave 1 outer biome + BASE_CAMP safe
  return pool.slice(0, gameConfig.match.totalCollapses);
}

export function generateArenaLayout(seed: number): ArenaLayout {
  const rng = mulberry32(seed);
  const obstacles: WorldObstacle[] = [];
  const lootNodes: LootNode[] = [];

  // 1. Base Camp Pavilion Pillars (radial ring around ceremonial pedestal at radius 8.5, keeping paths wide open)
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const x = Math.cos(a) * 9.5;
    const z = Math.sin(a) * 9.5;
    // Leave north helipad corridor clear
    if (Math.hypot(x - gameConfig.world.helipadPos.x, z - gameConfig.world.helipadPos.z) < 6) continue;
    obstacles.push({
      id: `bc_pillar_${i}`,
      kind: 'pavilion_pillar',
      biome: BiomeId.BASE_CAMP,
      x,
      y: getGroundHeightAt(x, z, seed),
      z,
      radius: 0.9,
      height: 5.5,
      rotation: a,
      scale: 1,
    });
  }

  // Base Camp high-value loot containers (4 chests around Base Camp outer rim)
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + 0.4;
    const r = 16.5;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    lootNodes.push({
      id: `loot_bc_${i}`,
      kind: 'container',
      biome: BiomeId.BASE_CAMP,
      x,
      y: getGroundHeightAt(x, z, seed),
      z,
      opened: false,
      items: makeLootItems(BiomeId.BASE_CAMP, rng, true),
    });
  }

  // 2. Populate each of the 6 outer biomes deterministically
  for (let sector = 0; sector < 6; sector++) {
    const biome = OUTER_BIOMES[sector];
    const startAngle = (sector * Math.PI * 2) / 6 + 0.08;
    const endAngle = ((sector + 1) * Math.PI * 2) / 6 - 0.08;

    // Place 18 natural obstacles (trees, rocks, ruins, pillars) per biome
    for (let i = 0; i < 18; i++) {
      const a = startAngle + rng() * (endAngle - startAngle);
      const r = BASE_CAMP_RADIUS + 8 + rng() * (ARENA_RADIUS - BASE_CAMP_RADIUS - 22);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!isInsideHexArena(x, z, 8)) continue;

      let kind: WorldObstacle['kind'] = 'rock';
      let radius = 1.1;
      let height = 2.6;
      if (biome === BiomeId.PINE_FOREST) {
        kind = i % 4 === 0 ? 'rock' : 'tree';
        radius = kind === 'tree' ? 0.85 : 1.3;
        height = kind === 'tree' ? 7.5 : 2.4;
      } else if (biome === BiomeId.MARSH) {
        kind = i % 3 === 0 ? 'ruin' : 'tree';
        radius = kind === 'ruin' ? 1.6 : 0.75;
        height = kind === 'ruin' ? 3.2 : 5.5;
      } else if (biome === BiomeId.CINDER_FLATS) {
        kind = i % 4 === 0 ? 'ruin' : 'rock';
        radius = 1.4;
        height = kind === 'ruin' ? 3.8 : 3.2;
      } else if (biome === BiomeId.SALT_DUNES) {
        kind = i % 3 === 0 ? 'ruin' : 'pillar';
        radius = 1.25;
        height = kind === 'pillar' ? 4.8 : 2.8;
      } else if (biome === BiomeId.FROST_RIDGE) {
        kind = i % 5 === 0 ? 'ruin' : 'pillar';
        radius = 1.35;
        height = 4.6;
      } else if (biome === BiomeId.ORCHARD_RUINS) {
        kind = i % 3 === 0 ? 'ruin' : i % 3 === 1 ? 'tree' : 'fence';
        radius = kind === 'ruin' ? 1.8 : 0.9;
        height = kind === 'ruin' ? 4.0 : 3.6;
      }

      obstacles.push({
        id: `obs_${sector}_${i}`,
        kind,
        biome,
        x,
        y: getGroundHeightAt(x, z, seed),
        z,
        radius,
        height,
        rotation: rng() * Math.PI * 2,
        scale: 0.85 + rng() * 0.35,
      });
    }

    // Place 6 loot containers/ground drops per biome (36 outer + 4 base camp = 40 loot nodes)
    for (let i = 0; i < 6; i++) {
      const a = startAngle + (i + 0.5) / 6 * (endAngle - startAngle);
      const r = BASE_CAMP_RADIUS + 14 + (i % 3) * 20 + rng() * 6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!isInsideHexArena(x, z, 8)) continue;
      lootNodes.push({
        id: `loot_${sector}_${i}`,
        kind: i % 2 === 0 ? 'container' : 'ground',
        biome,
        x,
        y: getGroundHeightAt(x, z, seed),
        z,
        opened: false,
        items: makeLootItems(biome, rng, false),
      });
    }
  }

  // 3. Generate 15 evenly-spaced open spawn points along the Base Camp / outer ring border (radius 30..36)
  // ensuring no overlap with obstacles and facing outward/inward along open path
  const spawnPoints: Array<{ x: number; z: number; yaw: number }> = [];
  for (let i = 0; i < 15; i++) {
    const a = (i / 15) * Math.PI * 2 + 0.12;
    const r = 32;
    let sx = Math.cos(a) * r;
    let sz = Math.sin(a) * r;
    // Nudge away from any nearby obstacle
    for (const obs of obstacles) {
      const dx = sx - obs.x;
      const dz = sz - obs.z;
      const d = Math.hypot(dx, dz);
      if (d < obs.radius + 2.2) {
        const push = (obs.radius + 2.4 - d) / (d || 1);
        sx += dx * push;
        sz += dz * push;
      }
    }
    // Face toward Base Camp center so the landmark pavilion is immediately visible on spawn
    const yaw = Math.atan2(-sx, -sz);
    spawnPoints.push({ x: sx, z: sz, yaw });
  }

  return {
    seed,
    obstacles,
    lootNodes,
    spawnPoints,
    collapseSequence: generateCollapseSequence(seed),
  };
}

export function resolveObstacleCollision(
  x: number,
  z: number,
  playerRadius: number,
  obstacles: WorldObstacle[]
): { x: number; z: number } {
  let rx = x;
  let rz = z;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const minD = playerRadius + obs.radius;
    const dx = rx - obs.x;
    const dz = rz - obs.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minD * minD) {
      const dist = Math.sqrt(distSq) || 0.001;
      const overlap = minD - dist;
      rx += (dx / dist) * overlap;
      rz += (dz / dist) * overlap;
    }
  }
  return clampInsideHexArena(rx, rz, 4);
}
