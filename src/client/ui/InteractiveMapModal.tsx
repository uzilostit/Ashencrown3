import React from 'react';
import { X } from 'lucide-react';
import {
  BIOME_DEFINITIONS,
  OUTER_BIOMES,
  type CollapseState,
  type HelicopterState,
  type WorldPlayerState,
} from '../../shared/types.ts';
import { ARENA_RADIUS, BASE_CAMP_RADIUS } from '../../shared/worldGen.ts';
import gameConfig from '../../config/gameConfig.json' with { type: 'json' };

interface InteractiveMapModalProps {
  open: boolean;
  onClose: () => void;
  localPlayer: WorldPlayerState | null;
  allies: WorldPlayerState[];
  collapse: CollapseState;
  helicopter: HelicopterState;
}

export const InteractiveMapModal: React.FC<InteractiveMapModalProps> = ({
  open,
  onClose,
  localPlayer,
  allies,
  collapse,
  helicopter,
}) => {
  if (!open) return null;

  const size = 400;
  const center = size / 2;
  const scale = (size * 0.43) / ARENA_RADIUS;

  const sectorPath = (sectorIdx: number) => {
    const a1 = (sectorIdx * Math.PI * 2) / 6;
    const a2 = ((sectorIdx + 1) * Math.PI * 2) / 6;
    const rOuter = ARENA_RADIUS * scale;
    const rInner = BASE_CAMP_RADIUS * scale;
    const x1i = center + Math.cos(a1) * rInner;
    const y1i = center + Math.sin(a1) * rInner;
    const x1o = center + Math.cos(a1) * rOuter;
    const y1o = center + Math.sin(a1) * rOuter;
    const x2o = center + Math.cos(a2) * rOuter;
    const y2o = center + Math.sin(a2) * rOuter;
    const x2i = center + Math.cos(a2) * rInner;
    const y2i = center + Math.sin(a2) * rInner;
    return `M ${x1i} ${y1i} L ${x1o} ${y1o} L ${x2o} ${y2o} L ${x2i} ${y2i} Z`;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#141311]/82">
      <div className="w-full max-w-2xl bg-[#1a1815] border border-[#d4a853]/35 rounded-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#d4a853]/20 mb-4">
          <div>
            <h2 className="font-display text-lg tracking-wider text-[#f2ede4]">HEXAGONAL ARENA SURVEY</h2>
            <p className="text-xs text-[#a39a8b]">Live server-authoritative biome collapse & extraction map</p>
          </div>
          <button
            type="button"
            aria-label="Close map"
            onClick={onClose}
            className="w-9 h-9 rounded border border-[#a39a8b]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-8 flex justify-center">
            <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[360px] h-auto bg-[#141311] rounded-lg border border-[#a39a8b]/20">
              {OUTER_BIOMES.map((bId, idx) => {
                const def = BIOME_DEFINITIONS[bId];
                const isCollapsed = collapse.collapsedBiomes.includes(bId);
                const isWarning = collapse.warningBiome === bId;
                const fill = isCollapsed ? '#4b1f1a' : isWarning ? '#7b3c22' : def.groundColor;
                const midAngle = ((idx + 0.5) * Math.PI * 2) / 6;
                const labelR = (BASE_CAMP_RADIUS + ARENA_RADIUS) * 0.5 * scale;

                return (
                  <g key={bId}>
                    <path
                      d={sectorPath(idx)}
                      fill={fill}
                      fillOpacity={isCollapsed ? 0.55 : 0.72}
                      stroke={isWarning ? '#d96b38' : '#d4a853'}
                      strokeOpacity={isWarning ? 0.95 : 0.35}
                      strokeWidth={isWarning ? 2.5 : 1}
                    />
                    <text
                      x={center + Math.cos(midAngle) * labelR}
                      y={center + Math.sin(midAngle) * labelR}
                      textAnchor="middle"
                      fill="#f2ede4"
                      fontSize="9.5"
                      fontWeight="600"
                    >
                      {def.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}

              {/* Base Camp Neutral Center */}
              <circle
                cx={center}
                cy={center}
                r={BASE_CAMP_RADIUS * scale}
                fill="#5c5346"
                stroke="#d4a853"
                strokeWidth="2"
              />
              <text x={center} y={center + 14} textAnchor="middle" fill="#d4a853" fontSize="8.5" fontWeight="700">
                BASE CAMP
              </text>

              {/* Helipad Marker */}
              <circle
                cx={center + gameConfig.world.helipadPos.x * scale}
                cy={center + gameConfig.world.helipadPos.z * scale}
                r="7"
                fill={helicopter.phase === 'landed' ? '#83c987' : '#d96b38'}
                stroke="#f2ede4"
                strokeWidth="1.5"
              />
              <text
                x={center + gameConfig.world.helipadPos.x * scale}
                y={center + gameConfig.world.helipadPos.z * scale + 3}
                textAnchor="middle"
                fill="#141311"
                fontSize="8"
                fontWeight="800"
              >
                H
              </text>

              {/* Allies */}
              {allies.map((ally) => (
                <circle
                  key={ally.id}
                  cx={center + ally.x * scale}
                  cy={center + ally.z * scale}
                  r="4.5"
                  fill="#83c987"
                  stroke="#141311"
                  strokeWidth="1.5"
                />
              ))}

              {/* Local Player */}
              {localPlayer && (
                <circle
                  cx={center + localPlayer.x * scale}
                  cy={center + localPlayer.z * scale}
                  r="5.5"
                  fill="#d4a853"
                  stroke="#141311"
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs">
            <div className="p-3 rounded bg-[#211e1a] border border-[#a39a8b]/20">
              <div className="text-[#a39a8b] uppercase tracking-wider mb-1">Legend</div>
              <div className="space-y-1.5 text-[#f2ede4]">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#d4a853]" /> You</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#83c987]" /> Allies</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#d96b38]" /> Helipad (H)</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#7b3c22]" /> Collapse Warning</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#4b1f1a]" /> Collapsed Zone</div>
              </div>
            </div>
            <div className="p-3 rounded bg-[#211e1a] border border-[#a39a8b]/20">
              <div className="text-[#a39a8b] uppercase tracking-wider mb-1">Safe Regions</div>
              <p className="text-[#f2ede4]">
                Base Camp remains neutral throughout the match. {6 - collapse.collapsedBiomes.length} outer biome(s) remain open.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
