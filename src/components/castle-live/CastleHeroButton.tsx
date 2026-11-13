// Кружок героя в шапке замка (владелец, 26.10.2026: «в профиль героя не зайти, если
// ты в замке»): как на карте мира — окно героя (HeroQuickModal), а из него «Профиль»
// (Казна, настройки). Раньше кружок в замке вёл сразу в профиль, и окна героя в
// замке не было вовсе. Окно — порталом в body: шапка замка — свой слой (z-30), внутри
// неё окно оказалось бы под окнами и доком замка.
import { Suspense, lazy, useState } from "react";
import { createPortal } from "react-dom";
import { CastleProfileButton } from "./CastleProfileButton";

const HeroQuickModal = lazy(() =>
  import("@/components/beta-raid/HeroQuickModal").then((m) => ({ default: m.HeroQuickModal })),
);

export function CastleHeroButton({
  onProfile,
  showSatiety,
}: {
  onProfile: () => void;
  showSatiety: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CastleProfileButton onClick={() => setOpen(true)} showSatiety={showSatiety} />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <Suspense fallback={null}>
            <HeroQuickModal
              onClose={() => setOpen(false)}
              onProfile={() => {
                setOpen(false);
                onProfile();
              }}
            />
          </Suspense>,
          document.body,
        )}
    </>
  );
}
