import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { WebSocket, WebSocketServer } from 'ws';
import gameConfig from '../config/gameConfig.json' with { type: 'json' };
import {
  BIOME_DEFINITIONS,
  BiomeId,
  DEFAULT_APPEARANCE,
  ITEM_CATALOG,
  type ClientToServerMessage,
  type CollapseState,
  type HelicopterState,
  type HeraldAnnouncement,
  type LobbyPlayer,
  type LootNode,
  type MatchPhase,
  type MatchResultSummary,
  type MatchSettings,
  type PaperAppearance,
  type RoomStateSnapshot,
  type ServerToClientMessage,
  type WorldPlayerState,
} from '../shared/types.ts';
import {
  generateArenaLayout,
  getBiomeAt,
  getGroundHeightAt,
  resolveObstacleCollision,
  type ArenaLayout,
} from '../shared/worldGen.ts';
import {
  addItemToInventory,
  canStartMatch,
  computeDamageAmount,
  removeItemFromInventory,
  tickPlayerSurvival,
} from '../shared/combatAndSurvival.ts';

interface PlayerInputState {
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  blocking: boolean;
}

interface ServerPlayer {
  id: string;
  reconnectToken: string;
  ws: WebSocket | null;
  name: string;
  hearthId: string;
  appearance: PaperAppearance;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  ceremonyDaggerDrawn: boolean;
  isDummy?: boolean;
  input: PlayerInputState;
  vy: number;
  grounded: boolean;
  attackCooldown: number;
  collectTimer: number;
  interactTimer: number;
  damageFlashTimer: number;
  world: WorldPlayerState;
  msgTimestamps: number[];
}

interface RoomInstance {
  code: string;
  isDummyMatch: boolean;
  phase: MatchPhase;
  seed: number;
  hostId: string;
  settings: MatchSettings;
  layout: ArenaLayout;
  players: Map<string, ServerPlayer>;
  lootNodes: LootNode[];
  countdownSecondsRemaining: number;
  matchElapsedSeconds: number;
  collapse: CollapseState;
  helicopter: HelicopterState;
  herald: HeraldAnnouncement | null;
  results: MatchResultSummary | null;
  firstBloodTriggered: boolean;
  lastTickMs: number;
  tickCounter: number;
  endedAtMs: number | null;
}

export interface PersistedPlayerRecord {
  name: string;
  hearthId: string;
  appearance: PaperAppearance;
  matchesPlayed: number;
  wins: number;
  escapes: number;
  eliminations: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class AshenCrownGameServer {
  private rooms = new Map<string, RoomInstance>();
  private socketToPlayer = new Map<WebSocket, { roomCode: string; playerId: string }>();
  private statsPath = path.resolve(process.cwd(), 'data', 'stats.json');
  private statsMap = new Map<string, PersistedPlayerRecord>();
  private tickTimer: NodeJS.Timeout | null = null;

  private wss: WebSocketServer;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.loadStats();
    this.bindWebSocketServer();
    this.startSimulationLoop();
  }

  private loadStats() {
    try {
      if (fs.existsSync(this.statsPath)) {
        const raw = JSON.parse(fs.readFileSync(this.statsPath, 'utf-8')) as Record<string, PersistedPlayerRecord>;
        for (const [k, v] of Object.entries(raw)) {
          this.statsMap.set(k, v);
        }
      }
    } catch {
      // Non-fatal: continue with empty stats map
    }
  }

  private saveStats() {
    try {
      const dir = path.dirname(this.statsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, PersistedPlayerRecord> = {};
      for (const [k, v] of this.statsMap.entries()) obj[k] = v;
      fs.writeFileSync(this.statsPath, JSON.stringify(obj, null, 2));
    } catch {
      // Non-fatal on ephemeral/read-only fs
    }
  }

  public getHealthSummary() {
    return {
      status: 'ok',
      rooms: this.rooms.size,
      connections: this.socketToPlayer.size,
      uptimeSec: Math.round(process.uptime()),
    };
  }

  public getLeaderboard(): PersistedPlayerRecord[] {
    return Array.from(this.statsMap.values())
      .sort((a, b) => b.wins - a.wins || b.escapes - a.escapes || b.eliminations - a.eliminations)
      .slice(0, 20);
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private createDefaultWorldPlayer(
    id: string,
    name: string,
    hearthId: string,
    appearance: PaperAppearance,
    spawn: { x: number; z: number; yaw: number },
    seed: number,
    startingRations: number
  ): WorldPlayerState {
    const y = getGroundHeightAt(spawn.x, spawn.z, seed);
    const inventory = [{ itemId: 'dagger', quantity: 1 }];
    if (startingRations > 0) {
      inventory.push({ itemId: 'ration', quantity: startingRations });
    }
    return {
      id,
      name,
      hearthId,
      appearance,
      x: spawn.x,
      y,
      z: spawn.z,
      vx: 0,
      vz: 0,
      yaw: spawn.yaw,
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
        health: gameConfig.survival.maxHealth,
        maxHealth: gameConfig.survival.maxHealth,
        hunger: gameConfig.survival.maxHunger,
        stamina: gameConfig.survival.maxStamina,
        temperature: gameConfig.survival.baseTemperature,
        statusEffects: [],
      },
      inventory,
      alliances: [],
      eliminations: 0,
      resourcesCollected: 0,
      survivalTimeSec: 0,
      placement: null,
      lastDamageAt: 0,
      speaking: false,
    };
  }

  private createRoom(
    ws: WebSocket,
    payload: { name?: string; hearthId?: string; appearance?: PaperAppearance }
  ) {
    this.detachSocket(ws);
    const code = this.generateRoomCode();
    const seed = Math.floor(Math.random() * 899999) + 100000;
    const layout = generateArenaLayout(seed);
    const playerId = crypto.randomUUID();
    const reconnectToken = crypto.randomUUID();
    const cleanName = this.sanitizeName(payload.name);
    const hearthId = payload.hearthId || 'ash';
    const appearance = payload.appearance || { ...DEFAULT_APPEARANCE };

    const settings: MatchSettings = {
      healthRegenEnabled: true,
      friendlyFireAllies: false,
      collapseSpeedMultiplier: 1,
      startingRations: 1,
    };

    const player: ServerPlayer = {
      id: playerId,
      reconnectToken,
      ws,
      name: cleanName,
      hearthId,
      appearance,
      ready: false,
      connected: true,
      disconnectedAt: null,
      ceremonyDaggerDrawn: false,
      input: { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, blocking: false },
      vy: 0,
      grounded: true,
      attackCooldown: 0,
      collectTimer: 0,
      interactTimer: 0,
      damageFlashTimer: 0,
      world: this.createDefaultWorldPlayer(
        playerId,
        cleanName,
        hearthId,
        appearance,
        layout.spawnPoints[0],
        seed,
        settings.startingRations
      ),
      msgTimestamps: [],
    };

    const room: RoomInstance = {
      code,
      isDummyMatch: false,
      phase: 'lobby',
      seed,
      hostId: playerId,
      settings,
      layout,
      players: new Map([[playerId, player]]),
      lootNodes: structuredClone(layout.lootNodes),
      countdownSecondsRemaining: gameConfig.server.countdownSeconds,
      matchElapsedSeconds: 0,
      collapse: {
        phaseIndex: 0,
        sequence: layout.collapseSequence,
        warningBiome: null,
        warningSecondsRemaining: 0,
        collapsedBiomes: [],
        nextEventInSeconds: gameConfig.match.collapseIntervalSeconds,
      },
      helicopter: {
        phase: 'idle',
        activatedBy: null,
        arrivalSecondsRemaining: 0,
        departureSecondsRemaining: 0,
        seatsOccupiedBy: [],
        x: gameConfig.world.helipadPos.x,
        y: 26,
        z: gameConfig.world.helipadPos.z,
      },
      herald: null,
      results: null,
      firstBloodTriggered: false,
      lastTickMs: Date.now(),
      tickCounter: 0,
      endedAtMs: null,
    };

    this.rooms.set(code, room);
    this.socketToPlayer.set(ws, { roomCode: code, playerId });

    this.send(ws, {
      type: 'room_joined',
      payload: {
        roomCode: code,
        playerId,
        reconnectToken,
        snapshot: this.buildSnapshot(room),
      },
    });
  }

  private createDummyMatch(
    ws: WebSocket,
    payload: { name?: string; hearthId?: string; appearance?: PaperAppearance }
  ) {
    this.detachSocket(ws);
    const code = this.generateRoomCode();
    const seed = Math.floor(Math.random() * 899999) + 100000;
    const layout = generateArenaLayout(seed);
    const playerId = crypto.randomUUID();
    const dummyId = crypto.randomUUID();
    const reconnectToken = crypto.randomUUID();
    const cleanName = this.sanitizeName(payload.name);
    const hearthId = payload.hearthId || 'ash';
    const appearance = payload.appearance || { ...DEFAULT_APPEARANCE };
    const dummyAppearance: PaperAppearance = {
      paperTone: '#d9cbb8',
      cloakColor: '#7a352a',
      trimColor: '#d96b38',
      hatStyle: 'cap',
      foldDetail: 'weathered',
    };

    const settings: MatchSettings = {
      healthRegenEnabled: true,
      friendlyFireAllies: false,
      collapseSpeedMultiplier: 1,
      startingRations: 1,
    };

    const human: ServerPlayer = {
      id: playerId,
      reconnectToken,
      ws,
      name: cleanName,
      hearthId,
      appearance,
      ready: true,
      connected: true,
      disconnectedAt: null,
      ceremonyDaggerDrawn: false,
      input: { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, blocking: false },
      vy: 0,
      grounded: true,
      attackCooldown: 0,
      collectTimer: 0,
      interactTimer: 0,
      damageFlashTimer: 0,
      world: this.createDefaultWorldPlayer(
        playerId,
        cleanName,
        hearthId,
        appearance,
        layout.spawnPoints[0],
        seed,
        settings.startingRations
      ),
      msgTimestamps: [],
    };

    const dummyWorld = this.createDefaultWorldPlayer(
      dummyId,
      'Ash Dummy',
      'iron',
      dummyAppearance,
      layout.spawnPoints[1 % layout.spawnPoints.length],
      seed,
      1
    );
    dummyWorld.isDummy = true;

    const dummy: ServerPlayer = {
      id: dummyId,
      reconnectToken: crypto.randomUUID(),
      ws: null,
      name: 'Ash Dummy',
      hearthId: 'iron',
      appearance: dummyAppearance,
      ready: true,
      connected: true,
      disconnectedAt: null,
      ceremonyDaggerDrawn: true,
      isDummy: true,
      input: { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, blocking: false },
      vy: 0,
      grounded: true,
      attackCooldown: 0,
      collectTimer: 0,
      interactTimer: 0,
      damageFlashTimer: 0,
      world: dummyWorld,
      msgTimestamps: [],
    };

    const room: RoomInstance = {
      code,
      isDummyMatch: true,
      phase: 'lobby',
      seed,
      hostId: playerId,
      settings,
      layout,
      players: new Map([
        [playerId, human],
        [dummyId, dummy],
      ]),
      lootNodes: structuredClone(layout.lootNodes),
      countdownSecondsRemaining: 3,
      matchElapsedSeconds: 0,
      collapse: {
        phaseIndex: 0,
        sequence: layout.collapseSequence,
        warningBiome: null,
        warningSecondsRemaining: 0,
        collapsedBiomes: [],
        nextEventInSeconds: gameConfig.match.collapseIntervalSeconds,
      },
      helicopter: {
        phase: 'idle',
        activatedBy: null,
        arrivalSecondsRemaining: 0,
        departureSecondsRemaining: 0,
        seatsOccupiedBy: [],
        x: gameConfig.world.helipadPos.x,
        y: 26,
        z: gameConfig.world.helipadPos.z,
      },
      herald: null,
      results: null,
      firstBloodTriggered: false,
      lastTickMs: Date.now(),
      tickCounter: 0,
      endedAtMs: null,
    };

    this.rooms.set(code, room);
    this.socketToPlayer.set(ws, { roomCode: code, playerId });

    this.send(ws, {
      type: 'room_joined',
      payload: {
        roomCode: code,
        playerId,
        reconnectToken,
        snapshot: this.buildSnapshot(room),
      },
    });
    this.beginCountdown(room);
  }

  private joinRoom(
    ws: WebSocket,
    payload: { roomCode?: string; name?: string; hearthId?: string; appearance?: PaperAppearance }
  ) {
    const code = (payload.roomCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      this.sendError(ws, 'INVALID_CODE', 'Enter a valid six-character room code.');
      return;
    }
    const room = this.rooms.get(code);
    if (!room) {
      this.sendError(ws, 'ROOM_NOT_FOUND', `No room found with code ${code}.`);
      return;
    }
    if (room.phase !== 'lobby') {
      this.sendError(ws, 'MATCH_LOCKED', 'That match has already begun.');
      return;
    }
    if (room.players.size >= gameConfig.server.maxPlayersPerRoom) {
      this.sendError(ws, 'ROOM_FULL', 'This room is full (15/15 players).');
      return;
    }

    this.detachSocket(ws);
    const playerId = crypto.randomUUID();
    const reconnectToken = crypto.randomUUID();
    const cleanName = this.sanitizeName(payload.name);
    const hearthId = payload.hearthId || 'ash';
    const appearance = payload.appearance || { ...DEFAULT_APPEARANCE };
    const spawnIdx = room.players.size % room.layout.spawnPoints.length;

    const player: ServerPlayer = {
      id: playerId,
      reconnectToken,
      ws,
      name: cleanName,
      hearthId,
      appearance,
      ready: false,
      connected: true,
      disconnectedAt: null,
      ceremonyDaggerDrawn: false,
      input: { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, blocking: false },
      vy: 0,
      grounded: true,
      attackCooldown: 0,
      collectTimer: 0,
      interactTimer: 0,
      damageFlashTimer: 0,
      world: this.createDefaultWorldPlayer(
        playerId,
        cleanName,
        hearthId,
        appearance,
        room.layout.spawnPoints[spawnIdx],
        room.seed,
        room.settings.startingRations
      ),
      msgTimestamps: [],
    };

    room.players.set(playerId, player);
    this.socketToPlayer.set(ws, { roomCode: code, playerId });

    this.send(ws, {
      type: 'room_joined',
      payload: {
        roomCode: code,
        playerId,
        reconnectToken,
        snapshot: this.buildSnapshot(room),
      },
    });
    this.broadcastRoomState(room);
  }

  private reconnectRoom(
    ws: WebSocket,
    payload: { roomCode?: string; playerId?: string; reconnectToken?: string }
  ) {
    const code = (payload.roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this.sendError(ws, 'RECONNECT_EXPIRED', 'Room no longer exists.');
      return;
    }
    const player = payload.playerId ? room.players.get(payload.playerId) : undefined;
    if (!player || player.reconnectToken !== payload.reconnectToken) {
      this.sendError(ws, 'RECONNECT_INVALID', 'Invalid reconnection session.');
      return;
    }

    if (player.ws && player.ws !== ws) {
      this.socketToPlayer.delete(player.ws);
      try {
        player.ws.close();
      } catch {
        // ignore
      }
    }

    player.ws = ws;
    player.connected = true;
    player.world.connected = true;
    player.disconnectedAt = null;
    this.socketToPlayer.set(ws, { roomCode: code, playerId: player.id });

    this.send(ws, {
      type: 'room_joined',
      payload: {
        roomCode: code,
        playerId: player.id,
        reconnectToken: player.reconnectToken,
        snapshot: this.buildSnapshot(room),
      },
    });
    this.broadcastRoomState(room);
  }

  private leaveRoom(ws: WebSocket) {
    const link = this.socketToPlayer.get(ws);
    if (!link) return;
    this.socketToPlayer.delete(ws);
    const room = this.rooms.get(link.roomCode);
    if (!room) return;

    const player = room.players.get(link.playerId);
    if (!player) return;

    if (room.phase === 'lobby') {
      room.players.delete(link.playerId);
      if (room.players.size === 0) {
        this.rooms.delete(room.code);
        return;
      }
      if (room.hostId === link.playerId) {
        this.migrateHost(room);
      }
      this.broadcastRoomState(room);
    } else {
      player.connected = false;
      player.ws = null;
      player.world.connected = false;
      player.disconnectedAt = Date.now();
      if (room.hostId === link.playerId) {
        this.migrateHost(room);
      }
      this.broadcastRoomState(room);
    }
  }

  private detachSocket(ws: WebSocket) {
    const link = this.socketToPlayer.get(ws);
    if (!link) return;
    this.socketToPlayer.delete(ws);
    const room = this.rooms.get(link.roomCode);
    if (!room) return;
    const player = room.players.get(link.playerId);
    if (!player) return;

    player.connected = false;
    player.ws = null;
    player.world.connected = false;
    player.disconnectedAt = Date.now();

    if (room.phase === 'lobby' && room.players.size <= 1) {
      // Keep room briefly for reconnect unless empty; migrate host if needed
    }
    if (room.hostId === player.id) {
      this.migrateHost(room);
    }
    this.broadcastRoomState(room);
  }

  private migrateHost(room: RoomInstance) {
    const next =
      Array.from(room.players.values()).find((p) => !p.isDummy && p.connected) ||
      Array.from(room.players.values()).find((p) => !p.isDummy);
    if (next) {
      room.hostId = next.id;
    }
  }

  private bindWebSocketServer() {
    this.wss.on('connection', (ws) => {
      this.send(ws, { type: 'welcome', payload: { serverTime: Date.now() } });

      ws.on('message', (raw) => {
        let msg: ClientToServerMessage;
        try {
          msg = JSON.parse(raw.toString()) as ClientToServerMessage;
        } catch {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'ping') {
          this.send(ws, { type: 'pong', payload: { ts: Date.now() } });
          return;
        }
        if (msg.type === 'create_room') {
          this.createRoom(ws, (msg.payload as Record<string, unknown>) || {});
          return;
        }
        if (msg.type === 'start_dummy_match') {
          this.createDummyMatch(ws, (msg.payload as Record<string, unknown>) || {});
          return;
        }
        if (msg.type === 'join_room') {
          this.joinRoom(ws, (msg.payload as Record<string, unknown>) || {});
          return;
        }
        if (msg.type === 'reconnect_room') {
          this.reconnectRoom(ws, (msg.payload as Record<string, unknown>) || {});
          return;
        }
        if (msg.type === 'leave_room') {
          this.leaveRoom(ws);
          return;
        }

        const link = this.socketToPlayer.get(ws);
        if (!link) return;
        const room = this.rooms.get(link.roomCode);
        if (!room) return;
        const player = room.players.get(link.playerId);
        if (!player) return;

        // Basic rate limiting
        const now = Date.now();
        player.msgTimestamps = player.msgTimestamps.filter((t) => now - t < 1000);
        if (player.msgTimestamps.length >= gameConfig.server.rateLimitMaxPerSecond) {
          return;
        }
        player.msgTimestamps.push(now);

        this.handlePlayerMessage(room, player, msg);
      });

      ws.on('close', () => {
        this.detachSocket(ws);
      });
    });
  }

  private handlePlayerMessage(room: RoomInstance, player: ServerPlayer, msg: ClientToServerMessage) {
    const p = (msg.payload || {}) as Record<string, unknown>;

    switch (msg.type) {
      case 'update_profile': {
        if (room.phase !== 'lobby') return;
        if (typeof p.name === 'string') {
          player.name = this.sanitizeName(p.name);
          player.world.name = player.name;
        }
        if (typeof p.hearthId === 'string') {
          player.hearthId = p.hearthId;
          player.world.hearthId = p.hearthId;
        }
        if (p.appearance && typeof p.appearance === 'object') {
          player.appearance = { ...player.appearance, ...(p.appearance as Partial<PaperAppearance>) };
          player.world.appearance = player.appearance;
        }
        this.broadcastRoomState(room);
        break;
      }
      case 'update_settings': {
        if (room.phase !== 'lobby' || room.hostId !== player.id) return;
        room.settings = {
          healthRegenEnabled: Boolean(p.healthRegenEnabled ?? room.settings.healthRegenEnabled),
          friendlyFireAllies: Boolean(p.friendlyFireAllies ?? room.settings.friendlyFireAllies),
          collapseSpeedMultiplier: Number(p.collapseSpeedMultiplier ?? room.settings.collapseSpeedMultiplier) === 1.5 ? 1.5 : 1,
          startingRations: Math.max(0, Math.min(3, Number(p.startingRations ?? room.settings.startingRations) || 1)),
        };
        this.broadcastRoomState(room);
        break;
      }
      case 'toggle_ready': {
        if (room.phase !== 'lobby') return;
        player.ready = !player.ready;
        this.broadcastRoomState(room);
        break;
      }
      case 'start_match': {
        if (room.phase !== 'lobby' || room.hostId !== player.id) return;
        const connectedPlayers = Array.from(room.players.values()).filter((pl) => pl.connected);
        if (!canStartMatch(connectedPlayers.length)) {
          this.sendError(player.ws, 'MIN_PLAYERS', 'At least 2 players are required to start a match.');
          return;
        }
        this.beginCountdown(room);
        break;
      }
      case 'ceremony_dagger': {
        if (room.phase !== 'countdown') return;
        player.ceremonyDaggerDrawn = true;
        this.broadcastRoomState(room);
        break;
      }
      case 'player_input': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        player.input = {
          moveX: Math.max(-1, Math.min(1, Number(p.moveX) || 0)),
          moveZ: Math.max(-1, Math.min(1, Number(p.moveZ) || 0)),
          yaw: Number(p.yaw) || 0,
          pitch: Number(p.pitch) || 0,
          sprint: Boolean(p.sprint),
          crouch: Boolean(p.crouch),
          jump: Boolean(p.jump),
          blocking: Boolean(p.blocking),
        };
        break;
      }
      case 'interact': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        this.handleInteract(room, player);
        break;
      }
      case 'attack': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        this.handleAttack(room, player, p);
        break;
      }
      case 'use_item': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        if (typeof p.itemId === 'string') this.handleUseItem(player, p.itemId);
        break;
      }
      case 'drop_item': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        if (typeof p.itemId === 'string') this.handleDropItem(room, player, p.itemId);
        break;
      }
      case 'equip_item': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        if (typeof p.itemId === 'string') this.handleEquipItem(player, p.itemId);
        break;
      }
      case 'alliance_action': {
        if (room.phase !== 'playing' || !player.world.alive) return;
        this.handleAlliance(room, player, p);
        break;
      }
      case 'send_emote': {
        if (room.phase !== 'playing' && room.phase !== 'countdown') return;
        const text = typeof p.text === 'string' ? p.text.slice(0, 60).trim() : '';
        if (!text) return;
        this.broadcast(room, {
          type: 'emote',
          payload: {
            id: crypto.randomUUID(),
            fromId: player.id,
            fromName: player.name,
            text,
            x: player.world.x,
            z: player.world.z,
            timestamp: Date.now(),
          },
        });
        break;
      }
      case 'activate_flare': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        this.handleActivateFlare(room, player);
        break;
      }
      case 'board_helicopter': {
        if (room.phase !== 'playing' || !player.world.alive || player.world.escaped) return;
        this.handleBoardHelicopter(room, player);
        break;
      }
      case 'voice_state': {
        player.world.speaking = Boolean(p.speaking);
        break;
      }
      case 'rtc_signal': {
        const targetId = typeof p.targetId === 'string' ? p.targetId : '';
        const target = room.players.get(targetId);
        if (target?.ws && target.connected) {
          this.send(target.ws, {
            type: 'rtc_signal',
            payload: { fromId: player.id, signal: p.signal },
          });
        }
        break;
      }
    }
  }

  private beginCountdown(room: RoomInstance) {
    room.phase = 'countdown';
    room.countdownSecondsRemaining = room.isDummyMatch ? 3 : gameConfig.server.countdownSeconds;
    room.matchElapsedSeconds = 0;
    room.firstBloodTriggered = false;
    room.results = null;
    room.seed = Math.floor(Math.random() * 899999) + 100000;
    room.layout = generateArenaLayout(room.seed);
    room.lootNodes = structuredClone(room.layout.lootNodes);
    room.collapse = {
      phaseIndex: 0,
      sequence: room.layout.collapseSequence,
      warningBiome: null,
      warningSecondsRemaining: 0,
      collapsedBiomes: [],
      nextEventInSeconds: Math.round(gameConfig.match.collapseIntervalSeconds / room.settings.collapseSpeedMultiplier),
    };
    room.helicopter = {
      phase: 'idle',
      activatedBy: null,
      arrivalSecondsRemaining: 0,
      departureSecondsRemaining: 0,
      seatsOccupiedBy: [],
      x: gameConfig.world.helipadPos.x,
      y: 26,
      z: gameConfig.world.helipadPos.z,
    };

    let idx = 0;
    for (const player of room.players.values()) {
      const spawn = room.layout.spawnPoints[idx % room.layout.spawnPoints.length];
      player.ceremonyDaggerDrawn = Boolean(player.isDummy);
      player.world = this.createDefaultWorldPlayer(
        player.id,
        player.name,
        player.hearthId,
        player.appearance,
        spawn,
        room.seed,
        room.settings.startingRations
      );
      if (player.isDummy) player.world.isDummy = true;
      idx++;
    }

    this.issueHerald(
      room,
      room.isDummyMatch ? 'DUMMY MATCH CEREMONY' : 'THE CEREMONY BEGINS',
      room.isDummyMatch
        ? 'Entering solo practice arena with Ash Dummy in 3 seconds.'
        : 'Stand around the Ash Pedestal. Draw your dagger before the fifteen-second bell tolls.',
      'ceremony'
    );
    this.broadcastRoomState(room);
  }

  private transitionToPlaying(room: RoomInstance) {
    room.phase = 'playing';
    room.countdownSecondsRemaining = 0;
    this.issueHerald(
      room,
      'THE CROWN IS OPEN',
      'Scavenge the six biomes, endure the collapse, and claim a seat when the helipad flare rises.',
      'ceremony'
    );
    this.broadcastRoomState(room);
  }

  private handleInteract(room: RoomInstance, player: ServerPlayer) {
    // 1. Check helicopter boarding first if landed
    if (room.helicopter.phase === 'landed') {
      const dHeli = Math.hypot(
        player.world.x - gameConfig.world.helipadPos.x,
        player.world.z - gameConfig.world.helipadPos.z
      );
      if (dHeli <= 5.5) {
        this.handleBoardHelicopter(room, player);
        return;
      }
    }

    // 2. Check Helipad Flare terminal
    const dHeli = Math.hypot(
      player.world.x - gameConfig.world.helipadPos.x,
      player.world.z - gameConfig.world.helipadPos.z
    );
    if (dHeli <= 5.5 && room.helicopter.phase === 'idle') {
      const hasFlare = player.world.inventory.some((i) => i.itemId === 'flare_charge');
      if (hasFlare || room.matchElapsedSeconds >= 25) {
        this.handleActivateFlare(room, player);
        return;
      }
    }

    // 3. Check nearest unopened loot node within 3.4m
    let bestNode: LootNode | null = null;
    let bestDist = 3.4;
    for (const node of room.lootNodes) {
      if (node.opened || node.items.length === 0) continue;
      const d = Math.hypot(player.world.x - node.x, player.world.z - node.z);
      if (d < bestDist) {
        bestDist = d;
        bestNode = node;
      }
    }

    if (!bestNode) return;

    // Server-authoritative atomic loot transfer (no duplication)
    const remaining: typeof bestNode.items = [];
    let collectedAny = false;
    for (const item of bestNode.items) {
      if (addItemToInventory(player.world.inventory, item.itemId, item.quantity)) {
        player.world.resourcesCollected += item.quantity;
        collectedAny = true;
      } else {
        remaining.push(item);
      }
    }
    bestNode.items = remaining;
    if (remaining.length === 0) {
      bestNode.opened = true;
    }
    if (collectedAny) {
      player.collectTimer = 0.45;
      player.world.animState = 'collecting';
      this.broadcastRoomState(room);
    }
  }

  private handleAttack(room: RoomInstance, player: ServerPlayer, payload: Record<string, unknown>) {
    if (player.attackCooldown > 0 || player.world.blocking) return;

    const weaponId = player.world.equippedWeaponId || 'dagger';
    const weapon = ITEM_CATALOG[weaponId] || ITEM_CATALOG.dagger;
    const isRanged = Boolean(weapon.ammoType);

    if (isRanged && weapon.ammoType) {
      const consumed = removeItemFromInventory(player.world.inventory, weapon.ammoType, 1);
      if (!consumed) {
        this.sendError(player.ws, 'NO_AMMO', `Out of ${ITEM_CATALOG[weapon.ammoType]?.name || 'ammo'}.`);
        return;
      }
    }

    player.attackCooldown = weapon.cooldownSec || 0.5;
    player.world.animState = 'attacking';

    const aimYaw = typeof payload.yaw === 'number' ? payload.yaw : player.world.yaw;
    player.world.yaw = aimYaw;
    const dirX = Math.sin(aimYaw);
    const dirZ = Math.cos(aimYaw);
    const maxRange = weapon.range || 2.6;

    let hitPlayer: ServerPlayer | null = null;
    let bestProj = maxRange;

    for (const other of room.players.values()) {
      if (other.id === player.id || !other.world.alive || other.world.escaped) continue;
      const dx = other.world.x - player.world.x;
      const dz = other.world.z - player.world.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange) continue;

      const forwardDot = (dx * dirX + dz * dirZ) / (dist || 1);
      const minDot = isRanged ? 0.92 : 0.45;
      if (forwardDot >= minDot && dist < bestProj) {
        bestProj = dist;
        hitPlayer = other;
      }
    }

    if (hitPlayer) {
      const dmgRes = computeDamageAmount(weapon.damage || 20, player.world, hitPlayer.world, room.settings);
      hitPlayer.world.stats.health = Math.max(0, hitPlayer.world.stats.health - dmgRes.finalDamage);
      hitPlayer.damageFlashTimer = 0.28;
      hitPlayer.world.lastDamageAt = Date.now();
      if (!dmgRes.blocked && Math.random() < 0.28 && !hitPlayer.world.stats.statusEffects.includes('bleeding')) {
        hitPlayer.world.stats.statusEffects.push('bleeding');
      }

      if (dmgRes.wasAllyBetrayal) {
        player.world.alliances = player.world.alliances.filter((id) => id !== hitPlayer!.id);
        hitPlayer.world.alliances = hitPlayer.world.alliances.filter((id) => id !== player.id);
        this.issueHerald(
          room,
          'ALLIANCE BETRAYED',
          `${player.name} struck former ally ${hitPlayer.name}!`,
          'warning'
        );
      }

      if (hitPlayer.world.stats.health <= 0) {
        this.handleElimination(room, hitPlayer, player);
      }

      this.broadcast(room, {
        type: 'combat_event',
        payload: {
          attackerId: player.id,
          targetId: hitPlayer.id,
          weaponId,
          damage: dmgRes.finalDamage,
          blocked: dmgRes.blocked,
          x: hitPlayer.world.x,
          y: hitPlayer.world.y + 1.1,
          z: hitPlayer.world.z,
        },
      });
    } else {
      this.broadcast(room, {
        type: 'combat_event',
        payload: {
          attackerId: player.id,
          targetId: null,
          weaponId,
          damage: 0,
          blocked: false,
          x: player.world.x + dirX * (isRanged ? 12 : 1.5),
          y: player.world.y + 1.1,
          z: player.world.z + dirZ * (isRanged ? 12 : 1.5),
        },
      });
    }
  }

  private handleUseItem(player: ServerPlayer, itemId: string) {
    const def = ITEM_CATALOG[itemId];
    if (!def) return;
    if (def.category === 'weapon' || def.category === 'defense') {
      this.handleEquipItem(player, itemId);
      return;
    }
    if (!removeItemFromInventory(player.world.inventory, itemId, 1)) return;

    if (def.healAmount) {
      player.world.stats.health = Math.min(player.world.stats.maxHealth, player.world.stats.health + def.healAmount);
    }
    if (def.hungerAmount) {
      player.world.stats.hunger = Math.min(gameConfig.survival.maxHunger, player.world.stats.hunger + def.hungerAmount);
    }
    if (def.staminaBoost) {
      player.world.stats.stamina = Math.min(gameConfig.survival.maxStamina, player.world.stats.stamina + def.staminaBoost);
    }
    if (itemId === 'bandage' || itemId === 'medkit') {
      player.world.stats.statusEffects = player.world.stats.statusEffects.filter((e) => e !== 'bleeding');
    }
    if (itemId === 'scrap') {
      player.world.stats.health = Math.min(player.world.stats.maxHealth, player.world.stats.health + 10);
    }
    player.interactTimer = 0.35;
  }

  private handleDropItem(room: RoomInstance, player: ServerPlayer, itemId: string) {
    const def = ITEM_CATALOG[itemId];
    if (def?.protected) {
      this.sendError(player.ws, 'PROTECTED_ITEM', 'Your Ceremonial Dagger cannot be discarded.');
      return;
    }
    if (!removeItemFromInventory(player.world.inventory, itemId, 1)) return;
    if (player.world.equippedWeaponId === itemId) player.world.equippedWeaponId = 'dagger';
    if (player.world.equippedDefenseId === itemId) player.world.equippedDefenseId = null;

    room.lootNodes.push({
      id: `drop_${crypto.randomUUID().slice(0, 8)}`,
      kind: 'ground',
      biome: getBiomeAt(player.world.x, player.world.z),
      x: player.world.x + Math.sin(player.world.yaw) * 1.1,
      y: player.world.y,
      z: player.world.z + Math.cos(player.world.yaw) * 1.1,
      opened: false,
      items: [{ itemId, quantity: 1 }],
    });
    this.broadcastRoomState(room);
  }

  private handleEquipItem(player: ServerPlayer, itemId: string) {
    const has = player.world.inventory.some((i) => i.itemId === itemId);
    if (!has) return;
    const def = ITEM_CATALOG[itemId];
    if (!def) return;
    if (def.category === 'weapon') {
      player.world.equippedWeaponId = itemId;
    } else if (def.category === 'defense') {
      player.world.equippedDefenseId = itemId;
    }
  }

  private handleAlliance(room: RoomInstance, player: ServerPlayer, p: Record<string, unknown>) {
    const action = typeof p.action === 'string' ? p.action : '';
    const targetId = typeof p.targetId === 'string' ? p.targetId : '';
    const target = room.players.get(targetId);
    if (!target || target.id === player.id || !target.world.alive) return;

    if (action === 'invite') {
      const dist = Math.hypot(player.world.x - target.world.x, player.world.z - target.world.z);
      if (dist > 28) {
        this.sendError(player.ws, 'TOO_FAR', 'Move closer to offer an alliance.');
        return;
      }
      if (target.ws && target.connected) {
        this.send(target.ws, {
          type: 'alliance_invite',
          payload: { fromId: player.id, fromName: player.name },
        });
      }
    } else if (action === 'accept') {
      if (!player.world.alliances.includes(target.id)) player.world.alliances.push(target.id);
      if (!target.world.alliances.includes(player.id)) target.world.alliances.push(player.id);
      this.broadcastRoomState(room);
    } else if (action === 'break') {
      player.world.alliances = player.world.alliances.filter((id) => id !== target.id);
      target.world.alliances = target.world.alliances.filter((id) => id !== player.id);
      this.broadcastRoomState(room);
    }
  }

  private handleActivateFlare(room: RoomInstance, player: ServerPlayer) {
    if (room.helicopter.phase !== 'idle') return;
    const dHeli = Math.hypot(
      player.world.x - gameConfig.world.helipadPos.x,
      player.world.z - gameConfig.world.helipadPos.z
    );
    if (dHeli > 6.5) {
      this.sendError(player.ws, 'NOT_AT_HELIPAD', 'Stand on the Base Camp Helipad to ignite the extraction flare.');
      return;
    }
    const hasFlare = player.world.inventory.some((i) => i.itemId === 'flare_charge');
    if (hasFlare) {
      removeItemFromInventory(player.world.inventory, 'flare_charge', 1);
    } else if (room.matchElapsedSeconds < 25) {
      this.sendError(player.ws, 'FLARE_NOT_READY', 'Need a Signal Flare Charge or wait 25s into the match.');
      return;
    }

    room.helicopter.phase = 'flare_active';
    room.helicopter.activatedBy = player.id;
    room.helicopter.arrivalSecondsRemaining = gameConfig.match.flareArrivalSeconds;
    room.helicopter.departureSecondsRemaining = gameConfig.match.helicopterStaySeconds;
    player.interactTimer = 0.6;

    this.issueHerald(
      room,
      'EXTRACTION FLARE IGNITED',
      `${player.name} lit the Base Camp beacon. Extraction helicopter arrives in 60 seconds with 2 seats.`,
      'escape'
    );
    this.broadcastRoomState(room);
  }

  private handleBoardHelicopter(room: RoomInstance, player: ServerPlayer) {
    if (room.helicopter.phase !== 'landed') return;
    const dHeli = Math.hypot(
      player.world.x - gameConfig.world.helipadPos.x,
      player.world.z - gameConfig.world.helipadPos.z
    );
    if (dHeli > 6.5) return;

    if (room.helicopter.seatsOccupiedBy.includes(player.id)) return;
    if (room.helicopter.seatsOccupiedBy.length >= gameConfig.match.helicopterSeats) {
      this.sendError(player.ws, 'SEATS_FULL', 'Both helicopter escape seats are already claimed.');
      return;
    }

    room.helicopter.seatsOccupiedBy.push(player.id);
    player.world.escaped = true;
    player.world.animState = 'victory';

    this.issueHerald(
      room,
      'SURVIVOR BOARDED',
      `${player.name} claimed escape seat ${room.helicopter.seatsOccupiedBy.length}/${gameConfig.match.helicopterSeats}!`,
      'escape'
    );

    if (room.helicopter.seatsOccupiedBy.length >= gameConfig.match.helicopterSeats) {
      room.helicopter.departureSecondsRemaining = Math.min(room.helicopter.departureSecondsRemaining, 4);
    }
    this.broadcastRoomState(room);
  }

  private handleElimination(room: RoomInstance, victim: ServerPlayer, killer?: ServerPlayer) {
    if (!victim.world.alive) return;
    victim.world.alive = false;
    victim.world.animState = 'death';
    const aliveCount = Array.from(room.players.values()).filter((p) => p.world.alive && !p.world.escaped).length;
    victim.world.placement = aliveCount + 1;

    if (killer && killer.id !== victim.id) {
      killer.world.eliminations += 1;
    }

    // Drop victim's non-protected items on the ground
    const drops = victim.world.inventory.filter((i) => !ITEM_CATALOG[i.itemId]?.protected);
    if (drops.length > 0) {
      room.lootNodes.push({
        id: `satchel_${crypto.randomUUID().slice(0, 8)}`,
        kind: 'ground',
        biome: getBiomeAt(victim.world.x, victim.world.z),
        x: victim.world.x,
        y: victim.world.y,
        z: victim.world.z,
        opened: false,
        items: drops,
      });
    }

    if (!room.firstBloodTriggered) {
      room.firstBloodTriggered = true;
      this.issueHerald(
        room,
        'FIRST FALLEN',
        killer
          ? `${victim.name} fell to ${killer.name}. Only the resolute keep the crown.`
          : `${victim.name} succumbed to the arena.`,
        'elimination'
      );
    } else {
      this.issueHerald(
        room,
        'CONTESTANT ELIMINATED',
        killer ? `${victim.name} was eliminated by ${killer.name}.` : `${victim.name} perished in the collapse.`,
        'elimination'
      );
    }

    this.checkMatchEnd(room);
  }

  private checkMatchEnd(room: RoomInstance) {
    if (room.phase !== 'playing') return;

    const allPlayers = Array.from(room.players.values());
    const escaped = allPlayers.filter((p) => p.world.escaped);
    const activeAlive = allPlayers.filter((p) => p.world.alive && !p.world.escaped);

    // Helicopter departed with survivors
    if (room.helicopter.phase === 'departed' && escaped.length > 0) {
      this.concludeMatch(room, 'helicopter_escape');
      return;
    }

    // Solo survivor victory when <= 1 active alive and nobody escaped
    if (activeAlive.length <= 1 && escaped.length === 0 && allPlayers.length >= 2) {
      if (activeAlive.length === 1) {
        activeAlive[0].world.animState = 'victory';
        activeAlive[0].world.placement = 1;
      }
      this.concludeMatch(room, 'solo_survivor');
      return;
    }

    // If everyone left alive has escaped or died
    if (activeAlive.length === 0 && escaped.length > 0) {
      this.concludeMatch(room, 'helicopter_escape');
    }
  }

  private concludeMatch(room: RoomInstance, reason: MatchResultSummary['reason']) {
    if (room.phase === 'ended') return;
    room.phase = 'ended';
    room.endedAtMs = Date.now();

    const sorted = Array.from(room.players.values()).sort((a, b) => {
      if (a.world.escaped !== b.world.escaped) return a.world.escaped ? -1 : 1;
      if (a.world.alive !== b.world.alive) return a.world.alive ? -1 : 1;
      return b.world.survivalTimeSec - a.world.survivalTimeSec || b.world.eliminations - a.world.eliminations;
    });

    const rankings = sorted.map((p, index) => ({
      id: p.id,
      name: p.name,
      hearthId: p.hearthId,
      placement: index + 1,
      alive: p.world.alive,
      escaped: p.world.escaped,
      eliminations: p.world.eliminations,
      resourcesCollected: p.world.resourcesCollected,
      survivalTimeSec: Math.round(p.world.survivalTimeSec),
    }));

    const winner = rankings[0] || null;
    const escapedPlayers = rankings
      .filter((r) => r.escaped)
      .map((r) => ({
        id: r.id,
        name: r.name,
        hearthId: r.hearthId,
        eliminations: r.eliminations,
        resourcesCollected: r.resourcesCollected,
      }));

    room.results = {
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      reason,
      escapedPlayers,
      rankings,
    };

    // Persist stats for real multiplayer matches only
    if (!room.isDummyMatch) {
      for (const r of rankings) {
        const prev = this.statsMap.get(r.name) || {
          name: r.name,
          hearthId: r.hearthId,
          appearance: DEFAULT_APPEARANCE,
          matchesPlayed: 0,
          wins: 0,
          escapes: 0,
          eliminations: 0,
        };
        prev.matchesPlayed += 1;
        if (r.placement === 1) prev.wins += 1;
        if (r.escaped) prev.escapes += 1;
        prev.eliminations += r.eliminations;
        this.statsMap.set(r.name, prev);
      }
      this.saveStats();
    }

    this.issueHerald(
      room,
      reason === 'helicopter_escape' ? 'EXTRACTION COMPLETE' : 'FINAL SURVIVOR CROWNED',
      winner ? `${winner.name} claims victory in ASHEN CROWN.` : 'The arena falls silent.',
      'victory'
    );
    this.broadcastRoomState(room);
  }

  private startSimulationLoop() {
    const tickMs = Math.round(1000 / gameConfig.server.tickRateHz);
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      for (const room of this.rooms.values()) {
        const dt = Math.min(0.1, (now - room.lastTickMs) / 1000);
        room.lastTickMs = now;
        this.tickRoom(room, dt, now);
      }
    }, tickMs);
  }

  private tickRoom(room: RoomInstance, dt: number, now: number) {
    // Reconnect expiration cleanup (90 seconds)
    for (const [pid, player] of room.players.entries()) {
      if (player.isDummy) continue;
      if (!player.connected && player.disconnectedAt) {
        if (now - player.disconnectedAt > gameConfig.server.reconnectGraceSeconds * 1000) {
          if (room.phase === 'lobby' || room.isDummyMatch) {
            room.players.delete(pid);
          } else if (room.phase === 'playing' && player.world.alive) {
            this.handleElimination(room, player);
          }
        }
      }
    }

    const humanPlayers = Array.from(room.players.values()).filter((p) => !p.isDummy);
    if (room.players.size === 0 || (room.isDummyMatch && humanPlayers.length === 0)) {
      this.rooms.delete(room.code);
      return;
    }

    if (room.phase === 'countdown') {
      const prevSec = Math.ceil(room.countdownSecondsRemaining);
      room.countdownSecondsRemaining = Math.max(0, room.countdownSecondsRemaining - dt);
      const nextSec = Math.ceil(room.countdownSecondsRemaining);
      if (nextSec !== prevSec) {
        this.broadcastRoomState(room);
      }
      if (room.countdownSecondsRemaining <= 0) {
        this.transitionToPlaying(room);
      }
      return;
    }

    if (room.phase !== 'playing') return;

    room.matchElapsedSeconds += dt;
    room.tickCounter += 1;

    // 1. Update Collapse Sequence
    this.tickCollapse(room, dt);

    // 2. Update Helicopter Sequence
    this.tickHelicopter(room, dt);

    // 3. Update Player Movement, Physics, Survival
    for (const player of room.players.values()) {
      if (player.isDummy) {
        this.tickDummyPlayer(room, player);
      }
      this.tickPlayerMovement(room, player, dt);
      const biome = getBiomeAt(player.world.x, player.world.z);
      const isCollapsed = room.collapse.collapsedBiomes.includes(biome);
      const wasAlive = player.world.alive;
      tickPlayerSurvival(
        player.world,
        biome,
        isCollapsed,
        room.collapse.phaseIndex,
        dt,
        room.settings
      );
      if (wasAlive && !player.world.alive) {
        this.handleElimination(room, player);
      }
    }

    this.checkMatchEnd(room);

    // Broadcast compact world_tick at 20Hz; full room_state every 1s
    this.broadcast(room, {
      type: 'world_tick',
      payload: {
        matchElapsedSeconds: room.matchElapsedSeconds,
        collapse: room.collapse,
        helicopter: room.helicopter,
        worldPlayers: Array.from(room.players.values()).map((p) => p.world),
      },
    });
  }

  private tickCollapse(room: RoomInstance, dt: number) {
    const col = room.collapse;
    if (col.phaseIndex >= col.sequence.length) return;

    const speed = room.settings.collapseSpeedMultiplier;
    if (col.warningBiome) {
      col.warningSecondsRemaining = Math.max(0, col.warningSecondsRemaining - dt * speed);
      if (col.warningSecondsRemaining <= 0) {
        const collapsed = col.warningBiome;
        col.collapsedBiomes.push(collapsed);
        col.warningBiome = null;
        col.phaseIndex += 1;
        col.nextEventInSeconds = gameConfig.match.collapseIntervalSeconds;
        this.issueHerald(
          room,
          `${BIOME_DEFINITIONS[collapsed].name.toUpperCase()} COLLAPSED`,
          `The ash storm has claimed ${BIOME_DEFINITIONS[collapsed].name}. Evacuate toward Base Camp!`,
          'warning'
        );
        this.broadcastRoomState(room);
      }
    } else {
      col.nextEventInSeconds = Math.max(0, col.nextEventInSeconds - dt * speed);
      if (col.nextEventInSeconds <= 0) {
        const nextBiome = col.sequence[col.phaseIndex];
        if (nextBiome) {
          col.warningBiome = nextBiome;
          col.warningSecondsRemaining = gameConfig.match.collapseWarningSeconds;
          this.issueHerald(
            room,
            `COLLAPSE WARNING: ${BIOME_DEFINITIONS[nextBiome].name.toUpperCase()}`,
            `60 seconds until ${BIOME_DEFINITIONS[nextBiome].name} collapses. Move to safe territory.`,
            'warning'
          );
          this.broadcastRoomState(room);
        }
      }
    }
  }

  private tickHelicopter(room: RoomInstance, dt: number) {
    const heli = room.helicopter;
    if (heli.phase === 'flare_active' || heli.phase === 'approaching') {
      heli.arrivalSecondsRemaining = Math.max(0, heli.arrivalSecondsRemaining - dt);
      if (heli.arrivalSecondsRemaining <= 20 && heli.phase === 'flare_active') {
        heli.phase = 'approaching';
        this.issueHerald(
          room,
          'HELICOPTER APPROACHING',
          'Extraction craft inbound to Base Camp Helipad — 20 seconds!',
          'escape'
        );
        this.broadcastRoomState(room);
      }
      // Descend from y=26 to y=1.4 during approach
      const t = 1 - heli.arrivalSecondsRemaining / gameConfig.match.flareArrivalSeconds;
      heli.y = 26 - t * 24.6;
      if (heli.arrivalSecondsRemaining <= 0) {
        heli.phase = 'landed';
        heli.y = 0.85;
        this.issueHerald(
          room,
          'HELICOPTER LANDED',
          'Extraction craft is on the Base Camp Helipad for 30 seconds. Two seats only!',
          'escape'
        );
        this.broadcastRoomState(room);
      }
    } else if (heli.phase === 'landed') {
      heli.departureSecondsRemaining = Math.max(0, heli.departureSecondsRemaining - dt);
      if (heli.departureSecondsRemaining <= 0) {
        heli.phase = 'departed';
        heli.y = 18;
        this.broadcastRoomState(room);
        this.checkMatchEnd(room);
      }
    }
  }

  private tickDummyPlayer(room: RoomInstance, dummy: ServerPlayer) {
    if (!dummy.world.alive || dummy.world.escaped) return;
    // Gentle orbit around Base Camp perimeter so the player can find, spar, or test mechanics against Ash Dummy
    const t = room.matchElapsedSeconds;
    const targetX = Math.cos(t * 0.28) * 14;
    const targetZ = Math.sin(t * 0.28) * 14;
    const dx = targetX - dummy.world.x;
    const dz = targetZ - dummy.world.z;
    const dist = Math.hypot(dx, dz);

    const periodicBlock = Math.floor(t) % 9 >= 6;
    dummy.input = {
      moveX: dist > 1.2 ? (dx / dist) * 0.65 : 0,
      moveZ: dist > 1.2 ? (dz / dist) * 0.65 : 0,
      yaw: Math.atan2(dx, dz),
      pitch: 0,
      sprint: false,
      crouch: false,
      jump: false,
      blocking: periodicBlock,
    };
  }

  private tickPlayerMovement(room: RoomInstance, player: ServerPlayer, dt: number) {
    const w = player.world;
    if (!w.alive || w.escaped) return;

    player.attackCooldown = Math.max(0, player.attackCooldown - dt);
    player.collectTimer = Math.max(0, player.collectTimer - dt);
    player.interactTimer = Math.max(0, player.interactTimer - dt);
    player.damageFlashTimer = Math.max(0, player.damageFlashTimer - dt);

    const inp = player.input;
    w.yaw = inp.yaw;
    w.pitch = inp.pitch;
    w.crouching = inp.crouch;
    w.blocking = inp.blocking && !inp.sprint;

    const len = Math.hypot(inp.moveX, inp.moveZ);
    const nx = len > 1 ? inp.moveX / len : inp.moveX;
    const nz = len > 1 ? inp.moveZ / len : inp.moveZ;

    const canSprint = inp.sprint && !inp.crouch && !w.blocking && w.stats.stamina > 2 && len > 0.1;
    if (canSprint) {
      w.stats.stamina = Math.max(0, w.stats.stamina - gameConfig.survival.staminaDrainSprintPerSecond * dt);
    } else {
      const regenMult = w.hearthId === 'salt' ? 1.25 : 1.0;
      w.stats.stamina = Math.min(
        gameConfig.survival.maxStamina,
        w.stats.stamina + gameConfig.survival.staminaRegenPerSecond * regenMult * dt
      );
    }

    const biome = getBiomeAt(w.x, w.z);
    const marshSlow = biome === BiomeId.MARSH && getGroundHeightAt(w.x, w.z, room.seed) < -0.15 ? 0.76 : 1.0;

    let speed = gameConfig.movement.walkSpeed;
    if (w.crouching) speed = gameConfig.movement.crouchSpeed;
    else if (canSprint) speed = gameConfig.movement.sprintSpeed;
    else if (w.blocking) speed = gameConfig.movement.crouchSpeed;
    speed *= marshSlow;

    w.vx = nx * speed;
    w.vz = nz * speed;

    const nextX = w.x + w.vx * dt;
    const nextZ = w.z + w.vz * dt;
    const resolved = resolveObstacleCollision(nextX, nextZ, gameConfig.movement.playerRadius, room.layout.obstacles);
    w.x = resolved.x;
    w.z = resolved.z;

    const groundY = getGroundHeightAt(w.x, w.z, room.seed);
    if (inp.jump && player.grounded && w.stats.stamina >= gameConfig.survival.staminaDrainJump) {
      player.vy = gameConfig.movement.jumpVelocity;
      player.grounded = false;
      w.stats.stamina = Math.max(0, w.stats.stamina - gameConfig.survival.staminaDrainJump);
    }

    const wasAir = !player.grounded;
    player.vy -= gameConfig.movement.gravity * dt;
    w.y += player.vy * dt;
    if (w.y <= groundY) {
      w.y = groundY;
      player.vy = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    // Determine authoritative animation state
    const horizSpeed = Math.hypot(w.vx, w.vz);
    if (player.damageFlashTimer > 0) w.animState = 'damage';
    else if (player.attackCooldown > 0.25) w.animState = 'attacking';
    else if (player.collectTimer > 0) w.animState = 'collecting';
    else if (player.interactTimer > 0) w.animState = 'interacting';
    else if (!player.grounded && player.vy > 0.5) w.animState = 'jumping';
    else if (!player.grounded && player.vy <= 0.5) w.animState = 'falling';
    else if (wasAir && player.grounded) w.animState = 'landing';
    else if (w.blocking) w.animState = 'blocking';
    else if (w.crouching && horizSpeed < 0.2) w.animState = 'crouching';
    else if (canSprint && horizSpeed > 5.8) w.animState = 'sprinting';
    else if (horizSpeed > 3.8) w.animState = 'running';
    else if (horizSpeed > 0.3) w.animState = 'walking';
    else w.animState = 'idle';
  }

  private issueHerald(room: RoomInstance, title: string, message: string, tone: HeraldAnnouncement['tone']) {
    const herald: HeraldAnnouncement = {
      id: crypto.randomUUID(),
      title,
      message,
      tone,
      timestamp: Date.now(),
    };
    room.herald = herald;
    this.broadcast(room, { type: 'herald', payload: herald });
  }

  private buildSnapshot(room: RoomInstance): RoomStateSnapshot {
    const lobbyPlayers: LobbyPlayer[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      hearthId: p.hearthId,
      appearance: p.appearance,
      ready: p.ready,
      isHost: p.id === room.hostId,
      connected: p.connected,
      ceremonyDaggerDrawn: p.ceremonyDaggerDrawn,
      isDummy: Boolean(p.isDummy),
    }));

    return {
      roomCode: room.code,
      isDummyMatch: room.isDummyMatch,
      phase: room.phase,
      seed: room.seed,
      hostId: room.hostId,
      settings: room.settings,
      countdownSecondsRemaining: room.countdownSecondsRemaining,
      matchElapsedSeconds: room.matchElapsedSeconds,
      lobbyPlayers,
      worldPlayers: Array.from(room.players.values()).map((p) => p.world),
      lootNodes: room.lootNodes,
      collapse: room.collapse,
      helicopter: room.helicopter,
      herald: room.herald,
      results: room.results,
    };
  }

  private broadcastRoomState(room: RoomInstance) {
    this.broadcast(room, {
      type: 'room_state',
      payload: this.buildSnapshot(room),
    });
  }

  private broadcast(room: RoomInstance, msg: ServerToClientMessage) {
    const raw = JSON.stringify(msg);
    for (const player of room.players.values()) {
      if (player.ws && player.connected && player.ws.readyState === 1) {
        player.ws.send(raw);
      }
    }
  }

  private send(ws: WebSocket | null, msg: ServerToClientMessage) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendError(ws: WebSocket | null, code: string, message: string) {
    this.send(ws, { type: 'error', payload: { code, message } });
  }

  private sanitizeName(raw?: string): string {
    const clean = (raw || '').replace(/[^\w\s-]/g, '').trim().slice(0, 18);
    return clean || `Wanderer_${Math.floor(100 + Math.random() * 899)}`;
  }

  public dispose() {
    if (this.tickTimer) clearInterval(this.tickTimer);
  }
}
