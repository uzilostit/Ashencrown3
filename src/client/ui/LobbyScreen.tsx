import React, { useState } from 'react';
import { Copy, Check, Crown, Users, ArrowLeft, Shield, Swords } from 'lucide-react';
import {
  HEARTHS,
  type MatchSettings,
  type PaperAppearance,
  type RoomStateSnapshot,
} from '../../shared/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';

interface LobbyScreenProps {
  mode: 'hub' | 'room' | 'countdown';
  initialAction?: 'create' | 'join';
  playerName: string;
  setPlayerName: (n: string) => void;
  hearthId: string;
  setHearthId: (h: string) => void;
  appearance: PaperAppearance;
  setAppearance: (a: PaperAppearance) => void;
  roomState: RoomStateSnapshot | null;
  localPlayerId: string | null;
  errorMessage: string | null;
  onClearError: () => void;
  onBackToTitle: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onUpdateProfile: (next: { name: string; hearthId: string; appearance: PaperAppearance }) => void;
  onUpdateSettings: (next: Partial<MatchSettings>) => void;
  onStartMatch: () => void;
  onCeremonyDagger: () => void;
}

const PAPER_TONES = ['#e8dfd1', '#d9cbb8', '#c8b49a', '#f2ece1'];
const CLOAK_COLORS = ['#465446', '#7a352a', '#2f4558', '#5c4a36', '#4a3d52', '#313336'];
const TRIM_COLORS = ['#d4a853', '#d96b38', '#83c987', '#8cb8d6', '#e0d8c8'];

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  mode,
  initialAction,
  playerName,
  setPlayerName,
  hearthId,
  setHearthId,
  appearance,
  setAppearance,
  roomState,
  localPlayerId,
  errorMessage,
  onClearError,
  onBackToTitle,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onToggleReady,
  onUpdateProfile,
  onUpdateSettings,
  onStartMatch,
  onCeremonyDagger,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const me = roomState?.lobbyPlayers.find((p) => p.id === localPlayerId) || null;
  const isHost = Boolean(roomState && localPlayerId && roomState.hostId === localPlayerId);
  const playerCount = roomState?.lobbyPlayers.length || 0;
  const canHostStart = isHost && playerCount >= 2;

  const applyProfile = (nextName: string, nextHearth: string, nextApp: PaperAppearance) => {
    setPlayerName(nextName);
    setHearthId(nextHearth);
    setAppearance(nextApp);
    if (mode === 'room') {
      onUpdateProfile({ name: nextName, hearthId: nextHearth, appearance: nextApp });
    }
  };

  // 15-second ceremonial pedestal countdown overlay
  if (mode === 'countdown' && roomState) {
    const secs = Math.ceil(roomState.countdownSecondsRemaining);
    const pct = Math.max(0, Math.min(100, (roomState.countdownSecondsRemaining / 15) * 100));
    const dashOffset = 283 - (283 * pct) / 100;
    const drewDagger = Boolean(me?.ceremonyDaggerDrawn);

    return (
      <div className="fixed inset-0 z-30 flex flex-col justify-between p-6 pointer-events-none">
        <div className="flex items-center justify-between pointer-events-auto">
          <div className="bg-[#141311]/90 border border-[#d4a853]/35 px-4 py-2 rounded">
            <span className="text-xs uppercase tracking-widest text-[#c7bca8]">Ceremonial Pedestal · Room </span>
            <span className="font-mono-tabular font-semibold text-[#d4a853]">{roomState.roomCode}</span>
          </div>
          <div className="bg-[#141311]/90 border border-[#d4a853]/35 px-4 py-2 rounded text-sm">
            {roomState.lobbyPlayers.filter((p) => p.ceremonyDaggerDrawn).length} / {roomState.lobbyPlayers.length} Daggers Drawn
          </div>
        </div>

        <div className="my-auto mx-auto flex flex-col items-center pointer-events-auto bg-[#141311]/88 border border-[#d4a853]/35 rounded-xl p-6 max-w-md text-center shadow-2xl">
          <div className="relative w-28 h-28 flex items-center justify-center mb-4">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(212,168,83,0.18)" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#d4a853"
                strokeWidth="6"
                strokeDasharray="283"
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute font-display text-3xl font-bold text-[#f2ede4] tabular-nums">{secs}</span>
          </div>
          <h2 className="font-display text-xl text-[#f2ede4] tracking-wider mb-1">THE CEREMONY TOLLS</h2>
          <p className="text-xs text-[#b5aa98] mb-5">
            All {roomState.lobbyPlayers.length} contestants stand at the Ash Pedestal. Draw your dagger before entering the arena.
          </p>
          <button
            type="button"
            onClick={() => {
              soundEngine.playWeaponAttack('dagger');
              onCeremonyDagger();
            }}
            disabled={drewDagger}
            className={`px-6 py-3 rounded font-semibold text-sm flex items-center gap-2 transition-colors cursor-pointer ${
              drewDagger
                ? 'bg-[#2a332b] text-[#9ec9a2] border border-[#83c987]/40 cursor-default'
                : 'bg-[#d96b38] hover:bg-[#e57a47] text-[#141311]'
            }`}
          >
            <Swords className="w-4 h-4" />
            {drewDagger ? 'Dagger Drawn — Awaiting Drop' : 'Draw Ceremonial Dagger'}
          </button>
        </div>

        <div className="text-center text-xs text-[#cfc6b6]">
          Synchronizing arena seed {roomState.seed} for all contestants...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-6 bg-[#141311]/78 overflow-y-auto">
      <div className="w-full max-w-5xl bg-[#1a1815] border border-[#d4a853]/30 rounded-xl shadow-2xl p-4 sm:p-6 my-auto">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#d4a853]/20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEngine.playUiClick();
                if (mode === 'room') onLeaveRoom();
                else onBackToTitle();
              }}
              className="px-3 py-2 rounded border border-[#a39a8b]/30 bg-[#24211c] text-xs font-medium text-[#f2ede4] hover:border-[#d4a853] flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {mode === 'room' ? 'Leave Room' : 'Back'}
            </button>
            <div>
              <h1 className="font-display text-lg sm:text-xl tracking-wider text-[#f2ede4]">
                {mode === 'room' && roomState ? `STAGING HALL · ${roomState.roomCode}` : 'CONTESTANT STAGING'}
              </h1>
              <p className="text-xs text-[#a39a8b]">
                {mode === 'room'
                  ? '2–15 players · First contestant is Host · Match starts when 2+ players are ready'
                  : 'Customize your paper avatar, choose a Hearth, then create or join a 6-character room.'}
              </p>
            </div>
          </div>

          {mode === 'room' && roomState && (
            <div className="flex items-center gap-2">
              <div className="px-3 py-2 rounded bg-[#24211c] border border-[#d4a853]/40 flex items-center gap-2">
                <span className="text-xs text-[#a39a8b]">CODE</span>
                <span data-testid="room-code" className="font-mono-tabular font-bold text-base tracking-[0.2em] text-[#d4a853]">
                  {roomState.roomCode}
                </span>
                <button
                  type="button"
                  aria-label="Copy room code"
                  onClick={() => {
                    navigator.clipboard?.writeText(roomState.roomCode).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="p-1 text-[#cfc6b6] hover:text-[#d4a853] cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-[#83c987]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 px-4 py-2.5 rounded bg-[#4a221c] border border-[#d96b38]/60 text-sm text-[#f7d8cf] flex items-center justify-between">
            <span>{errorMessage}</span>
            <button type="button" onClick={onClearError} className="text-xs underline ml-4 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-5">
          {/* Left Column: Identity & Paper Character Customizer */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#211e1a] border border-[#a39a8b]/20 rounded-lg p-4 space-y-3.5">
              <h2 className="text-xs uppercase tracking-widest text-[#d4a853] font-semibold">Contestant Identity</h2>

              <div>
                <label htmlFor="player-name-input" className="block text-xs text-[#cfc6b6] mb-1">
                  Display Name
                </label>
                <input
                  id="player-name-input"
                  type="text"
                  maxLength={18}
                  value={playerName}
                  onChange={(e) => applyProfile(e.target.value, hearthId, appearance)}
                  placeholder="Enter your name"
                  className="w-full px-3 py-2 rounded bg-[#141311] border border-[#a39a8b]/30 text-sm text-[#f2ede4] focus:outline-none focus:border-[#d4a853]"
                />
              </div>

              <div>
                <label htmlFor="hearth-select" className="block text-xs text-[#cfc6b6] mb-1">
                  Choose Hearth
                </label>
                <select
                  id="hearth-select"
                  value={hearthId}
                  onChange={(e) => applyProfile(playerName, e.target.value, appearance)}
                  className="w-full px-3 py-2 rounded bg-[#141311] border border-[#a39a8b]/30 text-sm text-[#f2ede4] focus:outline-none focus:border-[#d4a853]"
                >
                  {HEARTHS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} — {h.passiveLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs text-[#cfc6b6] mb-1.5">Paper Headgear</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['hood', 'crown', 'tricorn', 'cap'] as const).map((hat) => (
                    <button
                      key={hat}
                      type="button"
                      onClick={() => applyProfile(playerName, hearthId, { ...appearance, hatStyle: hat })}
                      className={`py-1.5 px-2 rounded text-xs capitalize border cursor-pointer ${
                        appearance.hatStyle === hat
                          ? 'bg-[#d4a853] text-[#141311] border-[#d4a853] font-semibold'
                          : 'bg-[#141311] text-[#cfc6b6] border-[#a39a8b]/25 hover:border-[#d4a853]'
                      }`}
                    >
                      {hat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="block text-[11px] text-[#a39a8b] mb-1">Paper Tone</span>
                  <div className="flex gap-1.5">
                    {PAPER_TONES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Paper tone ${c}`}
                        onClick={() => applyProfile(playerName, hearthId, { ...appearance, paperTone: c })}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded border cursor-pointer ${
                          appearance.paperTone === c ? 'ring-2 ring-[#d4a853] border-[#141311]' : 'border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] text-[#a39a8b] mb-1">Cloak</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CLOAK_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Cloak color ${c}`}
                        onClick={() => applyProfile(playerName, hearthId, { ...appearance, cloakColor: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded border cursor-pointer ${
                          appearance.cloakColor === c ? 'ring-2 ring-[#d4a853] border-[#141311]' : 'border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <span className="block text-[11px] text-[#a39a8b] mb-1">Crest Trim</span>
                  <div className="flex flex-wrap gap-1.5">
                    {TRIM_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Trim color ${c}`}
                        onClick={() => applyProfile(playerName, hearthId, { ...appearance, trimColor: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded border cursor-pointer ${
                          appearance.trimColor === c ? 'ring-2 ring-[#d4a853] border-[#141311]' : 'border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Create/Join Hub OR Room Roster & Match Controls */}
          <div className="lg:col-span-7 space-y-4">
            {mode === 'hub' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                <div
                  className={`bg-[#211e1a] border rounded-lg p-5 flex flex-col justify-between ${
                    initialAction === 'create' ? 'border-[#d4a853]' : 'border-[#a39a8b]/25'
                  }`}
                >
                  <div>
                    <h2 className="font-display text-lg text-[#f2ede4] mb-1">Host a Match</h2>
                    <p className="text-xs text-[#a39a8b] leading-relaxed mb-4">
                      Generate a unique six-character room code and invite 1 to 14 friends. Matches begin as soon as two players are present.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      onCreateRoom();
                    }}
                    className="w-full py-3 rounded bg-[#d4a853] hover:bg-[#e1b967] text-[#141311] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Create Room
                  </button>
                </div>

                <div
                  className={`bg-[#211e1a] border rounded-lg p-5 flex flex-col justify-between ${
                    initialAction === 'join' ? 'border-[#d4a853]' : 'border-[#a39a8b]/25'
                  }`}
                >
                  <div>
                    <h2 className="font-display text-lg text-[#f2ede4] mb-1">Join by Code</h2>
                    <p className="text-xs text-[#a39a8b] leading-relaxed mb-3">
                      Enter a host&apos;s six-character room code to enter their staging hall.
                    </p>
                    <label htmlFor="room-code-input" className="block text-xs text-[#cfc6b6] mb-1">
                      6-Character Room Code
                    </label>
                    <input
                      id="room-code-input"
                      type="text"
                      maxLength={6}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      placeholder="E.G. K7M9Q2"
                      className="w-full px-3 py-2.5 rounded bg-[#141311] border border-[#a39a8b]/35 font-mono-tabular text-base tracking-[0.25em] uppercase text-[#d4a853] focus:outline-none focus:border-[#d4a853] mb-3"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playUiClick();
                      onJoinRoom(joinCode);
                    }}
                    className="w-full py-3 rounded border border-[#d4a853]/60 bg-[#2a251e] hover:bg-[#352e25] text-[#f2ede4] font-semibold text-sm transition-colors cursor-pointer"
                  >
                    Join Room
                  </button>
                </div>
              </div>
            ) : (
              roomState && (
                <div className="bg-[#211e1a] border border-[#a39a8b]/20 rounded-lg p-4 flex flex-col justify-between space-y-4">
                  {/* Roster */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xs uppercase tracking-widest text-[#d4a853] font-semibold flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        Contestants ({playerCount} / 15)
                      </h2>
                      <span className="text-xs text-[#a39a8b]">
                        {playerCount < 2 ? 'Waiting for at least 2 players' : 'Minimum 2 players met — ready to start'}
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-52 overflow-y-auto ashen-scroll pr-1">
                      {roomState.lobbyPlayers.map((lp) => {
                        const h = HEARTHS.find((x) => x.id === lp.hearthId);
                        return (
                          <div
                            key={lp.id}
                            className="flex items-center justify-between px-3 py-2 rounded bg-[#141311] border border-[#a39a8b]/15 text-sm"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{ backgroundColor: lp.appearance.cloakColor }}
                              />
                              <span className="font-medium text-[#f2ede4] truncate">{lp.name}</span>
                              {lp.isHost && (
                                <span className="text-[11px] text-[#d4a853] flex items-center gap-1 shrink-0">
                                  <Crown className="w-3 h-3" /> Host
                                </span>
                              )}
                              <span className="text-xs text-[#a39a8b] hidden sm:inline truncate">
                                · {h?.name || 'Hearth of Ash'}
                              </span>
                            </div>
                            <span
                              className={`text-xs font-medium shrink-0 ${
                                !lp.connected
                                  ? 'text-[#d96b38]'
                                  : lp.ready
                                    ? 'text-[#83c987]'
                                    : 'text-[#a39a8b]'
                              }`}
                            >
                              {!lp.connected ? 'Reconnecting' : lp.ready ? 'Ready' : 'Not Ready'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Host Match Settings */}
                  <div className="border-t border-[#a39a8b]/15 pt-3">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#a39a8b] mb-2">
                      <Shield className="w-3.5 h-3.5" /> Match Settings {isHost ? '(Host Controls)' : '(Read-Only)'}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <label className="flex items-center gap-2 bg-[#141311] px-2.5 py-2 rounded border border-[#a39a8b]/15">
                        <input
                          type="checkbox"
                          disabled={!isHost}
                          checked={roomState.settings.healthRegenEnabled}
                          onChange={(e) => onUpdateSettings({ healthRegenEnabled: e.target.checked })}
                        />
                        <span>Passive Regen</span>
                      </label>
                      <label className="flex items-center gap-2 bg-[#141311] px-2.5 py-2 rounded border border-[#a39a8b]/15">
                        <input
                          type="checkbox"
                          disabled={!isHost}
                          checked={roomState.settings.friendlyFireAllies}
                          onChange={(e) => onUpdateSettings({ friendlyFireAllies: e.target.checked })}
                        />
                        <span>Full Ally Damage</span>
                      </label>
                      <label className="flex items-center justify-between gap-2 bg-[#141311] px-2.5 py-2 rounded border border-[#a39a8b]/15">
                        <span>Collapse Pace</span>
                        <select
                          disabled={!isHost}
                          value={roomState.settings.collapseSpeedMultiplier}
                          onChange={(e) => onUpdateSettings({ collapseSpeedMultiplier: Number(e.target.value) })}
                          className="bg-transparent text-[#d4a853] focus:outline-none"
                        >
                          <option value={1}>Standard</option>
                          <option value={1.5}>Brisk</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#a39a8b]/15">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        onToggleReady();
                      }}
                      className={`px-5 py-2.5 rounded text-sm font-semibold border transition-colors cursor-pointer ${
                        me?.ready
                          ? 'bg-[#2a382c] border-[#83c987]/60 text-[#aee4b1]'
                          : 'bg-[#2a251e] border-[#d4a853]/45 text-[#f2ede4] hover:border-[#d4a853]'
                      }`}
                    >
                      {me?.ready ? 'Ready (Click to Unready)' : 'Ready Up'}
                    </button>

                    {isHost ? (
                      <button
                        type="button"
                        disabled={!canHostStart}
                        onClick={() => {
                          soundEngine.playUiClick();
                          onStartMatch();
                        }}
                        className={`px-6 py-2.5 rounded text-sm font-semibold transition-colors ${
                          canHostStart
                            ? 'bg-[#d4a853] hover:bg-[#e1b967] text-[#141311] cursor-pointer'
                            : 'bg-[#2e2a24] text-[#7a7266] cursor-not-allowed'
                        }`}
                      >
                        {playerCount < 2 ? 'Need 2+ Players to Start' : `Start Match (${playerCount} Players)`}
                      </button>
                    ) : (
                      <span className="text-xs text-[#a39a8b]">Waiting for host to initiate match...</span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
