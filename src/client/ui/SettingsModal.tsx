import React from 'react';
import { X } from 'lucide-react';
import type { AudioVolumes } from '../audio/soundEngine.ts';
import type { QualityLevel } from '../world/GameEngine.ts';

interface SettingsModalProps {
  open: boolean;
  tab: 'settings' | 'about';
  onClose: () => void;
  quality: QualityLevel;
  setQuality: (q: QualityLevel) => void;
  resScale: number;
  setResScale: (v: number) => void;
  sensitivity: number;
  setSensitivity: (v: number) => void;
  touchMode: 'auto' | 'always' | 'off';
  setTouchMode: (m: 'auto' | 'always' | 'off') => void;
  volumes: AudioVolumes;
  setVolumes: (v: Partial<AudioVolumes>) => void;
  inMatch?: boolean;
  onLeaveMatch?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  tab,
  onClose,
  quality,
  setQuality,
  resScale,
  setResScale,
  sensitivity,
  setSensitivity,
  touchMode,
  setTouchMode,
  volumes,
  setVolumes,
  inMatch,
  onLeaveMatch,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#141311]/85 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#1a1815] border border-[#d4a853]/35 rounded-xl p-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[#d4a853]/20 mb-4">
          <h2 className="font-display text-lg tracking-wider text-[#f2ede4]">
            {tab === 'about' ? 'ABOUT ASHEN CROWN' : 'SETTINGS & AUDIO'}
          </h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="w-9 h-9 rounded border border-[#a39a8b]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {tab === 'about' ? (
          <div className="space-y-3 text-xs sm:text-sm text-[#cfc6b6] leading-relaxed">
            <p>
              <strong>ASHEN CROWN</strong> is a real-time, server-authoritative 3D papercraft survival battleground for 2–15 players.
            </p>
            <div className="p-3 rounded bg-[#211e1a] border border-[#a39a8b]/20 space-y-1 text-xs">
              <div className="text-[#d4a853] font-semibold uppercase tracking-wider mb-1">Desktop &amp; Mobile Controls</div>
              <div>WASD / Left Joystick — Move · Shift — Sprint · C — Crouch · Space — Jump</div>
              <div>Mouse Drag / Right Touch Zone — Look · Scroll / +/- — Camera Zoom</div>
              <div>Left Click / Attack — Strike or Fire · Right Click / Q — Block</div>
              <div>E / F — Loot, Ignite Helipad Flare, or Board Extraction Helicopter</div>
              <div>Tab — Inventory · M — Interactive Arena Map · Esc — Settings</div>
            </div>
            <p className="text-xs text-[#a39a8b]">
              Five of the six outer biomes collapse in sequence while Base Camp remains neutral. Survive as the last contestant or escape on one of the two helicopter seats.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="quality-select" className="block text-[#cfc6b6] mb-1">
                  Graphics Quality
                </label>
                <select
                  id="quality-select"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as QualityLevel)}
                  className="w-full px-3 py-2 rounded bg-[#141311] border border-[#a39a8b]/30 text-[#f2ede4]"
                >
                  <option value="low">Low (Mobile Saver)</option>
                  <option value="medium">Medium (Balanced)</option>
                  <option value="high">High (Crisp Diorama)</option>
                </select>
              </div>
              <div>
                <label htmlFor="touch-mode-select" className="block text-[#cfc6b6] mb-1">
                  Mobile Touch Controls
                </label>
                <select
                  id="touch-mode-select"
                  value={touchMode}
                  onChange={(e) => setTouchMode(e.target.value as 'auto' | 'always' | 'off')}
                  className="w-full px-3 py-2 rounded bg-[#141311] border border-[#a39a8b]/30 text-[#f2ede4]"
                >
                  <option value="auto">Auto (Touch / Tablet)</option>
                  <option value="always">Always Visible</option>
                  <option value="off">Hidden</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[#cfc6b6] mb-1">
                <span>Resolution Scale</span>
                <span className="font-mono-tabular text-[#d4a853]">{Math.round(resScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.2}
                step={0.1}
                value={resScale}
                onChange={(e) => setResScale(Number(e.target.value))}
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div>
              <div className="flex justify-between text-[#cfc6b6] mb-1">
                <span>Camera Sensitivity</span>
                <span className="font-mono-tabular text-[#d4a853]">{sensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.1}
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full accent-[#d4a853]"
              />
            </div>

            <div className="border-t border-[#a39a8b]/20 pt-3 space-y-2.5">
              <div className="text-[#d4a853] uppercase tracking-wider font-semibold">Audio Mixer</div>
              {(
                [
                  ['master', 'Master Volume'],
                  ['music', 'Biome Ambience'],
                  ['sfx', 'Sound Effects'],
                  ['voice', 'Proximity Voice'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <div className="flex justify-between text-[#cfc6b6] mb-0.5">
                    <span>{label}</span>
                    <span className="font-mono-tabular">{Math.round(volumes[key] * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volumes[key]}
                    onChange={(e) => setVolumes({ [key]: Number(e.target.value) })}
                    className="w-full accent-[#d4a853]"
                  />
                </div>
              ))}
            </div>

            {inMatch && onLeaveMatch && (
              <div className="pt-3 border-t border-[#a39a8b]/20 flex justify-between items-center">
                <button
                  type="button"
                  onClick={onLeaveMatch}
                  className="px-4 py-2 rounded border border-[#d96b38]/60 text-[#f2b5a4] hover:bg-[#d96b38]/20 cursor-pointer"
                >
                  Leave Match
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded bg-[#d4a853] text-[#141311] font-semibold cursor-pointer"
                >
                  Resume
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
