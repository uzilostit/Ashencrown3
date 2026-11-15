import React, { useState } from 'react';
import { X, Handshake, Unlink, Mic, MicOff, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import type { EmoteMessage, WorldPlayerState } from '../../shared/types.ts';
import { voiceManager } from '../network/webrtcVoice.ts';

interface SocialAndVoicePanelProps {
  open: boolean;
  onClose: () => void;
  localPlayer: WorldPlayerState | null;
  worldPlayers: WorldPlayerState[];
  pendingInvites: Array<{ fromId: string; fromName: string }>;
  emotes: EmoteMessage[];
  onAllianceAction: (action: 'invite' | 'accept' | 'break', targetId: string) => void;
  onSendEmote: (text: string) => void;
}

const QUICK_EMOTES = [
  'Truce?',
  'Follow me',
  'Move to Base Camp!',
  'Watch out!',
  'Sharing supplies',
  'Hold the Helipad',
];

export const SocialAndVoicePanel: React.FC<SocialAndVoicePanelProps> = ({
  open,
  onClose,
  localPlayer,
  worldPlayers,
  pendingInvites,
  emotes,
  onAllianceAction,
  onSendEmote,
}) => {
  const [customEmote, setCustomEmote] = useState('');
  const [, forceUpdate] = useState(0);

  React.useEffect(() => {
    return voiceManager.subscribe(() => forceUpdate((n) => n + 1));
  }, []);

  if (!open || !localPlayer) return null;

  const others = worldPlayers.filter((p) => p.id !== localPlayer.id && p.alive);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#141311]/82">
      <div className="w-full max-w-xl bg-[#1a1815] border border-[#d4a853]/35 rounded-xl p-5 shadow-2xl max-h-[88vh] flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#d4a853]/20">
          <div>
            <h2 className="font-display text-lg tracking-wider text-[#f2ede4]">ALLIANCES &amp; FIELD COMMS</h2>
            <p className="text-xs text-[#a39a8b]">{voiceManager.statusReason}</p>
          </div>
          <button
            type="button"
            aria-label="Close comms"
            onClick={onClose}
            className="w-9 h-9 rounded border border-[#a39a8b]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Experimental Proximity Voice bar */}
        <div className="flex items-center justify-between gap-3 p-3 rounded bg-[#211e1a] border border-[#a39a8b]/20">
          <div className="text-xs">
            <div className="font-semibold text-[#f2ede4]">Experimental Proximity Voice (WebRTC)</div>
            <div className="text-[#a39a8b]">
              {voiceManager.available
                ? voiceManager.isSelfMuted()
                  ? 'Mic muted — text emotes always active'
                  : 'Broadcasting within 32m'
                : 'Voice unavailable without mic/direct ICE — text emotes active'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => voiceManager.toggleSelfMute()}
            className={`px-3 py-2 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              voiceManager.available && !voiceManager.isSelfMuted()
                ? 'bg-[#83c987] text-[#141311]'
                : 'bg-[#2a251e] border border-[#d4a853]/40 text-[#f2ede4]'
            }`}
          >
            {voiceManager.available && !voiceManager.isSelfMuted() ? (
              <>
                <Mic className="w-3.5 h-3.5" /> Mic On
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5" /> Enable / Unmute
              </>
            )}
          </button>
        </div>

        {/* Pending Alliance Invitations */}
        {pendingInvites.length > 0 && (
          <div className="space-y-1.5">
            {pendingInvites.map((inv) => (
              <div
                key={inv.fromId}
                className="flex items-center justify-between px-3 py-2 rounded bg-[#2a332b] border border-[#83c987]/50 text-xs"
              >
                <span className="text-[#f2ede4]">
                  <strong>{inv.fromName}</strong> offers a temporary alliance.
                </span>
                <button
                  type="button"
                  onClick={() => onAllianceAction('accept', inv.fromId)}
                  className="px-3 py-1 rounded bg-[#83c987] text-[#141311] font-semibold cursor-pointer"
                >
                  Accept Truce
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Survivors List */}
        <div className="space-y-1.5 max-h-40 overflow-y-auto ashen-scroll pr-1">
          <div className="text-[11px] uppercase tracking-widest text-[#a39a8b]">Active Contestants</div>
          {others.length === 0 ? (
            <p className="text-xs text-[#a39a8b]">No other living contestants nearby.</p>
          ) : (
            others.map((p) => {
              const isAlly = localPlayer.alliances.includes(p.id);
              const dist = Math.round(Math.hypot(p.x - localPlayer.x, p.z - localPlayer.z));
              const peerMuted = voiceManager.isPeerMuted(p.id);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded bg-[#211e1a] border border-[#a39a8b]/15 text-xs"
                >
                  <div>
                    <span className="font-semibold text-[#f2ede4]">{p.name}</span>
                    <span className="text-[#a39a8b] ml-2 tabular-nums">{dist}m</span>
                    {isAlly && <span className="ml-2 text-[#83c987] font-medium">· Ally</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={peerMuted ? `Unmute ${p.name}` : `Mute ${p.name}`}
                      onClick={() => voiceManager.togglePeerMute(p.id)}
                      className="p-1.5 rounded border border-[#a39a8b]/25 text-[#cfc6b6] hover:border-[#d4a853] cursor-pointer"
                    >
                      {peerMuted ? <VolumeX className="w-3.5 h-3.5 text-[#d96b38]" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    {isAlly ? (
                      <button
                        type="button"
                        onClick={() => onAllianceAction('break', p.id)}
                        className="px-2.5 py-1 rounded border border-[#d96b38]/60 text-[#f2b5a4] hover:bg-[#d96b38]/20 flex items-center gap-1 cursor-pointer"
                      >
                        <Unlink className="w-3 h-3" /> Break
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={dist > 28}
                        onClick={() => onAllianceAction('invite', p.id)}
                        className={`px-2.5 py-1 rounded flex items-center gap-1 ${
                          dist <= 28
                            ? 'bg-[#d4a853] text-[#141311] font-semibold cursor-pointer'
                            : 'bg-[#2a2620] text-[#7a7266] cursor-not-allowed'
                        }`}
                      >
                        <Handshake className="w-3 h-3" /> {dist <= 28 ? 'Ally' : 'Too Far'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Text Emotes */}
        <div className="border-t border-[#a39a8b]/20 pt-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-[#a39a8b]">
            <MessageSquare className="w-3.5 h-3.5" /> Quick Text Emotes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EMOTES.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => onSendEmote(text)}
                className="px-2.5 py-1.5 rounded bg-[#211e1a] border border-[#d4a853]/30 text-xs text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
              >
                {text}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!customEmote.trim()) return;
              onSendEmote(customEmote);
              setCustomEmote('');
            }}
          >
            <input
              type="text"
              maxLength={60}
              value={customEmote}
              onChange={(e) => setCustomEmote(e.target.value)}
              placeholder="Signal nearby players..."
              className="flex-1 px-3 py-1.5 rounded bg-[#141311] border border-[#a39a8b]/30 text-xs text-[#f2ede4] focus:outline-none focus:border-[#d4a853]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded bg-[#d4a853] text-[#141311] text-xs font-semibold cursor-pointer"
            >
              Send
            </button>
          </form>

          {emotes.length > 0 && (
            <div className="max-h-20 overflow-y-auto ashen-scroll space-y-1 text-xs pt-1">
              {emotes.slice(-4).map((em) => (
                <div key={em.id} className="text-[#cfc6b6]">
                  <span className="text-[#d4a853] font-semibold">{em.fromName}:</span> {em.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
