import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gameConfig from '../../config/gameConfig.json' with { type: 'json' };
import {
  BIOME_DEFINITIONS,
  BiomeId,
  DEFAULT_APPEARANCE,
  type CollapseState,
  type HelicopterState,
  type LobbyPlayer,
  type LootNode,
  type MatchPhase,
  type PaperAppearance,
  type WorldPlayerState,
} from '../../shared/types.ts';
import { getBiomeAt, getGroundHeightAt, resolveObstacleCollision, generateArenaLayout } from '../../shared/worldGen.ts';
import { createProceduralTextures, type ProceduralTextureSet } from './textures.ts';
import { createPaperCharacter, type PaperCharacterRig } from './paperCharacter.ts';
import { buildArenaScene, type ArenaSceneObjects } from './arenaBuilder.ts';
import { soundEngine } from '../audio/soundEngine.ts';
import { wsClient } from '../network/wsClient.ts';
import { voiceManager } from '../network/webrtcVoice.ts';

export type QualityLevel = 'low' | 'medium' | 'high';

export interface KeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  sprint: string;
  jump: string;
  crouch: string;
  interact: string;
  inventory: string;
  map: string;
  block: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  forward: 'KeyW',
  backward: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'KeyC',
  interact: 'KeyE',
  inventory: 'Tab',
  map: 'KeyM',
  block: 'KeyQ',
};

export interface EngineExternalCallbacks {
  onBiomeChange?: (biome: BiomeId) => void;
  onNearPromptChange?: (prompt: string | null) => void;
  onModalShortcut?: (which: 'inventory' | 'map' | 'pause') => void;
}

interface RemoteInterp {
  rig: PaperCharacterRig;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  horizSpeed: number;
  animState: WorldPlayerState['animState'];
  alive: boolean;
  equippedWeaponId: string;
  lastHealth: number;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _fogColorTarget = new THREE.Color();

export class AshenGameEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: ProceduralTextureSet;
  private arena: ArenaSceneObjects | null = null;
  private currentSeed = 0;
  private isSoftwareGl: boolean;
  private quality: QualityLevel = 'medium';
  private resolutionScale = 1.0;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  private remoteRigs = new Map<string, RemoteInterp>();
  private ceremonyRigs = new Map<string, PaperCharacterRig>();
  private localRig: PaperCharacterRig | null = null;

  private frameId = 0;
  private destroyed = false;
  private lastTime = performance.now();
  private lastInputSend = 0;
  private footstepTimer = 0;
  private heliAudioTimer = 0;

  // Match & camera state
  private phase: MatchPhase = 'title' as unknown as MatchPhase;
  private appScreen: 'title' | 'lobby' | 'countdown' | 'playing' | 'spectating' | 'ended' = 'title';
  private localPlayerId: string | null = null;
  private spectateTargetId: string | null = null;
  private worldPlayers: WorldPlayerState[] = [];
  private lobbyPlayers: LobbyPlayer[] = [];
  private lootNodes: LootNode[] = [];
  private collapse: CollapseState = {
    phaseIndex: 0,
    sequence: [],
    warningBiome: null,
    warningSecondsRemaining: 0,
    collapsedBiomes: [],
    nextEventInSeconds: 55,
  };
  private helicopter: HelicopterState = {
    phase: 'idle',
    activatedBy: null,
    arrivalSecondsRemaining: 0,
    departureSecondsRemaining: 0,
    seatsOccupiedBy: [],
    x: 0,
    y: 26,
    z: -13,
  };

  // Local prediction state
  private predX = 0;
  private predY = 0.15;
  private predZ = 28;
  private predVy = 0;
  private predGrounded = true;
  private cameraYaw = 0;
  private cameraPitch = 0.34;
  private targetZoom = gameConfig.camera.defaultZoom;
  private currentZoom = gameConfig.camera.defaultZoom;
  private sensitivity = gameConfig.camera.defaultSensitivity;
  private impactTrauma = 0;
  private currentBiome: BiomeId = BiomeId.BASE_CAMP;
  private lastPrompt: string | null = null;

  // Input state
  private keys = new Set<string>();
  private keyBindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };
  private mobileJoyX = 0;
  private mobileJoyY = 0;
  private mobileSprint = false;
  private mobileCrouch = false;
  private mobileBlock = false;
  private jumpQueued = false;
  private mouseDragging = false;
  private dragMovedPx = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activeDragPointerId: number | null = null;

  private raycaster = new THREE.Raycaster();
  private callbacks: EngineExternalCallbacks = {};
  private resizeObserver: ResizeObserver;

  constructor(private container: HTMLElement, callbacks: EngineExternalCallbacks) {
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyResolution();

    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#27231e');
    this.scene.fog = new THREE.FogExp2('#27231e', 0.011);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.25, 320);
    this.camera.position.set(0, 18, 42);

    // 3-point warm/cool studio outdoor rig
    this.hemiLight = new THREE.HemisphereLight(0xa7bed3, 0x3b3024, 0.72);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffdfb8, 1.55);
    this.keyLight.position.set(48, 72, 36);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -55;
    this.keyLight.shadow.camera.right = 55;
    this.keyLight.shadow.camera.top = 55;
    this.keyLight.shadow.camera.bottom = -55;
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 175;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x88a9c4, 0.48);
    this.rimLight.position.set(-45, 35, -45);
    this.scene.add(this.rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Load default diorama seed for live Title Screen world tour
    this.loadSeedArena(104729);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    this.bindEvents();
    this.tick();
  }

  private applyResolution() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const baseRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2);
    const qFactor = this.quality === 'low' ? 0.7 : this.quality === 'medium' ? 0.9 : 1.0;
    this.renderer.setPixelRatio(Math.max(0.5, baseRatio * qFactor * this.resolutionScale));
    this.renderer.setSize(w, h, false);
  }

  private handleResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (w <= 0 || h <= 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyResolution();
  }

  public setQuality(q: QualityLevel, resScale = 1.0) {
    this.quality = q;
    this.resolutionScale = resScale;
    this.applyResolution();
    if (this.currentSeed) {
      this.loadSeedArena(this.currentSeed, true);
    }
  }

  public setSensitivity(s: number) {
    this.sensitivity = Math.max(0.3, Math.min(2.5, s));
  }

  public setKeyBindings(kb: KeyBindings) {
    this.keyBindings = { ...kb };
  }

  public zoomIn() {
    this.targetZoom = Math.max(gameConfig.camera.minZoom, this.targetZoom - 1.4);
  }

  public zoomOut() {
    this.targetZoom = Math.min(gameConfig.camera.maxZoom, this.targetZoom + 1.4);
  }

  public setMobileJoystick(x: number, y: number) {
    this.mobileJoyX = x;
    this.mobileJoyY = y;
  }

  public setMobileActions(actions: { sprint?: boolean; crouch?: boolean; block?: boolean }) {
    if (actions.sprint !== undefined) this.mobileSprint = actions.sprint;
    if (actions.crouch !== undefined) this.mobileCrouch = actions.crouch;
    if (actions.block !== undefined) this.mobileBlock = actions.block;
  }

  public triggerMobileJump() {
    this.jumpQueued = true;
  }

  public triggerMobileCameraDelta(dx: number, dy: number) {
    this.cameraYaw -= dx * 0.0065 * this.sensitivity;
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.005 * this.sensitivity, 0.05, 1.18);
  }

  public triggerAttack() {
    if (this.appScreen !== 'playing') return;
    const me = this.worldPlayers.find((p) => p.id === this.localPlayerId);
    if (!me || !me.alive || me.escaped) return;
    soundEngine.playWeaponAttack(me.equippedWeaponId);
    wsClient.send({ type: 'attack', payload: { yaw: this.cameraYaw } });
  }

  public triggerInteract() {
    if (this.appScreen !== 'playing') return;
    wsClient.send({ type: 'interact' });
  }

  public setSpectateTarget(playerId: string | null) {
    this.spectateTargetId = playerId;
  }

  public loadSeedArena(seed: number, force = false) {
    if (this.currentSeed === seed && !force) return;
    this.currentSeed = seed;
    if (this.arena) {
      this.scene.remove(this.arena.worldGroup);
      this.arena.dispose();
    }
    this.arena = buildArenaScene(seed, this.textures, this.isSoftwareGl, this.quality);
    this.scene.add(this.arena.worldGroup);
  }

  public syncState(params: {
    appScreen: AshenGameEngine['appScreen'];
    seed: number;
    localPlayerId: string | null;
    lobbyPlayers: LobbyPlayer[];
    worldPlayers: WorldPlayerState[];
    lootNodes: LootNode[];
    collapse: CollapseState;
    helicopter: HelicopterState;
    previewAppearance?: PaperAppearance;
    previewHearthId?: string;
  }) {
    const prevScreen = this.appScreen;
    this.appScreen = params.appScreen;
    this.localPlayerId = params.localPlayerId;
    this.lobbyPlayers = params.lobbyPlayers;
    this.worldPlayers = params.worldPlayers;
    this.lootNodes = params.lootNodes;
    this.collapse = params.collapse;
    this.helicopter = params.helicopter;

    if (params.seed && params.seed !== this.currentSeed) {
      this.loadSeedArena(params.seed);
    }

    this.arena?.syncLoot(params.lootNodes);

    // Transition into playing: initialize predicted position from server spawn
    if (this.appScreen === 'playing' && prevScreen !== 'playing') {
      const me = this.worldPlayers.find((p) => p.id === this.localPlayerId);
      if (me) {
        this.predX = me.x;
        this.predY = me.y;
        this.predZ = me.z;
        this.cameraYaw = me.yaw;
      }
      this.keys.clear();
    }

    // Manage ceremony pedestal rigs during countdown
    if (this.appScreen === 'countdown') {
      const activeIds = new Set(params.lobbyPlayers.map((lp) => lp.id));
      for (const [id, rig] of this.ceremonyRigs.entries()) {
        if (!activeIds.has(id)) {
          this.scene.remove(rig.root);
          rig.dispose();
          this.ceremonyRigs.delete(id);
        }
      }
      params.lobbyPlayers.forEach((lp, idx) => {
        let rig = this.ceremonyRigs.get(lp.id);
        if (!rig) {
          rig = createPaperCharacter(lp.appearance, lp.hearthId, this.textures, true, lp.name);
          this.scene.add(rig.root);
          this.ceremonyRigs.set(lp.id, rig);
        }
        const angle = (idx / Math.max(2, params.lobbyPlayers.length)) * Math.PI * 2;
        const r = 4.6;
        const px = Math.cos(angle) * r;
        const pz = Math.sin(angle) * r;
        rig.root.position.set(px, getGroundHeightAt(px, pz, this.currentSeed), pz);
        rig.root.rotation.y = Math.atan2(-px, -pz);
      });
    } else if (this.ceremonyRigs.size > 0) {
      for (const rig of this.ceremonyRigs.values()) {
        this.scene.remove(rig.root);
        rig.dispose();
      }
      this.ceremonyRigs.clear();
    }

    // Manage world player rigs
    if (this.appScreen === 'playing' || this.appScreen === 'spectating' || this.appScreen === 'ended') {
      const seen = new Set<string>();
      const me = this.worldPlayers.find((p) => p.id === this.localPlayerId);

      for (const wp of this.worldPlayers) {
        seen.add(wp.id);
        if (wp.id === this.localPlayerId) {
          if (!this.localRig) {
            this.localRig = createPaperCharacter(wp.appearance, wp.hearthId, this.textures, false);
            this.scene.add(this.localRig.root);
          }
          this.localRig.setEquippedWeapon(wp.equippedWeaponId);
          this.localRig.root.visible = !wp.escaped;
          continue;
        }

        let entry = this.remoteRigs.get(wp.id);
        if (!entry) {
          const isAlly = Boolean(me && wp.alliances.includes(me.id));
          const rig = createPaperCharacter(wp.appearance, wp.hearthId, this.textures, true, wp.name);
          rig.setNameLabel(wp.name, isAlly);
          rig.root.position.set(wp.x, wp.y, wp.z);
          this.scene.add(rig.root);
          entry = {
            rig,
            targetX: wp.x,
            targetY: wp.y,
            targetZ: wp.z,
            targetYaw: wp.yaw,
            horizSpeed: 0,
            animState: wp.animState,
            alive: wp.alive,
            equippedWeaponId: wp.equippedWeaponId,
            lastHealth: wp.stats.health,
          };
          this.remoteRigs.set(wp.id, entry);
        } else {
          if (wp.stats.health < entry.lastHealth) {
            entry.rig.triggerFlash();
          }
          entry.lastHealth = wp.stats.health;
          entry.targetX = wp.x;
          entry.targetY = wp.y;
          entry.targetZ = wp.z;
          entry.targetYaw = wp.yaw;
          entry.horizSpeed = Math.hypot(wp.vx, wp.vz);
          entry.animState = wp.animState;
          entry.alive = wp.alive;
          entry.equippedWeaponId = wp.equippedWeaponId;
          entry.rig.setEquippedWeapon(wp.equippedWeaponId);
          entry.rig.root.visible = !wp.escaped;
          const isAlly = Boolean(me && wp.alliances.includes(me.id));
          if (entry.rig.nameSprite) {
            entry.rig.nameSprite.visible = wp.alive && (!me || Math.hypot(wp.x - me.x, wp.z - me.z) < 28 || isAlly);
          }
        }
      }

      for (const [id, entry] of this.remoteRigs.entries()) {
        if (!seen.has(id)) {
          this.scene.remove(entry.rig.root);
          entry.rig.dispose();
          this.remoteRigs.delete(id);
        }
      }
    }
  }

  public notifyCombatEvent(evt: { x: number; y: number; z: number; damage: number; blocked: boolean; targetId: string | null }) {
    if (evt.damage > 0) {
      soundEngine.playHit(evt.blocked);
      this.arena?.spawnBurst(evt.x, evt.y, evt.z, evt.blocked ? 0xd4a853 : 0xd94838, evt.blocked ? 8 : 16);
      if (evt.targetId === this.localPlayerId) {
        this.localRig?.triggerFlash();
        this.impactTrauma = Math.min(0.45, this.impactTrauma + 0.25);
      }
    }
  }

  private bindEvents() {
    const dom = this.renderer.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === this.keyBindings.inventory && this.appScreen === 'playing') {
        e.preventDefault();
        this.callbacks.onModalShortcut?.('inventory');
        return;
      }
      if (e.code === this.keyBindings.map && this.appScreen === 'playing') {
        e.preventDefault();
        this.callbacks.onModalShortcut?.('map');
        return;
      }
      if (e.code === 'Escape' && (this.appScreen === 'playing' || this.appScreen === 'spectating')) {
        e.preventDefault();
        this.callbacks.onModalShortcut?.('pause');
        return;
      }
      if (e.code === this.keyBindings.interact && !e.repeat && this.appScreen === 'playing') {
        this.triggerInteract();
      }
      if (e.code === 'KeyF' && !e.repeat && this.appScreen === 'playing') {
        this.triggerInteract();
      }
      if (e.code === this.keyBindings.jump && !e.repeat && this.appScreen === 'playing') {
        this.jumpQueued = true;
      }
      this.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };

    const onBlur = () => {
      this.keys.clear();
      this.mouseDragging = false;
      this.activeDragPointerId = null;
    };

    const onWheel = (e: WheelEvent) => {
      if (this.appScreen !== 'playing' && this.appScreen !== 'spectating') return;
      e.preventDefault();
      this.targetZoom = THREE.MathUtils.clamp(
        this.targetZoom + e.deltaY * 0.0055,
        gameConfig.camera.minZoom,
        gameConfig.camera.maxZoom
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      soundEngine.unlock();
      if (this.appScreen !== 'playing' && this.appScreen !== 'spectating') return;
      if (e.button === 2) {
        this.keys.add(this.keyBindings.block);
        return;
      }
      this.mouseDragging = true;
      this.activeDragPointerId = e.pointerId;
      this.dragMovedPx = 0;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.mouseDragging || e.pointerId !== this.activeDragPointerId) return;
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.dragMovedPx += Math.hypot(dx, dy);

      this.cameraYaw -= dx * 0.0055 * this.sensitivity;
      this.cameraPitch = THREE.MathUtils.clamp(
        this.cameraPitch + dy * 0.0042 * this.sensitivity,
        0.05,
        1.18
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 2) {
        this.keys.delete(this.keyBindings.block);
        return;
      }
      if (e.pointerId === this.activeDragPointerId) {
        const wasTap = this.dragMovedPx < 6;
        this.mouseDragging = false;
        this.activeDragPointerId = null;
        if (wasTap && this.appScreen === 'playing') {
          this.triggerAttack();
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('contextmenu', onContextMenu);

    this.unbindEvents = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }

  private unbindEvents = () => {};

  private tick = () => {
    if (this.destroyed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const elapsed = now * 0.001;

    this.updateSimulation(dt, elapsed, now);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateSimulation(dt: number, elapsed: number, now: number) {
    // 1. Title & Lobby atmospheric flyover camera tour
    if (this.appScreen === 'title' || this.appScreen === 'lobby') {
      const tourAngle = elapsed * 0.14;
      const camR = 34;
      this.camera.position.set(Math.cos(tourAngle) * camR, 14 + Math.sin(elapsed * 0.35) * 2.5, Math.sin(tourAngle) * camR);
      this.camera.lookAt(0, 2.2, 0);
      this.arena?.update(dt, elapsed, this.collapse, this.helicopter, BiomeId.BASE_CAMP);
      return;
    }

    // 2. Ceremonial Pedestal Countdown camera
    if (this.appScreen === 'countdown') {
      const orbit = elapsed * 0.25;
      this.camera.position.set(Math.cos(orbit) * 11.5, 5.2, Math.sin(orbit) * 11.5);
      this.camera.lookAt(0, 1.4, 0);
      for (const lp of this.lobbyPlayers) {
        const rig = this.ceremonyRigs.get(lp.id);
        rig?.updateAnimation(dt, 'idle', 0, lp.ceremonyDaggerDrawn);
      }
      this.arena?.update(dt, elapsed, this.collapse, this.helicopter, BiomeId.BASE_CAMP);
      return;
    }

    // 3. Active Gameplay & Spectating
    const me = this.worldPlayers.find((p) => p.id === this.localPlayerId);

    // Local prediction & server input sync
    if (this.appScreen === 'playing' && me && me.alive && !me.escaped) {
      let rawForward = 0;
      let rawRight = 0;
      if (this.keys.has(this.keyBindings.forward) || this.keys.has('ArrowUp')) rawForward += 1;
      if (this.keys.has(this.keyBindings.backward) || this.keys.has('ArrowDown')) rawForward -= 1;
      if (this.keys.has(this.keyBindings.right) || this.keys.has('ArrowRight')) rawRight += 1;
      if (this.keys.has(this.keyBindings.left) || this.keys.has('ArrowLeft')) rawRight -= 1;

      rawRight += this.mobileJoyX;
      rawForward -= this.mobileJoyY; // screen up (-Y) is forward (+1)

      const mag = Math.hypot(rawForward, rawRight);
      const nf = mag > 1 ? rawForward / mag : rawForward;
      const nr = mag > 1 ? rawRight / mag : rawRight;

      // Convert camera-relative input into world X/Z
      const forwardX = -Math.sin(this.cameraYaw);
      const forwardZ = -Math.cos(this.cameraYaw);
      const rightX = Math.cos(this.cameraYaw);
      const rightZ = -Math.sin(this.cameraYaw);

      const worldMoveX = forwardX * nf + rightX * nr;
      const worldMoveZ = forwardZ * nf + rightZ * nr;

      const sprint = this.keys.has(this.keyBindings.sprint) || this.keys.has('ShiftRight') || this.mobileSprint;
      const crouch = this.keys.has(this.keyBindings.crouch) || this.mobileCrouch;
      const blocking = this.keys.has(this.keyBindings.block) || this.mobileBlock;

      const canSprint = sprint && !crouch && !blocking && me.stats.stamina > 2 && mag > 0.1;
      let speed = gameConfig.movement.walkSpeed;
      if (crouch) speed = gameConfig.movement.crouchSpeed;
      else if (canSprint) speed = gameConfig.movement.sprintSpeed;
      else if (blocking) speed = gameConfig.movement.crouchSpeed;

      const layout = generateArenaLayout(this.currentSeed);
      const nextPos = resolveObstacleCollision(
        this.predX + worldMoveX * speed * dt,
        this.predZ + worldMoveZ * speed * dt,
        gameConfig.movement.playerRadius,
        layout.obstacles
      );
      this.predX = nextPos.x;
      this.predZ = nextPos.z;

      // Gentle authoritative reconciliation
      this.predX = THREE.MathUtils.lerp(this.predX, me.x, 1 - Math.exp(-8 * dt));
      this.predZ = THREE.MathUtils.lerp(this.predZ, me.z, 1 - Math.exp(-8 * dt));

      const gY = getGroundHeightAt(this.predX, this.predZ, this.currentSeed);
      if (this.jumpQueued && this.predGrounded && me.stats.stamina >= gameConfig.survival.staminaDrainJump) {
        this.predVy = gameConfig.movement.jumpVelocity;
        this.predGrounded = false;
      }
      this.predVy -= gameConfig.movement.gravity * dt;
      this.predY += this.predVy * dt;
      if (this.predY <= gY) {
        this.predY = gY;
        this.predVy = 0;
        this.predGrounded = true;
      }
      this.predY = THREE.MathUtils.lerp(this.predY, me.y, 1 - Math.exp(-10 * dt));

      // Send 20Hz input packet
      if (now - this.lastInputSend >= 50) {
        this.lastInputSend = now;
        const moveAngle = Math.hypot(worldMoveX, worldMoveZ) > 0.08 ? Math.atan2(worldMoveX, worldMoveZ) : this.cameraYaw + Math.PI;
        wsClient.send({
          type: 'player_input',
          payload: {
            moveX: worldMoveX,
            moveZ: worldMoveZ,
            yaw: moveAngle,
            pitch: this.cameraPitch,
            sprint: canSprint,
            crouch,
            jump: this.jumpQueued,
            blocking,
          },
        });
        this.jumpQueued = false;
      }

      if (this.localRig) {
        this.localRig.root.position.set(this.predX, this.predY, this.predZ);
        if (Math.hypot(worldMoveX, worldMoveZ) > 0.08) {
          const targetRot = Math.atan2(worldMoveX, worldMoveZ);
          let diff = targetRot - this.localRig.root.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.localRig.root.rotation.y += diff * (1 - Math.exp(-12 * dt));
        } else {
          this.localRig.root.rotation.y = THREE.MathUtils.lerp(this.localRig.root.rotation.y, me.yaw, 1 - Math.exp(-10 * dt));
        }

        const horizSpeed = Math.hypot(worldMoveX, worldMoveZ) * speed;
        this.localRig.updateAnimation(dt, me.animState, horizSpeed);

        if (horizSpeed > 0.5 && this.predGrounded) {
          this.footstepTimer -= dt * (canSprint ? 1.55 : 1.0);
          if (this.footstepTimer <= 0) {
            this.footstepTimer = 0.42;
            soundEngine.playFootstep(canSprint);
          }
        }
      }

      // Context interaction prompt detection
      let nextPrompt: string | null = null;
      const dHeli = Math.hypot(
        this.predX - gameConfig.world.helipadPos.x,
        this.predZ - gameConfig.world.helipadPos.z
      );
      if (dHeli <= 5.5) {
        if (this.helicopter.phase === 'landed') {
          nextPrompt = '[E] Board Extraction Helicopter';
        } else if (this.helicopter.phase === 'idle') {
          nextPrompt = '[E] Ignite Extraction Flare Beacon';
        }
      }
      if (!nextPrompt) {
        for (const node of this.lootNodes) {
          if (!node.opened && node.items.length > 0 && Math.hypot(this.predX - node.x, this.predZ - node.z) <= 3.4) {
            nextPrompt = node.kind === 'container' ? '[E] Search Supply Chest' : '[E] Collect Satchel Loot';
            break;
          }
        }
      }
      if (nextPrompt !== this.lastPrompt) {
        this.lastPrompt = nextPrompt;
        this.callbacks.onNearPromptChange?.(nextPrompt);
      }

      // Proximity voice attenuation
      voiceManager.updateProximities(
        { x: this.predX, z: this.predZ },
        this.worldPlayers.filter((p) => p.id !== this.localPlayerId)
      );
    }

    // Update remote player interpolation
    for (const entry of this.remoteRigs.values()) {
      const k = 1 - Math.exp(-12 * dt);
      entry.rig.root.position.x = THREE.MathUtils.lerp(entry.rig.root.position.x, entry.targetX, k);
      entry.rig.root.position.y = THREE.MathUtils.lerp(entry.rig.root.position.y, entry.targetY, k);
      entry.rig.root.position.z = THREE.MathUtils.lerp(entry.rig.root.position.z, entry.targetZ, k);
      let dy = entry.targetYaw - entry.rig.root.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      entry.rig.root.rotation.y += dy * k;
      entry.rig.updateAnimation(dt, entry.animState, entry.horizSpeed);
    }

    // Choose camera anchor (local player or spectated survivor)
    let targetActorPos = _vecA.set(this.predX, this.predY, this.predZ);
    if (this.appScreen === 'spectating' || (me && (!me.alive || me.escaped))) {
      const aliveTarget =
        this.worldPlayers.find((p) => p.id === this.spectateTargetId && p.alive) ||
        this.worldPlayers.find((p) => p.alive && !p.escaped);
      if (aliveTarget) {
        targetActorPos.set(aliveTarget.x, aliveTarget.y, aliveTarget.z);
      }
    }

    // Biome fog & ambience shift
    const focusBiome = getBiomeAt(targetActorPos.x, targetActorPos.z);
    if (focusBiome !== this.currentBiome) {
      this.currentBiome = focusBiome;
      this.callbacks.onBiomeChange?.(focusBiome);
      soundEngine.setBiomeAmbience(focusBiome);
    }

    _fogColorTarget.set(BIOME_DEFINITIONS[focusBiome].fogColor);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(_fogColorTarget, 1 - Math.exp(-2 * dt));
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(_fogColorTarget, 1 - Math.exp(-2 * dt));
    }

    // Smooth camera zoom & collision-aware wall/terrain pull-in (NO walking shake!)
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 1 - Math.exp(-10 * dt));

    const anchorY = targetActorPos.y + 1.45;
    _vecB.set(targetActorPos.x, anchorY, targetActorPos.z);

    const horizDist = Math.cos(this.cameraPitch) * this.currentZoom;
    const vertOffset = Math.sin(this.cameraPitch) * this.currentZoom;
    const desiredCamX = targetActorPos.x + Math.sin(this.cameraYaw) * horizDist;
    const desiredCamY = anchorY + vertOffset;
    const desiredCamZ = targetActorPos.z + Math.cos(this.cameraYaw) * horizDist;

    let finalDist = this.currentZoom;
    if (this.arena && this.arena.collidableMeshes.length > 0) {
      _rayDir.set(desiredCamX - _vecB.x, desiredCamY - _vecB.y, desiredCamZ - _vecB.z).normalize();
      this.raycaster.set(_vecB, _rayDir);
      this.raycaster.far = this.currentZoom;
      const hits = this.raycaster.intersectObjects(this.arena.collidableMeshes, false);
      if (hits.length > 0 && hits[0].distance < finalDist) {
        finalDist = Math.max(1.8, hits[0].distance - 0.35);
      }
    }

    const ratio = finalDist / (this.currentZoom || 1);
    const camX = _vecB.x + (desiredCamX - _vecB.x) * ratio;
    const camZ = _vecB.z + (desiredCamZ - _vecB.z) * ratio;
    const terrainAtCam = getGroundHeightAt(camX, camZ, this.currentSeed);
    const camY = Math.max(terrainAtCam + 0.65, _vecB.y + (desiredCamY - _vecB.y) * ratio);

    this.camera.position.lerp(_rayDir.set(camX, camY, camZ), 1 - Math.exp(-16 * dt));

    // Only apply brief trauma decay on combat hit (zero walking shake)
    if (this.impactTrauma > 0) {
      this.impactTrauma = Math.max(0, this.impactTrauma - dt * 1.8);
      const shake = this.impactTrauma * this.impactTrauma * 0.3;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }

    this.camera.lookAt(_vecB);

    // Move shadow light with player for crisp shadows anywhere on the arena
    this.keyLight.position.set(targetActorPos.x + 38, 65, targetActorPos.z + 28);
    this.keyLight.target.position.copy(targetActorPos);
    this.keyLight.target.updateMatrixWorld();

    // Helicopter rotor sound pulse
    if (this.helicopter.phase === 'approaching' || this.helicopter.phase === 'landed') {
      this.heliAudioTimer -= dt;
      if (this.heliAudioTimer <= 0) {
        this.heliAudioTimer = 0.14;
        soundEngine.playHelicopterPulse();
      }
    }

    this.arena?.update(dt, elapsed, this.collapse, this.helicopter, focusBiome);
  }

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.localRig?.dispose();
    for (const e of this.remoteRigs.values()) e.rig.dispose();
    for (const r of this.ceremonyRigs.values()) r.dispose();
    this.arena?.dispose();
    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
