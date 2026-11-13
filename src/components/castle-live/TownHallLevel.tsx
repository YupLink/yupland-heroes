// Ратуша замка → её уровень (ПРАВИЛА §8.64): 9 уровней, лимит купленных зданий
// 8 → 64 (+7 за уровень). Карточка — уровень, занято мест, цена следующего и
// «Улучшить». Ресурсы — общий кэш (как у Архитектора): после обмена в банке
// цена перестаёт гореть красным сразу. Правила — lib/townHall.ts.
import { Hammer, Landmark, Loader2 } from "lucide-react";
import { TOWN_HALL_RES, type TownHallRes } from "@/lib/townHall";
import { useResources } from "@/lib/hooks/useResources";
import { RES_ICON } from "./architect/architectIcons";
import { useTownHall, useUpgradeTownHall } from "./useTownHall";

export function TownHallLevel({ ru }: { ru: boolean }) {
  const q = useTownHall();
  const res = useResources().data;
  const up = useUpgradeTownHall(ru);
  const t = q.data;
  if (!t) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const have: Record<string, number> = res ?? t.resources;
  const cost = t.cost;
  const short = (k: TownHallRes) => !!cost && (have[k] ?? 0) < cost[k];
  const fmt = (n: number) => n.toLocaleString(ru ? "ru-RU" : "en-US");
  return (
    <section className="town-hall-build" aria-label={ru ? "Ратуша" : "Town Hall"}>
      <div className="town-hall-build__looks">
        <Landmark className="h-12 w-12 text-[#e9b858]" aria-hidden="true" />
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Ратуша" : "Town Hall"}</h2>
        <p>
          <b>
            {ru ? "ур." : "Lv"} {t.level}/{t.maxLevel}
          </b>
          <span>
            {ru ? "зданий" : "buildings"}: {t.slots.used}/{t.slots.limit}
            {t.slots.nextLimit !== null && ` → ${t.slots.nextLimit}`}
          </span>
        </p>
      </div>
      {cost && (
        <>
          <div className="town-hall-build__cost">
            {TOWN_HALL_RES.filter((k) => cost[k] > 0).map((k) => (
              <span key={k} className={short(k) ? "town-hall-build__lack" : undefined}>
                <img src={RES_ICON[k]} alt="" />
                {fmt(cost[k])}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={up.isPending || TOWN_HALL_RES.some(short)}
            onClick={() => up.mutate(t.level)}
          >
            {up.isPending ? (
              <Loader2 className="town-hall-build__spin animate-spin" />
            ) : (
              <Hammer aria-hidden="true" />
            )}
            {ru ? "Улучшить" : "Upgrade"}
          </button>
        </>
      )}
    </section>
  );
}
