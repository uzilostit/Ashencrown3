import React, { useRef, useState } from 'react';
import { Swords, Shield, ArrowUp, Backpack, Hand, ZoomIn, ZoomOut } from 'lucide-react';

interface MobileControlsProps {
  visible: boolean;
  onJoystick: (x: number, y: number) => void;
  onCameraDelta: (dx: number, dy: number) => void;
  onSprintChange: (v: boolean) => void;
  onCrouchChange: (v: boolean) => void;
  onBlockChange: (v: boolean) => void;
  onJump: () => void;
  onAttack: () => void;
  onInteract: () => void;
  onOpenInventory: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasInteractPrompt: boolean;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  visible,
  onJoystick,
  onCameraDelta,
  onSprintChange,
  onCrouchChange,
  onBlockChange,
  onJump,
  onAttack,
  onInteract,
  onOpenInventory,
  onZoomIn,
  onZoomOut,
  hasInteractPrompt,
}) => {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [sprinting, setSprinting] = useState(false);
  const [crouching, setCrouching] = useState(false);
  const joyPointerId = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });
  const camPointerId = useRef<number | null>(null);
  const camLast = useRef({ x: 0, y: 0 });

  if (!visible) return null;

  const maxJoyRadius = 42;

  return (
    <div
      data-testid="mobile-controls"
      className="fixed inset-0 z-20 pointer-events-none select-none touch-none"
      style={{
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
        paddingBottom: 'var(--safe-bottom)',
      }}
    >
      {/* Right-side transparent camera drag region */}
      <div
        aria-label="Camera look area"
        className="absolute right-0 top-14 bottom-0 w-1/2 pointer-events-auto touch-none"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget) return;
          camPointerId.current = e.pointerId;
          camLast.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (camPointerId.current !== e.pointerId) return;
          const dx = e.clientX - camLast.current.x;
          const dy = e.clientY - camLast.current.y;
          camLast.current = { x: e.clientX, y: e.clientY };
          onCameraDelta(dx, dy);
        }}
        onPointerUp={(e) => {
          if (camPointerId.current === e.pointerId) {
            camPointerId.current = null;
          }
        }}
        onPointerCancel={() => {
          camPointerId.current = null;
        }}
      />

      {/* Left Virtual Joystick */}
      <div
        aria-label="Movement joystick"
        className="absolute left-4 bottom-5 sm:left-6 sm:bottom-6 w-28 h-28 rounded-full border-2 border-[#d4a853]/45 bg-[#141311]/55 pointer-events-auto touch-none flex items-center justify-center"
        onPointerDown={(e) => {
          e.stopPropagation();
          joyPointerId.current = e.pointerId;
          const rect = e.currentTarget.getBoundingClientRect();
          joyOrigin.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (joyPointerId.current !== e.pointerId) return;
          const dx = e.clientX - joyOrigin.current.x;
          const dy = e.clientY - joyOrigin.current.y;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(maxJoyRadius, dist);
          const angle = Math.atan2(dy, dx);
          const kx = Math.cos(angle) * clamped;
          const ky = Math.sin(angle) * clamped;
          setKnob({ x: kx, y: ky });
          onJoystick(kx / maxJoyRadius, ky / maxJoyRadius);
        }}
        onPointerUp={(e) => {
          if (joyPointerId.current === e.pointerId) {
            joyPointerId.current = null;
            setKnob({ x: 0, y: 0 });
            onJoystick(0, 0);
          }
        }}
        onPointerCancel={() => {
          joyPointerId.current = null;
          setKnob({ x: 0, y: 0 });
          onJoystick(0, 0);
        }}
      >
        <div
          className="w-12 h-12 rounded-full bg-[#d4a853]/85 border border-[#f2ede4]/70 shadow-lg"
          style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }}
        />
      </div>

      {/* Left-above-joystick Sprint & Crouch toggles */}
      <div className="absolute left-4 bottom-36 sm:left-6 sm:bottom-38 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            const next = !sprinting;
            setSprinting(next);
            onSprintChange(next);
          }}
          className={`min-w-[54px] min-h-[44px] px-3 rounded-lg border text-xs font-semibold ${
            sprinting
              ? 'bg-[#d4a853] text-[#141311] border-[#d4a853]'
              : 'bg-[#141311]/80 text-[#f2ede4] border-[#d4a853]/35'
          }`}
        >
          Sprint
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !crouching;
            setCrouching(next);
            onCrouchChange(next);
          }}
          className={`min-w-[54px] min-h-[44px] px-3 rounded-lg border text-xs font-semibold ${
            crouching
              ? 'bg-[#d96b38] text-[#141311] border-[#d96b38]'
              : 'bg-[#141311]/80 text-[#f2ede4] border-[#d4a853]/35'
          }`}
        >
          Crouch
        </button>
      </div>

      {/* Right Action Cluster + Zoom */}
      <div className="absolute right-4 bottom-5 sm:right-6 sm:bottom-6 flex flex-col items-end gap-2.5 pointer-events-auto">
        {/* Camera Zoom & Inventory row */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={onZoomOut}
            className="w-11 h-11 rounded-lg bg-[#141311]/82 border border-[#d4a853]/35 text-[#f2ede4] flex items-center justify-center active:scale-95"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="w-11 h-11 rounded-lg bg-[#141311]/82 border border-[#d4a853]/35 text-[#f2ede4] flex items-center justify-center active:scale-95"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Inventory"
            onClick={onOpenInventory}
            className="w-11 h-11 rounded-lg bg-[#141311]/82 border border-[#d4a853]/35 text-[#f2ede4] flex items-center justify-center active:scale-95"
          >
            <Backpack className="w-4 h-4" />
          </button>
        </div>

        {/* Combat & Movement Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Interact"
            onClick={onInteract}
            className={`w-12 h-12 rounded-full border flex items-center justify-center active:scale-95 ${
              hasInteractPrompt
                ? 'bg-[#d4a853] text-[#141311] border-[#f2ede4]'
                : 'bg-[#141311]/82 text-[#f2ede4] border-[#d4a853]/35'
            }`}
          >
            <Hand className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Jump"
            onClick={onJump}
            className="w-12 h-12 rounded-full bg-[#141311]/82 border border-[#d4a853]/35 text-[#f2ede4] flex items-center justify-center active:scale-95"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Block"
            onPointerDown={() => onBlockChange(true)}
            onPointerUp={() => onBlockChange(false)}
            onPointerLeave={() => onBlockChange(false)}
            onPointerCancel={() => onBlockChange(false)}
            className="w-12 h-12 rounded-full bg-[#141311]/82 border border-[#d4a853]/35 text-[#f2ede4] flex items-center justify-center active:scale-95"
          >
            <Shield className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Attack"
            onClick={onAttack}
            className="w-14 h-14 rounded-full bg-[#d96b38] border-2 border-[#f2ede4]/60 text-[#141311] flex items-center justify-center shadow-lg active:scale-95"
          >
            <Swords className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
