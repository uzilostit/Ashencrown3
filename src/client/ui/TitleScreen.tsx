import React from 'react';
import { Volume2, VolumeX, Settings, Info, Plus, LogIn } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine.ts';

interface TitleScreenProps {
  onPlay: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onPlay,
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
  onOpenAbout,
  muted,
  onToggleMute,
}) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
        if (activeTag === 'BUTTON' || activeTag === 'INPUT') return;
        e.preventDefault();
        soundEngine.playUiClick();
        onPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlay]);

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none p-5 sm:p-10">
      {/* Top utility strip */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="text-xs tracking-[0.22em] uppercase text-[#c7bca8]">
          2–15 Players · Six Biomes · Server-Authoritative
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="w-10 h-10 flex items-center justify-center rounded border border-[#d4a853]/30 bg-[#141311]/85 text-[#f2ede4] hover:border-[#d4a853] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onOpenSettings();
            }}
            aria-label="Settings"
            className="w-10 h-10 flex items-center justify-center rounded border border-[#d4a853]/30 bg-[#141311]/85 text-[#f2ede4] hover:border-[#d4a853] transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onOpenAbout();
            }}
            aria-label="About and Controls"
            className="w-10 h-10 flex items-center justify-center rounded border border-[#d4a853]/30 bg-[#141311]/85 text-[#f2ede4] hover:border-[#d4a853] transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Left-aligned title lockup over calm negative space */}
      <div className="max-w-xl my-auto pointer-events-auto bg-[#141311]/82 border border-[#d4a853]/25 p-6 sm:p-8 rounded-lg shadow-2xl">
        <div className="mb-4">
          <svg
            viewBox="0 0 360 74"
            className="w-full max-w-[340px] h-auto"
            role="img"
            aria-label="Ashen Crown Crest and Title"
          >
            {/* Geometric Folded Crown Emblem */}
            <polygon
              points="18,52 10,20 26,34 36,12 46,34 62,20 54,52"
              fill="#28241e"
              stroke="#d4a853"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <polygon points="36,18 41,34 36,46 31,34" fill="#d96b38" />
            <line x1="18" y1="58" x2="54" y2="58" stroke="#d4a853" strokeWidth="2" />
            <text
              x="76"
              y="40"
              fill="#f2ede4"
              fontFamily="Cinzel, Georgia, serif"
              fontWeight="700"
              fontSize="31"
              letterSpacing="3.5"
            >
              ASHEN CROWN
            </text>
            <text
              x="78"
              y="58"
              fill="#c7bca8"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontWeight="500"
              fontSize="11.5"
              letterSpacing="3"
            >
              PAPER DIORAMA SURVIVAL
            </text>
          </svg>
        </div>

        <p className="text-sm sm:text-base text-[#cfc6b6] leading-relaxed mb-6">
          Drop into a collapsing hexagonal world. Scavenge six perilous biomes, forge fragile alliances, and fight for the two seats on the Base Camp extraction craft.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={() => {
              soundEngine.playUiClick();
              onPlay();
            }}
            className="px-6 py-3 rounded bg-[#d4a853] text-[#141311] font-semibold text-sm tracking-wide hover:bg-[#e1b967] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Play Match
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onCreateRoom();
            }}
            className="px-5 py-3 rounded border border-[#d4a853]/45 bg-[#1e1c18] text-[#f2ede4] font-medium text-sm hover:border-[#d4a853] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#d4a853]" />
            Create Room
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              onJoinRoom();
            }}
            className="px-5 py-3 rounded border border-[#a39a8b]/35 bg-[#1e1c18] text-[#f2ede4] font-medium text-sm hover:border-[#d4a853] transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogIn className="w-4 h-4 text-[#d4a853]" />
            Join Room
          </button>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="text-xs text-[#e6decb] tracking-wide pointer-events-none bg-[#141311]/78 px-3.5 py-1.5 rounded w-fit">
        WASD Move · Mouse Drag Look · Click Attack · Right-Click Block · E Interact · Tab Inventory · M Map
      </div>
    </div>
  );
};
