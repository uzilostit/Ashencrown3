import gameConfig from '../config/gameConfig.json' with { type: 'json' };
import {
  BIOME_DEFINITIONS,
  BiomeId,
  ITEM_CATALOG,
  type InventoryItem,
  type MatchSettings,
  type StatusEffect,
  type WorldPlayerState,
} from './types.ts';

export function computeEffectiveTemperature(
  biome: BiomeId,
  equippedDefenseId: string | null,
  hearthId: string
): number {
  let temp = BIOME_DEFINITIONS[biome].ambientTemp;
  const defense = equippedDefenseId ? ITEM_CATALOG[equippedDefenseId] : null;
  if (temp < 10) {
    const resist = (defense?.coldResist ?? 0) + (hearthId === 'frost' ? 6 : 0);
    temp = Math.min(18, temp + resist);
  } else if (temp > 30) {
    const resist = (defense?.heatResist ?? 0) + (hearthId === 'ember' ? 6 : 0);
    temp = Math.max(24, temp - resist);
  }
  return temp;
}

export function computeDamageAmount(
  baseDamage: number,
  attacker: Pick<WorldPlayerState, 'id' | 'alliances'>,
  defender: Pick<WorldPlayerState, 'id' | 'blocking' | 'equippedDefenseId' | 'hearthId'>,
  settings: MatchSettings
): { finalDamage: number; wasAllyBetrayal: boolean; blocked: boolean } {
  const isAlly = attacker.alliances.includes(defender.id);
  // Alliances never grant permanent invulnerability; betrayal deals reduced or full damage depending on match settings
  const betrayalScale = isAlly ? (settings.friendlyFireAllies ? 1.0 : 0.7) : 1.0;

  let armor = 0;
  if (defender.equippedDefenseId) {
    armor += ITEM_CATALOG[defender.equippedDefenseId]?.armorBonus ?? 0;
  }
  if (defender.hearthId === 'iron') {
    armor += 0.08;
  }

  let dmg = baseDamage * betrayalScale * (1 - armor);
  let blocked = false;
  if (defender.blocking) {
    dmg *= 0.35;
    blocked = true;
  }

  return {
    finalDamage: Math.max(1, Math.round(dmg)),
    wasAllyBetrayal: isAlly,
    blocked,
  };
}

export function addItemToInventory(
  inventory: InventoryItem[],
  itemId: string,
  quantity: number
): boolean {
  const def = ITEM_CATALOG[itemId];
  if (!def || quantity <= 0) return false;

  const existing = inventory.find((s) => s.itemId === itemId);
  if (existing) {
    existing.quantity = Math.min(def.maxStack, existing.quantity + quantity);
    return true;
  }
  if (inventory.length >= 12) return false;
  inventory.push({ itemId, quantity: Math.min(def.maxStack, quantity) });
  return true;
}

export function removeItemFromInventory(
  inventory: InventoryItem[],
  itemId: string,
  quantity: number
): boolean {
  const def = ITEM_CATALOG[itemId];
  if (def?.protected) return false; // Starting dagger cannot be dropped or deleted
  const idx = inventory.findIndex((s) => s.itemId === itemId);
  if (idx === -1 || inventory[idx].quantity < quantity) return false;
  inventory[idx].quantity -= quantity;
  if (inventory[idx].quantity <= 0) {
    inventory.splice(idx, 1);
  }
  return true;
}

export function tickPlayerSurvival(
  player: WorldPlayerState,
  biome: BiomeId,
  isCollapsedZone: boolean,
  collapsePhaseIndex: number,
  dt: number,
  settings: MatchSettings
): void {
  if (!player.alive || player.escaped) return;

  player.survivalTimeSec += dt;

  // Hunger drain (Hearth of Moss drains 20% slower)
  const hungerMult = player.hearthId === 'moss' ? 0.8 : 1.0;
  player.stats.hunger = Math.max(
    0,
    player.stats.hunger - gameConfig.survival.hungerDrainPerSecond * hungerMult * dt
  );

  // Temperature & environmental exposure
  const targetTemp = computeEffectiveTemperature(
    biome,
    player.equippedDefenseId,
    player.hearthId
  );
  player.stats.temperature += (targetTemp - player.stats.temperature) * Math.min(1, dt * 0.45);

  const effects = new Set<StatusEffect>(
    player.stats.statusEffects.filter((e) => e === 'bleeding' || e === 'healing_surge' || e === 'stamina_boost')
  );

  if (player.stats.temperature <= 4) {
    effects.add('cold_exposure');
    player.stats.health = Math.max(0, player.stats.health - 1.15 * dt);
  }
  if (player.stats.temperature >= 36) {
    effects.add('heat_exposure');
    player.stats.health = Math.max(0, player.stats.health - 1.15 * dt);
    player.stats.stamina = Math.max(0, player.stats.stamina - 3.5 * dt);
  }
  if (player.stats.stamina <= 10 || player.stats.hunger <= 12) {
    effects.add('exhaustion');
  }

  if (player.stats.hunger <= 0) {
    player.stats.health = Math.max(
      0,
      player.stats.health - gameConfig.survival.starvationDamagePerSecond * dt
    );
  }

  if (effects.has('bleeding')) {
    player.stats.health = Math.max(
      0,
      player.stats.health - gameConfig.survival.bleedDamagePerSecond * dt
    );
  }

  // Collapse zone escalating damage (never applies to BASE_CAMP)
  if (isCollapsedZone && biome !== BiomeId.BASE_CAMP) {
    const collapseDmg =
      gameConfig.survival.collapseBaseDamagePerSecond +
      collapsePhaseIndex * gameConfig.survival.collapseDamageEscalationPerPhase;
    player.stats.health = Math.max(0, player.stats.health - collapseDmg * dt);
  }

  // Configurable passive health regeneration when well-fed & safe
  if (
    settings.healthRegenEnabled &&
    !isCollapsedZone &&
    player.stats.hunger > 55 &&
    !effects.has('bleeding') &&
    !effects.has('cold_exposure') &&
    !effects.has('heat_exposure')
  ) {
    player.stats.health = Math.min(
      player.stats.maxHealth,
      player.stats.health + gameConfig.survival.healthRegenPerSecond * dt
    );
  }

  player.stats.statusEffects = Array.from(effects);

  if (player.stats.health <= 0) {
    player.stats.health = 0;
    player.alive = false;
    player.animState = 'death';
  }
}

export function canStartMatch(playerCount: number): boolean {
  return (
    playerCount >= gameConfig.server.minPlayersToStart &&
    playerCount <= gameConfig.server.maxPlayersPerRoom
  );
}
