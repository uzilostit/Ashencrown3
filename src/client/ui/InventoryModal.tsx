import React from 'react';
import { X, Shield, Swords, Package } from 'lucide-react';
import { ITEM_CATALOG, type WorldPlayerState } from '../../shared/types.ts';
import { soundEngine } from '../audio/soundEngine.ts';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  player: WorldPlayerState | null;
  onUseOrEquip: (itemId: string) => void;
  onDrop: (itemId: string) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  open,
  onClose,
  player,
  onUseOrEquip,
  onDrop,
}) => {
  if (!open || !player) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#141311]/82">
      <div className="w-full max-w-2xl bg-[#1a1815] border border-[#d4a853]/35 rounded-xl p-5 shadow-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-[#d4a853]/20 mb-4">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-[#d4a853]" />
            <div>
              <h2 className="font-display text-lg tracking-wider text-[#f2ede4]">SATCHEL &amp; EQUIPMENT</h2>
              <p className="text-xs text-[#a39a8b]">{player.inventory.length} / 12 slots occupied</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close inventory"
            onClick={onClose}
            className="w-9 h-9 rounded border border-[#a39a8b]/30 flex items-center justify-center text-[#f2ede4] hover:border-[#d4a853] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex-1 min-w-[180px] p-3 rounded bg-[#211e1a] border border-[#d4a853]/25 flex items-center gap-2.5">
            <Swords className="w-4 h-4 text-[#d4a853]" />
            <div>
              <div className="text-[#a39a8b]">Equipped Weapon</div>
              <div className="font-semibold text-[#f2ede4]">
                {ITEM_CATALOG[player.equippedWeaponId]?.name || 'Ceremonial Dagger'}
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-[180px] p-3 rounded bg-[#211e1a] border border-[#a39a8b]/25 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-[#8cb8d6]" />
            <div>
              <div className="text-[#a39a8b]">Defensive Mantle</div>
              <div className="font-semibold text-[#f2ede4]">
                {player.equippedDefenseId ? ITEM_CATALOG[player.equippedDefenseId]?.name : 'None Equipped'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto ashen-scroll pr-1">
          {player.inventory.map((slot) => {
            const def = ITEM_CATALOG[slot.itemId];
            if (!def) return null;
            const isEquipped =
              player.equippedWeaponId === slot.itemId || player.equippedDefenseId === slot.itemId;
            const actionLabel =
              def.category === 'weapon' || def.category === 'defense'
                ? isEquipped
                  ? 'Equipped'
                  : 'Equip'
                : def.category === 'ammo' || def.category === 'utility' && slot.itemId === 'flare_charge'
                  ? 'Passive'
                  : 'Use';

            return (
              <div
                key={slot.itemId}
                className={`p-3 rounded-lg border flex flex-col justify-between gap-2 ${
                  isEquipped
                    ? 'bg-[#26231c] border-[#d4a853]/65'
                    : 'bg-[#211e1a] border-[#a39a8b]/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-[#f2ede4]">{def.name}</span>
                    <span className="font-mono-tabular text-xs font-semibold text-[#d4a853]">
                      ×{slot.quantity}
                    </span>
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-[#a39a8b] mt-0.5">
                    {def.category}
                    {def.protected ? ' · Protected' : ''}
                  </div>
                  <p className="text-xs text-[#cfc6b6] mt-1.5 leading-snug">{def.description}</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  {actionLabel !== 'Passive' && (
                    <button
                      type="button"
                      disabled={isEquipped}
                      onClick={() => {
                        soundEngine.playUiClick();
                        onUseOrEquip(slot.itemId);
                      }}
                      className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                        isEquipped
                          ? 'bg-[#2f2b23] text-[#d4a853] cursor-default'
                          : 'bg-[#d4a853] text-[#141311] hover:bg-[#e1b967]'
                      }`}
                    >
                      {actionLabel}
                    </button>
                  )}
                  {!def.protected && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playUiClick();
                        onDrop(slot.itemId);
                      }}
                      className="px-3 py-1.5 rounded text-xs border border-[#a39a8b]/30 text-[#cfc6b6] hover:border-[#d96b38] hover:text-[#f2ede4] cursor-pointer"
                    >
                      Drop
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
