import React, { useEffect, useRef, useState } from 'react';
import {
  BiomeId,
  DEFAULT_APPEARANCE,
  type EmoteMessage,
  type HeraldAnnouncement,
  type MatchSettings,
  type PaperAppearance,
  type RoomStateSnapshot,
  type WorldPlayerState,
} from './shared/types.ts';
import { AshenGameEngine, type QualityLevel } from './client/world/GameEngine.ts';
import { wsClient } from './client/network/wsClient.ts';
import { soundEngine, type AudioVolumes } from './client/audio/soundEngine.ts';
import { voiceManager } from './client/network/webrtcVoice.ts';
import { TitleScreen } from './client/ui/TitleScreen.tsx';
import { LobbyScreen } from './client/ui/LobbyScreen.tsx';
import { GameplayHUD } from './client/ui/GameplayHUD.tsx';
import { MobileControls } from './client/ui/MobileControls.tsx';
import { InteractiveMapModal } from './client/ui/InteractiveMapModal.tsx';
import { InventoryModal } from './client/ui/InventoryModal.tsx';
import { SocialAndVoicePanel } from './client/ui/SocialAndVoicePanel.tsx';
import { SettingsModal } from './client/ui/SettingsModal.tsx';

type UiScreen = 'title' | 'hub' | 'room' | 'countdown' | 'playing' | 'spectating' | 'ended';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AshenGameEngine | null>(null);

  const [uiScreen, setUiScreen] = useState<UiScreen>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') === '1' || params.get('room') ? 'hub' : 'title';
  });
  const [hubIntent, setHubIntent] = useState<'create' | 'join'>('create');

  const [playerName, setPlayerName] = useState(() => {
    try {
      return localStorage.getItem('ashen_crown_name') || `Wanderer_${Math.floor(100 + Math.random() * 899)}`;
    } catch {
      return 'Wanderer';
    }
  });
  const [hearthId, setHearthId] = useState('ash');
  const [appearance, setAppearance] = useState<PaperAppearance>(DEFAULT_APPEARANCE);

  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomStateSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentBiome, setCurrentBiome] = useState<BiomeId>(BiomeId.BASE_CAMP);
  const [nearPrompt, setNearPrompt] = useState<string | null>(null);
  const [heraldActive, setHeraldActive] = useState<HeraldAnnouncement | null>(null);
  const [recentEmotes, setRecentEmotes] = useState<EmoteMessage[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Array<{ fromId: string; fromName: string }>>([]);
  const [spectateTargetId, setSpectateTargetId] = useState<string | null>(null);

  // Modals & settings
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [settingsModal, setSettingsModal] = useState<{ open: boolean; tab: 'settings' | 'about' }>({
    open: false,
    tab: 'settings',
  });

  const [muted, setMuted] = useState(false);
  const [volumes, setVolumesState] = useState<AudioVolumes>(() => soundEngine.getVolumes());
  const [quality, setQualityState] = useState<QualityLevel>('medium');
  const [resScale, setResScaleState] = useState(1.0);
  const [sensitivity, setSensitivityState] = useState(1.0);
  const [touchMode, setTouchMode] = useState<'auto' | 'always' | 'off'>('auto');
  const [isTouchViewport, setIsTouchViewport] = useState(false);

  const roomStateRef = useRef<RoomStateSnapshot | null>(null);
  const localPlayerIdRef = useRef<string | null>(null);
  const uiScreenRef = useRef<UiScreen>(uiScreen);
  const lastHudSyncRef = useRef<number>(0);
  const modalOpenRef = useRef({
    inventory: false,
    map: false,
    social: false,
    settings: false,
  });

  useEffect(() => {
    modalOpenRef.current = {
      inventory: inventoryOpen,
      map: mapOpen,
      social: socialOpen,
      settings: settingsModal.open,
    };
  }, [inventoryOpen, mapOpen, socialOpen, settingsModal.open]);

  useEffect(() => {
    uiScreenRef.current = uiScreen;
    const bodyState =
      uiScreen === 'ended'
        ? 'gameover'
        : uiScreen === 'hub' || uiScreen === 'room'
          ? 'lobby'
          : uiScreen;
    document.body.dataset.state = bodyState;
  }, [uiScreen]);

  useEffect(() => {
    try {
      localStorage.setItem('ashen_crown_name', playerName);
    } catch {
      // ignore
    }
  }, [playerName]);

  // Detect touch capability / viewport width without EVER hiding controls on fullscreen
  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const touchPts = navigator.maxTouchPoints > 0;
      setIsTouchViewport(coarse || touchPts || window.innerWidth <= 1024);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // Mount Three.js engine once
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new AshenGameEngine(canvasMountRef.current, {
      onBiomeChange: (b) => setCurrentBiome(b),
      onNearPromptChange: (p) => setNearPrompt(p),
      onModalShortcut: (which) => {
        if (which === 'inventory') {
          setMapOpen(false);
          setSocialOpen(false);
          setSettingsModal((prev) => ({ ...prev, open: false }));
          setInventoryOpen((v) => !v);
        } else if (which === 'map') {
          setInventoryOpen(false);
          setSocialOpen(false);
          setSettingsModal((prev) => ({ ...prev, open: false }));
          setMapOpen((v) => !v);
        } else if (which === 'pause') {
          const anyOpen =
            modalOpenRef.current.inventory ||
            modalOpenRef.current.map ||
            modalOpenRef.current.social ||
            modalOpenRef.current.settings;
          if (anyOpen) {
            setInventoryOpen(false);
            setMapOpen(false);
            setSocialOpen(false);
            setSettingsModal((prev) => ({ ...prev, open: false }));
          } else {
            setSettingsModal({ open: true, tab: 'settings' });
          }
        }
      },
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Connect WebSocket & wire authoritative server events
  useEffect(() => {
    wsClient.connect();
    let heraldTimeout: number | null = null;

    const syncEngineAndScreen = (snap: RoomStateSnapshot, pid: string | null, forceHud: boolean) => {
      roomStateRef.current = snap;
      const me = snap.worldPlayers.find((p) => p.id === pid) || null;

      let nextScreen: UiScreen = uiScreenRef.current;
      if (snap.phase === 'lobby') nextScreen = 'room';
      else if (snap.phase === 'countdown') nextScreen = 'countdown';
      else if (snap.phase === 'ended') nextScreen = 'ended';
      else if (snap.phase === 'playing') {
        nextScreen = me && (!me.alive || me.escaped) ? 'spectating' : 'playing';
      }

      if (nextScreen !== uiScreenRef.current) {
        setUiScreen(nextScreen);
        if (nextScreen === 'playing') {
          setInventoryOpen(false);
          setMapOpen(false);
          setSocialOpen(false);
          setSettingsModal((s) => ({ ...s, open: false }));
          (document.activeElement as HTMLElement | null)?.blur?.();
        }
      }

      engineRef.current?.syncState({
        appScreen:
          nextScreen === 'title' || nextScreen === 'hub' || nextScreen === 'room'
            ? nextScreen === 'title'
              ? 'title'
              : 'lobby'
            : nextScreen,
        seed: snap.seed,
        localPlayerId: pid,
        lobbyPlayers: snap.lobbyPlayers,
        worldPlayers: snap.worldPlayers,
        lootNodes: snap.lootNodes,
        collapse: snap.collapse,
        helicopter: snap.helicopter,
      });

      const now = performance.now();
      if (forceHud || now - lastHudSyncRef.current >= 95) {
        lastHudSyncRef.current = now;
        setRoomState({ ...snap });
      }
    };

    const unsub = wsClient.onMessage((msg) => {
      switch (msg.type) {
        case 'welcome': {
          const params = new URLSearchParams(window.location.search);
          const urlRoom = params.get('room');
          if (urlRoom && /^[A-Z0-9]{6}$/i.test(urlRoom)) {
            wsClient.send({
              type: 'join_room',
              payload: { roomCode: urlRoom.toUpperCase(), name: playerName, hearthId, appearance },
            });
            break;
          }
          const saved = wsClient.loadSession();
          if (saved) {
            wsClient.send({ type: 'reconnect_room', payload: saved });
          }
          break;
        }
        case 'room_joined': {
          const p = msg.payload as { playerId: string; snapshot: RoomStateSnapshot };
          localPlayerIdRef.current = p.playerId;
          setLocalPlayerId(p.playerId);
          setErrorMessage(null);
          syncEngineAndScreen(p.snapshot, p.playerId, true);
          break;
        }
        case 'room_state': {
          const snap = msg.payload as RoomStateSnapshot;
          syncEngineAndScreen(snap, localPlayerIdRef.current, true);
          break;
        }
        case 'world_tick': {
          const snap = roomStateRef.current;
          if (!snap) break;
          const tick = msg.payload as {
            matchElapsedSeconds: number;
            collapse: RoomStateSnapshot['collapse'];
            helicopter: RoomStateSnapshot['helicopter'];
            worldPlayers: WorldPlayerState[];
          };
          snap.matchElapsedSeconds = tick.matchElapsedSeconds;
          snap.collapse = tick.collapse;
          snap.helicopter = tick.helicopter;
          snap.worldPlayers = tick.worldPlayers;
          syncEngineAndScreen(snap, localPlayerIdRef.current, false);
          break;
        }
        case 'herald': {
          const h = msg.payload as HeraldAnnouncement;
          setHeraldActive(h);
          soundEngine.playHeraldChime(h.tone);
          if (heraldTimeout) window.clearTimeout(heraldTimeout);
          heraldTimeout = window.setTimeout(() => setHeraldActive(null), 5500);
          break;
        }
        case 'emote': {
          const em = msg.payload as EmoteMessage;
          setRecentEmotes((prev) => [...prev.slice(-15), em]);
          break;
        }
        case 'combat_event': {
          const ce = msg.payload as {
            x: number;
            y: number;
            z: number;
            damage: number;
            blocked: boolean;
            targetId: string | null;
          };
          engineRef.current?.notifyCombatEvent(ce);
          break;
        }
        case 'alliance_invite': {
          const inv = msg.payload as { fromId: string; fromName: string };
          setPendingInvites((prev) => (prev.some((x) => x.fromId === inv.fromId) ? prev : [...prev, inv]));
          break;
        }
        case 'rtc_signal': {
          const sig = msg.payload as { fromId: string; signal: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } };
          void voiceManager.handleSignal(sig.fromId, sig.signal);
          break;
        }
        case 'error': {
          const err = msg.payload as { code: string; message: string };
          if (err.code === 'RECONNECT_EXPIRED' || err.code === 'RECONNECT_INVALID') {
            wsClient.saveSession(null);
            break;
          }
          setErrorMessage(err.message);
          break;
        }
      }
    });

    return () => {
      if (heraldTimeout) window.clearTimeout(heraldTimeout);
      unsub();
    };
  }, []);

  const localPlayer =
    roomState?.worldPlayers.find((p) => p.id === localPlayerId) || null;

  const allies =
    roomState && localPlayer
      ? roomState.worldPlayers.filter(
          (p) => p.id !== localPlayer.id && p.alive && localPlayer.alliances.includes(p.id)
        )
      : [];

  const handleToggleMute = () => {
    soundEngine.unlock();
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const handleVolumesChange = (patch: Partial<AudioVolumes>) => {
    soundEngine.unlock();
    soundEngine.setVolumes(patch);
    setVolumesState(soundEngine.getVolumes());
    if (patch.voice !== undefined) voiceManager.setVoiceVolume(patch.voice);
  };

  const showMobileControls =
    uiScreen === 'playing' &&
    !inventoryOpen &&
    !mapOpen &&
    !socialOpen &&
    !settingsModal.open &&
    (touchMode === 'always' || (touchMode === 'auto' && isTouchViewport));

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#141311]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} data-testid="game-canvas-mount" className="absolute inset-0 w-full h-full" />

      {/* Title Screen */}
      {uiScreen === 'title' && (
        <TitleScreen
          onPlay={() => {
            soundEngine.unlock();
            setHubIntent('create');
            setUiScreen('hub');
          }}
          onCreateRoom={() => {
            soundEngine.unlock();
            setHubIntent('create');
            setUiScreen('hub');
          }}
          onJoinRoom={() => {
            soundEngine.unlock();
            setHubIntent('join');
            setUiScreen('hub');
          }}
          onOpenSettings={() => setSettingsModal({ open: true, tab: 'settings' })}
          onOpenAbout={() => setSettingsModal({ open: true, tab: 'about' })}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Lobby / Room / 15-Second Ceremonial Pedestal Countdown */}
      {(uiScreen === 'hub' || uiScreen === 'room' || uiScreen === 'countdown') && (
        <LobbyScreen
          mode={uiScreen === 'hub' ? 'hub' : uiScreen === 'countdown' ? 'countdown' : 'room'}
          initialAction={hubIntent}
          playerName={playerName}
          setPlayerName={setPlayerName}
          hearthId={hearthId}
          setHearthId={setHearthId}
          appearance={appearance}
          setAppearance={setAppearance}
          roomState={roomState}
          localPlayerId={localPlayerId}
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          onBackToTitle={() => setUiScreen('title')}
          onCreateRoom={() => {
            soundEngine.unlock();
            wsClient.send({ type: 'create_room', payload: { name: playerName, hearthId, appearance } });
          }}
          onJoinRoom={(code) => {
            soundEngine.unlock();
            wsClient.send({ type: 'join_room', payload: { roomCode: code, name: playerName, hearthId, appearance } });
          }}
          onLeaveRoom={() => {
            wsClient.saveSession(null);
            wsClient.send({ type: 'leave_room' });
            setRoomState(null);
            setUiScreen('hub');
          }}
          onToggleReady={() => wsClient.send({ type: 'toggle_ready' })}
          onUpdateProfile={(next) => wsClient.send({ type: 'update_profile', payload: next })}
          onUpdateSettings={(next: Partial<MatchSettings>) =>
            wsClient.send({ type: 'update_settings', payload: next })
          }
          onStartMatch={() => wsClient.send({ type: 'start_match' })}
          onCeremonyDagger={() => wsClient.send({ type: 'ceremony_dagger' })}
        />
      )}

      {/* Gameplay, Spectator & Match Results HUD */}
      {(uiScreen === 'playing' || uiScreen === 'spectating' || uiScreen === 'ended') && roomState && (
        <GameplayHUD
          roomState={roomState}
          localPlayer={localPlayer}
          currentBiome={currentBiome}
          nearPrompt={nearPrompt}
          heraldActive={heraldActive}
          recentEmotes={recentEmotes}
          muted={muted}
          mobileControlsVisible={showMobileControls}
          spectateTargetId={spectateTargetId}
          onSelectSpectate={(id) => {
            setSpectateTargetId(id);
            engineRef.current?.setSpectateTarget(id);
          }}
          onToggleMute={handleToggleMute}
          onOpenInventory={() => setInventoryOpen(true)}
          onOpenMap={() => setMapOpen(true)}
          onOpenSocial={() => setSocialOpen(true)}
          onOpenSettings={() => setSettingsModal({ open: true, tab: 'settings' })}
          onZoomIn={() => engineRef.current?.zoomIn()}
          onZoomOut={() => engineRef.current?.zoomOut()}
          onInteract={() => engineRef.current?.triggerInteract()}
          onUseOrEquip={(itemId) => {
            soundEngine.playPickup();
            wsClient.send({ type: 'use_item', payload: { itemId } });
          }}
          onReturnToLobby={() => {
            wsClient.saveSession(null);
            wsClient.send({ type: 'leave_room' });
            setRoomState(null);
            setUiScreen('hub');
          }}
          onPlayAgain={() => {
            if (roomState.hostId === localPlayerId) {
              wsClient.send({ type: 'start_match' });
            } else {
              wsClient.saveSession(null);
              wsClient.send({ type: 'leave_room' });
              setRoomState(null);
              setUiScreen('hub');
            }
          }}
        />
      )}

      {/* Mandatory Mobile & Tablet Controls */}
      <MobileControls
        visible={showMobileControls}
        onJoystick={(x, y) => engineRef.current?.setMobileJoystick(x, y)}
        onCameraDelta={(dx, dy) => engineRef.current?.triggerMobileCameraDelta(dx, dy)}
        onSprintChange={(v) => engineRef.current?.setMobileActions({ sprint: v })}
        onCrouchChange={(v) => engineRef.current?.setMobileActions({ crouch: v })}
        onBlockChange={(v) => engineRef.current?.setMobileActions({ block: v })}
        onJump={() => engineRef.current?.triggerMobileJump()}
        onAttack={() => engineRef.current?.triggerAttack()}
        onInteract={() => engineRef.current?.triggerInteract()}
        onOpenInventory={() => setInventoryOpen(true)}
        onZoomIn={() => engineRef.current?.zoomIn()}
        onZoomOut={() => engineRef.current?.zoomOut()}
        hasInteractPrompt={Boolean(nearPrompt)}
      />

      {/* Interactive Hexagonal Arena Map */}
      {roomState && (
        <InteractiveMapModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          localPlayer={localPlayer}
          allies={allies}
          collapse={roomState.collapse}
          helicopter={roomState.helicopter}
        />
      )}

      {/* Inventory Modal */}
      <InventoryModal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        player={localPlayer}
        onUseOrEquip={(itemId) => wsClient.send({ type: 'use_item', payload: { itemId } })}
        onDrop={(itemId) => wsClient.send({ type: 'drop_item', payload: { itemId } })}
      />

      {/* Social, Alliances & Proximity Voice Modal */}
      {roomState && (
        <SocialAndVoicePanel
          open={socialOpen}
          onClose={() => setSocialOpen(false)}
          localPlayer={localPlayer}
          worldPlayers={roomState.worldPlayers}
          pendingInvites={pendingInvites}
          emotes={recentEmotes}
          onAllianceAction={(action, targetId) => {
            if (action === 'accept') {
              setPendingInvites((prev) => prev.filter((p) => p.fromId !== targetId));
            }
            wsClient.send({ type: 'alliance_action', payload: { action, targetId } });
          }}
          onSendEmote={(text) => wsClient.send({ type: 'send_emote', payload: { text } })}
        />
      )}

      {/* Settings / About / Pause Modal */}
      <SettingsModal
        open={settingsModal.open}
        tab={settingsModal.tab}
        onClose={() => setSettingsModal((s) => ({ ...s, open: false }))}
        quality={quality}
        setQuality={(q) => {
          setQualityState(q);
          engineRef.current?.setQuality(q, resScale);
        }}
        resScale={resScale}
        setResScale={(v) => {
          setResScaleState(v);
          engineRef.current?.setQuality(quality, v);
        }}
        sensitivity={sensitivity}
        setSensitivity={(s) => {
          setSensitivityState(s);
          engineRef.current?.setSensitivity(s);
        }}
        touchMode={touchMode}
        setTouchMode={setTouchMode}
        volumes={volumes}
        setVolumes={handleVolumesChange}
        inMatch={uiScreen === 'playing' || uiScreen === 'spectating'}
        onLeaveMatch={() => {
          setSettingsModal((s) => ({ ...s, open: false }));
          wsClient.saveSession(null);
          wsClient.send({ type: 'leave_room' });
          setRoomState(null);
          setUiScreen('hub');
        }}
      />
    </div>
  );
}
