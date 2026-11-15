import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_RADIUS,
  BASE_CAMP_RADIUS,
  generateArenaLayout,
  generateCollapseSequence,
  getBiomeAt,
  getGroundHeightAt,
  isInsideHexArena,
} from './worldGen.ts';
import {
  addItemToInventory,
  canStartMatch,
  computeDamageAmount,
  removeItemFromInventory,
  tickPlayerSurvival,
} from './combatAndSurvival.ts';
import { BiomeId, DEFAULT_APPEARANCE, type WorldPlayerState } from './types.ts';

test('deterministic arena generation produces identical layouts for same seed', () => {
  const layoutA = generateArenaLayout(424242);
  const layoutB = generateArenaLayout(424242);
  assert.equal(layoutA.obstacles.length, layoutB.obstacles.length);
  assert.equal(layoutA.lootNodes.length, layoutB.lootNodes.length);
  assert.deepEqual(layoutA.collapseSequence, layoutB.collapseSequence);
  assert.equal(layoutA.spawnPoints.length, 15);
  assert.equal(getGroundHeightAt(12, -18, 424242), getGroundHeightAt(12, -18, 424242));
});

test('Base Camp is central and distinct from the six outer biomes', () => {
  assert.equal(getBiomeAt(0, 0), BiomeId.BASE_CAMP);
  assert.equal(getBiomeAt(BASE_CAMP_RADIUS - 1, 0), BiomeId.BASE_CAMP);
  const seenOuter = new Set<BiomeId>();
  for (let i = 0; i < 6; i++) {
    const angle = ((i + 0.5) / 6) * Math.PI * 2;
    const x = Math.cos(angle) * (BASE_CAMP_RADIUS + 25);
    const z = Math.sin(angle) * (BASE_CAMP_RADIUS + 25);
    const b = getBiomeAt(x, z);
    assert.notEqual(b, BiomeId.BASE_CAMP);
    seenOuter.add(b);
  }
  assert.equal(seenOuter.size, 6);
  assert.equal(isInsideHexArena(0, 0), true);
  assert.equal(isInsideHexArena(ARENA_RADIUS + 10, 0), false);
});

test('collapse sequence has 5 biomes and never collapses BASE_CAMP', () => {
  const seq = generateCollapseSequence(98765);
  assert.equal(seq.length, 5);
  assert.equal(seq.includes(BiomeId.BASE_CAMP), false);
  assert.equal(new Set(seq).size, 5);
});

test('match start allows exactly 2 players and blocks 1 player', () => {
  assert.equal(canStartMatch(1), false);
  assert.equal(canStartMatch(2), true);
  assert.equal(canStartMatch(15), true);
  assert.equal(canStartMatch(16), false);
});

test('starting ceremonial dagger is protected from removal', () => {
  const inv = [{ itemId: 'dagger', quantity: 1 }];
  assert.equal(removeItemFromInventory(inv, 'dagger', 1), false);
  assert.equal(inv.length, 1);
  assert.equal(addItemToInventory(inv, 'bandage', 2), true);
  assert.equal(removeItemFromInventory(inv, 'bandage', 1), true);
  assert.equal(inv.find((s) => s.itemId === 'bandage')?.quantity, 1);
});

test('combat blocking mitigates damage and alliances do not grant invulnerability', () => {
  const settings = {
    healthRegenEnabled: true,
    friendlyFireAllies: false,
    collapseSpeedMultiplier: 1,
    startingRations: 1,
  };
  const unblocked = computeDamageAmount(
    20,
    { id: 'p1', alliances: [] },
    { id: 'p2', blocking: false, equippedDefenseId: null, hearthId: 'ash' },
    settings
  );
  const blocked = computeDamageAmount(
    20,
    { id: 'p1', alliances: [] },
    { id: 'p2', blocking: true, equippedDefenseId: null, hearthId: 'ash' },
    settings
  );
  const allyHit = computeDamageAmount(
    20,
    { id: 'p1', alliances: ['p2'] },
    { id: 'p2', blocking: false, equippedDefenseId: null, hearthId: 'ash' },
    settings
  );
  assert.equal(unblocked.finalDamage, 20);
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.finalDamage < unblocked.finalDamage);
  assert.equal(allyHit.wasAllyBetrayal, true);
  assert.ok(allyHit.finalDamage > 0);
});

test('survival tick applies collapse damage outside BASE_CAMP and triggers death at 0 HP', () => {
  const player: WorldPlayerState = {
    id: 'p1',
    name: 'Test',
    hearthId: 'ash',
    appearance: DEFAULT_APPEARANCE,
    x: 50,
    y: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    animState: 'idle',
    alive: true,
    escaped: false,
    connected: true,
    blocking: false,
    crouching: false,
    equippedWeaponId: 'dagger',
    equippedDefenseId: null,
    stats: {
      health: 5,
      maxHealth: 100,
      hunger: 80,
      stamina: 100,
      temperature: 20,
      statusEffects: [],
    },
    inventory: [{ itemId: 'dagger', quantity: 1 }],
    alliances: [],
    eliminations: 0,
    resourcesCollected: 0,
    survivalTimeSec: 0,
    placement: null,
    lastDamageAt: 0,
    speaking: false,
  };
  tickPlayerSurvival(
    player,
    BiomeId.MARSH,
    true,
    2,
    1.5,
    {
      healthRegenEnabled: false,
      friendlyFireAllies: true,
      collapseSpeedMultiplier: 1,
      startingRations: 1,
    }
  );
  assert.equal(player.alive, false);
  assert.equal(player.stats.health, 0);
  assert.equal(player.animState, 'death');
});
