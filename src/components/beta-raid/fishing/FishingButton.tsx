// Рыбалка в ряду кнопок героя над картой (ПРАВИЛА §8.35), рядом со значком
// основного инструмента:
//  • заброшено здесь — плашка с отсчётом до ответа; тап — окно рыбалки с
//    «Хватит»;
//  • герой на берегу (своя клетка — суша, соседняя — вода) и удочка в руках
//    (или она одна, а руки пусты) — «Забросить»;
//  • на берегу, удочка есть, но в руках другое — «Взять <Удочка>» (§8.24);
//  • на острове новичка без удочки — «Ловить руками» (HandFishButton);
//  • иначе — ничего: без удочки и вдали от воды кнопки нет.
// Отсчёт тикает сам; улов, конец рыбалки и прочность удочки приходят без F5
// (useFishing перечитывает состояние и рюкзак).
import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Fish, Hand, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { leftClock } from "@/lib/raid/fishing";
import { useMainTool } from "@/components/beta-raid/tool/useMainTool";
import { useFishing } from "@/components/beta-raid/fishing/useFishing";
import { shoreAt, useRaidMapCache } from "@/components/beta-raid/fishing/shoreAt";
import { FishingCard } from "@/components/beta-raid/fishing/FishingCard";
import { FishingCastCard } from "@/components/beta-raid/fishing/FishingCastCard";
import { HandFishButton } from "@/components/beta-raid/fishing/HandFishButton";
import { useIsland } from "@/components/beta-raid/island/useIsland";
import { useOnIsland } from "@/components/beta-raid/useEnergyMult";
import { getFishingPlan } from "@/server/api/beta-raid/fishing/fishing";
import { getSession } from "@/server/api/user-auth";
import { FISHING_ADMIN_ONLY } from "@/lib/featureGates";

const PILL =
  "raid-fishing-cast flex h-11 items-center gap-1.5 rounded-full border-2 border-gold/70 bg-black/85 px-3 text-sm font-bold text-gold shadow-lg transition active:scale-95 disabled:opacity-60";
const ROUND = "raid-fishing-hook transition active:scale-95 disabled:opacity-60";

/** Часы, которые тикают раз в секунду, пока идёт отсчёт. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

function FishingButtonView({ q, r }: { q: number | null; r: number | null }) {
  const t = useT();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  // Замок «только админам» (featureGates) включён — игрок кнопки не видит.
  const allowed = !FISHING_ADMIN_ONLY || session.data?.isAdmin === true;
  const tool = useMainTool();
  const map = useRaidMapCache();
  const pos = q != null && r != null ? { q, r } : null;
  const shore = useMemo(() => q != null && r != null && shoreAt(map, q, r), [map, q, r]);
  const hasRod = allowed && tool.stacks.some((s) => s.rod === true && s.count >= 1);
  const rod = tool.main?.rod === true ? tool.main : null;
  const fish = useFishing(pos, hasRod, rod?.stackKey ?? null);
  const onIsland = useOnIsland();
  const island = useIsland(onIsland, onIsland).data?.island;
  // Shore fishing is a free island action; keep the first chest walk focused.
  const handFishingReady = !!island && (island.skipped || island.done.includes("chest"));
  const [open, setOpen] = useState(false);
  // Окно заброса: на сколько минут закидываем. План (попытки удочек, потолок
  // минут) спрашиваем только когда окно открыто — лишних запросов не держим.
  const [cast, setCast] = useState(false);
  const plan = useQuery({
    queryKey: ["beta-fishing-plan"],
    queryFn: () => getFishingPlan(),
    enabled: cast,
    staleTime: 0,
  });
  // Ответ пришёл — окно закрыть: следующий заброс откроет его только тапом.
  useEffect(() => {
    if (!fish.here) setOpen(false);
  }, [fish.here]);
  // Заброшено — окно заброса закрыть: дальше кнопка показывает отсчёт.
  useEffect(() => {
    if (fish.here) setCast(false);
  }, [fish.here]);
  const now = useNow(fish.here);
  const left = fish.dueAt === null ? null : Math.max(0, fish.dueAt - now);

  if (fish.here) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("fish.title")}
          title={t("fish.title")}
          className={PILL}
        >
          <Fish className="h-4 w-4 shrink-0 animate-pulse" />
          <span className="tabular-nums">{left === null ? "…" : leftClock(left)}</span>
          {fish.view.caught > 0 && (
            <span className="text-xs tabular-nums text-white/85">×{fish.view.caught}</span>
          )}
        </button>
        {open && (
          <FishingCard
            rod={rod}
            caught={fish.view.caught}
            tries={fish.view.tries}
            plan={fish.view.plan}
            leftMs={left}
            busy={fish.busy}
            onStop={() => {
              fish.stop();
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  if (!shore) return null;
  // Удочки нет — на острове новичка ловят руками (lib/raid/handFish).
  if (!hasRod) return allowed && onIsland && handFishingReady ? <HandFishButton /> : null;
  const pick = tool.pick({ kind: "rod" });
  if (!pick.ok && pick.why === "none") return null;
  // A rod in hand gets the compact cast action; otherwise offer to equip it first.
  const take = rod ? null : pick.ok ? pick.key : pick.why === "idle" ? pick.key : null;
  const busy = fish.busy || tool.busy;
  return (
    <>
      {cast && (
        <FishingCastCard
          plan={plan.data ?? null}
          loading={plan.isLoading}
          busy={fish.busy}
          onCast={(minutes) => fish.start(minutes)}
          onClose={() => setCast(false)}
        />
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => (take ? tool.take(take) : setCast(true))}
        className={take ? PILL : ROUND}
        aria-label={take ? t("tool.take", { tool: tool.nameOf(take) }) : t("fish.start")}
        title={take ? undefined : t("fish.start")}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : take ? (
          <Hand className="h-4 w-4" />
        ) : (
          <img src="/resources/raid-hud-art-hook.webp" alt="" />
        )}
        {take && (
          <span className="max-w-[9rem] truncate">
            {t("tool.take", { tool: tool.nameOf(take) })}
          </span>
        )}
      </button>
    </>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const FishingButton = memo(FishingButtonView);
