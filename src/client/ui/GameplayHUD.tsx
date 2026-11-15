import React from 'react';
import {
  Map as MapIcon,
  Backpack,
  Users,
  Volume2,
  VolumeX,
  Settings,
  ZoomIn,
  ZoomOut,
  Flame,
  Eye,
  Trophy,
  RotateCcw,
} from 'lucide-react';
import {
  BIOME_DEFINITIONS,
  BiomeId,
  ITEM_CATALOG,
  OUTER_BIOMES,
  type EmoteMessage,
  type HeraldAnnouncement,
  type MatchResultSummary,
  type RoomStateSnapshot,
  type WorldPlayerState,
} from '../../shared/types.ts';
import { ARENA_RADIUS, BASE_CAMP_RADIUS } from '../../shared/worldGen.ts';
import gameConfig from '../../config/gameConfig.json' with { type: 'json' };

interface GameplayHUDProps {
  roomState: RoomStateSnapshot;
  localPlayer: WorldPlayerState | null;
  currentBiome: BiomeId;
  nearPrompt: string | null;
  heraldActive: HeraldAnnouncement | null;
  recentEmotes: EmoteMessage[];
  muted: boolean;
  mobileControlsVisible?: boolean;
  spectateTargetId: string | null;
  onSelectSpectate: (id: string) => void;
  onToggleMute: () => void;
  onOpenInventory: () => void;
  onOpenMap: () => void;
  onOpenSocial: () => void;
  onOpenSettings: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onInteract: () => void;
  onUseOrEquip: (itemId: string) => void;
  onReturnToLobby: () => void;
  onPlayAgain: () => void;
}

export const GameplayHUD: React.FC<GameplayHUDProps> = ({
  roomState,
  localPlayer,
  currentBiome,
  nearPrompt,
  heraldActive,
  recentEmotes,
  muted,
  mobileControlsVisible = false,
  spectateTargetId,
  onSelectSpectate,
  onToggleMute,
  onOpenInventory,
  onOpenMap,
  onOpenSocial,
  onOpenSettings,
  onZoomIn,
  onZoomOut,
  onInteract,
  onUseOrEquip,
  onReturnToLobby,
  onPlayAgain,
}) => {
  const alivePlayers = roomState.worldPlayers.filter((p) => p.alive && !p.escaped);
  const biomeDef = BIOME_DEFINITIONS[currentBiome];

  // 1. Match Ended Results Modal
  if (roomState.phase === 'ended' && roomState.results) {
    const res: MatchResultSummary = roomState.results;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#141311]/86 overflow-y-auto">
        <div className="w-full max-w-2xl bg-[#1a1815] border border-[#d4a853]/45 rounded-xl p-6 shadow-2xl my-auto">
          <div className="flex items-center gap-3 pb-4 border-b border-[#d4a853]/25">
            <Trophy className="w-7 h-7 text-[#d4a853]" />
            <div>
              <h1 className="font-display text-2xl tracking-wider text-[#f2ede4]">
                {res.winnerName ? `${res.winnerName} CROWNED` : 'MATCH CONCLUDED'}
              </h1>
              <p className="text-xs text-[#a39a8b]">
                {res.reason === 'helicopter_escape'
                  ? 'Extraction helicopter departed Base Camp'
                  : 'Last remaining survivor in the arena'}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2 max-h-64 overflow-y-auto ashen-scroll pr-1">
            {res.rankings.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded border text-sm ${
                  r.placement === 1
                    ? 'bg-[#2a251c] border-[#d4a853]/60'
                    : 'bg-[#211e1a] border-[#a39a8b]/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular font-bold text-[#d4a853] w-6">#{r.placement}</span>
                  <div>
                    <div className="font-semibold text-[#f2ede4]">{r.name}</div>
                    <div className="text-[11px] text-[#a39a8b]">
                      {r.escaped ? 'Escaped by Helicopter' : r.alive ? 'Final Survivor' : 'Eliminated'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono-tabular text-[#cfc6b6]">
                  <span>{r.eliminations} Elim</span>
                  <span>{r.resourcesCollected} Loot</span>
                  <span>{r.survivalTimeSec}s</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 mt-5 pt-4 border-t border-[#d4a853]/20">
            <button
              type="button"
              onClick={onReturnToLobby}
              className="px-5 py-2.5 rounded border border-[#a39a8b]/35 bg-[#211e1a] text-sm font-medium text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
            >
              Return to Lobby
            </button>
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="px-6 py-2.5 rounded bg-[#d4a853] hover:bg-[#e1b967] text-[#141311] text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Spectator HUD when local player is eliminated or escaped
  if (localPlayer && (!localPlayer.alive || localPlayer.escaped)) {
    const currentTarget =
      alivePlayers.find((p) => p.id === spectateTargetId) || alivePlayers[0] || null;
    return (
      <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto bg-[#141311]/90 border border-[#d4a853]/35 px-4 py-3 rounded-lg">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#d4a853] mb-1">
              <Eye className="w-3.5 h-3.5" />
              {localPlayer.escaped ? 'Extracted — Spectating' : 'Eliminated — Spectating'}
            </div>
            <div className="text-sm font-semibold text-[#f2ede4]">
              {currentTarget ? `Watching ${currentTarget.name}` : 'Awaiting match conclusion'}
            </div>
            <div className="text-xs text-[#a39a8b] mt-0.5 tabular-nums">
              {alivePlayers.length} Survivors Remaining
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenSettings}
            className="pointer-events-auto px-3.5 py-2 rounded bg-[#141311]/90 border border-[#a39a8b]/35 text-xs text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
          >
            Menu
          </button>
        </div>

        {alivePlayers.length > 1 && (
          <div className="mx-auto pointer-events-auto flex flex-wrap gap-2 bg-[#141311]/90 border border-[#d4a853]/30 p-2 rounded-lg">
            {alivePlayers.map((ap) => (
              <button
                key={ap.id}
                type="button"
                onClick={() => onSelectSpectate(ap.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                  currentTarget?.id === ap.id
                    ? 'bg-[#d4a853] text-[#141311]'
                    : 'bg-[#211e1a] text-[#f2ede4] hover:border-[#d4a853]'
                }`}
              >
                {ap.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!localPlayer) return null;

  const hp = Math.round(localPlayer.stats.health);
  const hunger = Math.round(localPlayer.stats.hunger);
  const stamina = Math.round(localPlayer.stats.stamina);
  const temp = Math.round(localPlayer.stats.temperature);
  const equippedWeapon = ITEM_CATALOG[localPlayer.equippedWeaponId] || ITEM_CATALOG.dagger;
  const ammoCount = equippedWeapon.ammoType
    ? localPlayer.inventory.find((i) => i.itemId === equippedWeapon.ammoType)?.quantity ?? 0
    : null;

  // Compact corner minimap scale
  const mmSize = 104;
  const mmCenter = mmSize / 2;
  const mmScale = (mmSize * 0.43) / ARENA_RADIUS;

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-4"
      style={{
        paddingTop: 'max(12px, var(--safe-top))',
        paddingBottom: 'max(12px, var(--safe-bottom))',
      }}
    >
      {/* Top Perimeter Row */}
      <div className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-2 sm:gap-3">
        {/* Top-Left: Vitals & Biome */}
        <div className="bg-[#141311]/86 border border-[#d4a853]/30 rounded-lg px-2.5 sm:px-3.5 py-2 sm:py-2.5 w-44 sm:w-56 md:w-64 shadow-lg">
          <div className="flex items-baseline justify-between gap-1 mb-1.5">
            <span className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#f2ede4] truncate">{biomeDef.name}</span>
            <span className="font-mono-tabular text-[11px] text-[#d4a853] shrink-0">{temp}°C</span>
          </div>

          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-[#cfc6b6] mb-0.5">
                <span>Health</span>
                <span className="font-mono-tabular">{hp}</span>
              </div>
              <div className="h-2 bg-[#29251f] rounded overflow-hidden">
                <div className="h-full bg-[#c94a38]" style={{ width: `${hp}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-[10px] text-[#a39a8b] mb-0.5">
                  <span>Hunger</span>
                  <span className="font-mono-tabular">{hunger}</span>
                </div>
                <div className="h-1.5 bg-[#29251f] rounded overflow-hidden">
                  <div className="h-full bg-[#c78b3b]" style={{ width: `${hunger}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-[#a39a8b] mb-0.5">
                  <span>Stamina</span>
                  <span className="font-mono-tabular">{stamina}</span>
                </div>
                <div className="h-1.5 bg-[#29251f] rounded overflow-hidden">
                  <div className="h-full bg-[#77a876]" style={{ width: `${stamina}%` }} />
                </div>
              </div>
            </div>
          </div>

          {localPlayer.stats.statusEffects.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-[#e8a48f] font-medium">
              {localPlayer.stats.statusEffects.map((ef) => (
                <span key={ef}>{ef.replace('_', ' ')}</span>
              ))}
            </div>
          )}
        </div>

        {/* Top-Center: Collapse Warning / Helicopter Timer & The Herald */}
        <div className="order-3 basis-full sm:order-none sm:basis-auto flex flex-col items-center gap-1.5 sm:gap-2 max-w-md mx-auto">
          <div className="bg-[#141311]/88 border border-[#d4a853]/30 rounded-lg px-3.5 sm:px-4 py-1 sm:py-1.5 text-center shadow whitespace-nowrap">
            {roomState.helicopter.phase === 'flare_active' || roomState.helicopter.phase === 'approaching' ? (
              <div className="text-xs font-semibold text-[#83c987] flex items-center gap-2 tabular-nums">
                <Flame className="w-3.5 h-3.5 text-[#d96b38]" />
                Helicopter ETA: {Math.ceil(roomState.helicopter.arrivalSecondsRemaining)}s · 2 Seats
              </div>
            ) : roomState.helicopter.phase === 'landed' ? (
              <div className="text-xs font-semibold text-[#d4a853] tabular-nums">
                HELICOPTER LANDED AT BASE CAMP · {Math.ceil(roomState.helicopter.departureSecondsRemaining)}s ({roomState.helicopter.seatsOccupiedBy.length}/2 Seats)
              </div>
            ) : roomState.collapse.warningBiome ? (
              <div className="text-xs font-semibold text-[#e68e67] tabular-nums">
                {BIOME_DEFINITIONS[roomState.collapse.warningBiome].name} collapsing in{' '}
                {Math.ceil(roomState.collapse.warningSecondsRemaining)}s
              </div>
            ) : (
              <div className="text-xs text-[#cfc6b6] tabular-nums">
                {alivePlayers.length} Alive · Next Shift {Math.ceil(roomState.collapse.nextEventInSeconds)}s
              </div>
            )}
          </div>

          {heraldActive && (
            <div
              role="status"
              className="bg-[#191612]/94 border border-[#d4a853]/65 rounded-lg px-5 py-2.5 text-center shadow-2xl"
            >
              <div className="text-[10px] uppercase tracking-[0.26em] text-[#d4a853] font-semibold">
                THE HERALD · {heraldActive.title}
              </div>
              <div className="text-xs sm:text-sm text-[#f2ede4] mt-0.5">{heraldActive.message}</div>
            </div>
          )}

          {recentEmotes.length > 0 && (
            <div className="text-xs bg-[#141311]/82 px-3 py-1 rounded border border-[#a39a8b]/25 text-[#f2ede4]">
              <span className="text-[#d4a853] font-semibold">{recentEmotes[recentEmotes.length - 1].fromName}:</span>{' '}
              {recentEmotes[recentEmotes.length - 1].text}
            </div>
          )}
        </div>

        {/* Top-Right: Minimap & Utility Buttons */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 sm:gap-1.5">
            {!mobileControlsVisible && (
              <>
                <button
                  type="button"
                  aria-label="Zoom out"
                  onClick={onZoomOut}
                  className="hidden lg:flex w-9 h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Zoom in"
                  onClick={onZoomIn}
                  className="hidden lg:flex w-9 h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              type="button"
              aria-label="Alliances and Emotes"
              onClick={onOpenSocial}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Open map"
              onClick={onOpenMap}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
            >
              <MapIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              onClick={onToggleMute}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              aria-label="Settings and Pause"
              onClick={onOpenSettings}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded bg-[#141311]/88 border border-[#d4a853]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            aria-label="Expand tactical map"
            onClick={onOpenMap}
            className="hidden sm:block rounded-lg overflow-hidden border border-[#d4a853]/35 bg-[#141311]/88 hover:border-[#d4a853] cursor-pointer"
          >
            <svg width={mmSize} height={mmSize} viewBox={`0 0 ${mmSize} ${mmSize}`}>
              {OUTER_BIOMES.map((bId, idx) => {
                const a1 = (idx * Math.PI * 2) / 6;
                const a2 = ((idx + 1) * Math.PI * 2) / 6;
                const ro = ARENA_RADIUS * mmScale;
                const ri = BASE_CAMP_RADIUS * mmScale;
                const d = `M ${mmCenter + Math.cos(a1) * ri} ${mmCenter + Math.sin(a1) * ri} L ${mmCenter + Math.cos(a1) * ro} ${mmCenter + Math.sin(a1) * ro} L ${mmCenter + Math.cos(a2) * ro} ${mmCenter + Math.sin(a2) * ro} L ${mmCenter + Math.cos(a2) * ri} ${mmCenter + Math.sin(a2) * ri} Z`;
                const collapsed = roomState.collapse.collapsedBiomes.includes(bId);
                const warning = roomState.collapse.warningBiome === bId;
                return (
                  <path
                    key={bId}
                    d={d}
                    fill={collapsed ? '#4b1f1a' : warning ? '#7b3c22' : BIOME_DEFINITIONS[bId].groundColor}
                    fillOpacity={0.75}
                    stroke="#d4a853"
                    strokeOpacity={0.25}
                  />
                );
              })}
              <circle cx={mmCenter} cy={mmCenter} r={BASE_CAMP_RADIUS * mmScale} fill="#5c5346" stroke="#d4a853" />
              <circle
                cx={mmCenter + gameConfig.world.helipadPos.x * mmScale}
                cy={mmCenter + gameConfig.world.helipadPos.z * mmScale}
                r="3.2"
                fill={roomState.helicopter.phase === 'landed' ? '#83c987' : '#d96b38'}
              />
              <circle
                cx={mmCenter + localPlayer.x * mmScale}
                cy={mmCenter + localPlayer.z * mmScale}
                r="3.5"
                fill="#d4a853"
                stroke="#141311"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom Center: Context Prompt + Equipped Weapon + Quick Hotbar */}
      <div
        className={`flex flex-col items-center gap-2 ${
          mobileControlsVisible ? 'mb-48 sm:mb-1 sm:mr-[112px] lg:mr-0 lg:mb-1' : 'mb-1'
        }`}
      >
        {nearPrompt && (
          <button
            type="button"
            onClick={onInteract}
            className="pointer-events-auto px-4 py-2 rounded bg-[#d4a853] text-[#141311] text-xs font-semibold shadow-lg cursor-pointer"
          >
            {nearPrompt}
          </button>
        )}

        <div
          className={`pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-[#141311]/88 border border-[#d4a853]/30 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 overflow-x-auto ${
            mobileControlsVisible ? 'max-w-[310px] lg:max-w-none' : 'max-w-[92vw] lg:max-w-none'
          }`}
        >
          <div className={`${mobileControlsVisible ? 'hidden lg:block' : 'hidden sm:block'} pr-2.5 border-r border-[#a39a8b]/20 text-xs shrink-0`}>
            <div className="font-semibold text-[#f2ede4]">{equippedWeapon.name}</div>
            <div className="text-[11px] text-[#d4a853] font-mono-tabular">
              {ammoCount !== null ? `Ammo: ${ammoCount}` : 'Melee · Protected'}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            {localPlayer.inventory.slice(0, 4).map((slot) => {
              const def = ITEM_CATALOG[slot.itemId];
              if (!def) return null;
              const active = localPlayer.equippedWeaponId === slot.itemId;
              return (
                <button
                  key={slot.itemId}
                  type="button"
                  onClick={() => onUseOrEquip(slot.itemId)}
                  className={`px-2 py-1 rounded border text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#d4a853]/25 border-[#d4a853] text-[#f2ede4]'
                      : 'bg-[#211e1a] border-[#a39a8b]/25 text-[#cfc6b6] hover:border-[#d4a853]'
                  }`}
                >
                  {def.name.split(' ').slice(-1)[0]}{' '}
                  <span className="font-mono-tabular text-[#d4a853]">×{slot.quantity}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Open full satchel"
              onClick={onOpenInventory}
              className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded border border-[#a39a8b]/30 bg-[#211e1a] text-[11px] text-[#f2ede4] hover:border-[#d4a853] cursor-pointer shrink-0"
            >
              <Backpack className="w-3.5 h-3.5 text-[#d4a853]" /> Tab
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
