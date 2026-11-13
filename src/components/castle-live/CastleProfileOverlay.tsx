// Профиль поверх карты мира (владелец, 07.10.2026: «доступ к профилю всегда»):
// тот же профиль, что в замке, а Казна — внутри него. Кнопка — в правом
// верхнем углу карты мира (castleMode), окно — на весь экран над картой.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { CastleProfile } from "./CastleProfile";
import { TreasuryScreen } from "./TreasuryScreen";
import { BarracksScreen } from "@/components/chips/castle-barracks/BarracksScreen";

export function CastleProfileOverlay({ ru, onClose, onOpenTavern, initialGiftPack }: { ru: boolean; onClose: () => void; onOpenTavern?: (kind?: "hero" | "artifact") => void; initialGiftPack?: { giftId: string; packId: string } | null }) {
  const navigate = useNavigate();
  const [view, setView] = useState<"profile" | "treasury" | "packs">(initialGiftPack ? "packs" : "profile");
  const [giftPack, setGiftPack] = useState(initialGiftPack ?? null);
  const [focusPacksOnReturn, setFocusPacksOnReturn] = useState(false);
  const returnToProfile = () => { setGiftPack(null); setFocusPacksOnReturn(true); setView("profile"); };
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="castle-window-title"
      className="castle-profile-window fixed inset-0 z-[140] flex flex-col bg-background text-foreground"
    >
      {view === "treasury" ? (
        <TreasuryScreen onBack={() => setView("profile")} />
      ) : view === "packs" ? (
        <div className="barracks-window-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl">
            <BarracksScreen onClose={returnToProfile} onInitialPacksBack={returnToProfile} onTavern={() => onOpenTavern?.()} onViewMysticReward={onOpenTavern ? kind => onOpenTavern(kind) : undefined} initialPage="packs" giftPack={giftPack} />
          </div>
        </div>
      ) : (
        <>
          <header className="flex shrink-0 items-center gap-3 border-b p-3 pt-[max(12px,var(--app-top,env(safe-area-inset-top,0px)))]">
            <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border px-3" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {ru ? "Карта" : "Map"}
            </button>
            <h1 id="castle-window-title" className="font-bold">
              {ru ? "Профиль" : "Profile"}
            </h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-3xl">
              <CastleProfile
                onTreasury={() => { setFocusPacksOnReturn(false); setView("treasury"); }}
                onOpenPacks={() => setView("packs")}
                focusPacksOnMount={focusPacksOnReturn}
                onSignedOut={() => void navigate({ to: "/" })}
                onEdit={() => void navigate({ to: "/castle-editor", search: {} })}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
