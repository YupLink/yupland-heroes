// Кнопка карты мира — первый кружок под миникартой.
//
// Есть только у того, у кого у выбранного героя в рюкзаке целая штука товара
// «Карта» (владелец, 05.10.2026: «просто этой кнопки быть не должно, пока не
// задастся такая функция»): без предмета кружка нет ни у кого — ни у владельца,
// ни у админа. С предметом — «Разведанное», админу ещё и «Вся карта»
// (worldMapAccess — то же правило, что у сервера). Права админа — у сессии
// (ADMIN_WALLETS, PAYOUTS_ADMIN_WALLETS), предмет — в рюкзаке: тот же кэш, что у
// значка инструмента. Купил, выбросил, продал, сменил героя — рюкзак
// перечитывается (invalidateBackpack, invalidateHeroQueries), и кружок
// появляется или пропадает сам, а открытое окно закрывается.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { hasMapIn, worldMapAccess } from "@/lib/raid/worldMapAccess";
import { WorldMapOverlay } from "./WorldMapOverlay";

export function WorldMapButton({
  heroQ,
  heroR,
  castle,
  onPick,
}: {
  heroQ: number | null;
  heroR: number | null;
  castle: { q: number; r: number };
  /** Камера рейда к выбранной точке — тот же вызов, что у тапа по миникарте. */
  onPick: (q: number, r: number) => void;
}) {
  const t = useT();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const bp = useQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack() });
  const access = worldMapAccess({
    owner: session.data?.isPayoutsAdmin === true,
    admin: session.data?.isAdmin === true,
    hasMapItem: hasMapIn(bp.data?.stacks),
  });
  const [open, setOpen] = useState(false);
  // Карта ушла из рюкзака — окно закрыто и само не откроется, когда она вернётся.
  if (!access.seen && open) setOpen(false);
  if (!access.seen) return null;
  const label = t("wmap.title");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border-2 border-gold/70 bg-black/85 text-gold shadow-lg transition active:scale-95"
      >
        <MapIcon className="h-5 w-5" />
      </button>
      {open && (
        <WorldMapOverlay
          access={access}
          heroQ={heroQ}
          heroR={heroR}
          castle={castle}
          onClose={() => setOpen(false)}
          onPick={(q, r) => {
            setOpen(false);
            onPick(q, r);
          }}
        />
      )}
    </>
  );
}
