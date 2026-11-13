// Ратуша замка → «Храм» (ПРАВИЛА §8.64): с 22.10.2026 храм покупается (вместо
// банка, который стал базовым) и занимает место в лимите зданий. Цены храма
// не менялись (§8.42). Купленный или выданный альфа-тестеру — «есть», дальше
// улучшение и молитва — в окне храма. Карточка годится и для окна храма.
import { Church, Hammer, Loader2 } from "lucide-react";
import { TOWN_HALL_RES, type TownHallRes } from "@/lib/townHall";
import { TEMPLE_KIND } from "@/lib/townHallCatalog";
import { useResources } from "@/lib/hooks/useResources";
import { RES_ICON } from "./architect/architectIcons";
import { useBuyBuilding, useTownHall } from "./useTownHall";

const NAME: [string, string] = ["Храм", "Temple"];

export function TownHallTemple({ ru }: { ru: boolean }) {
  const q = useTownHall();
  const res = useResources().data;
  const buy = useBuyBuilding(ru, NAME);
  const t = q.data;
  const offer = t?.catalog.find((c) => c.kind === TEMPLE_KIND);
  if (!t || !offer) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const owned = offer.owned > 0;
  const alpha = t.buildings.some((b) => b.kind === TEMPLE_KIND && b.source === "alpha");
  const have: Record<string, number> = res ?? t.resources;
  const short = (k: TownHallRes) => (have[k] ?? 0) < offer.cost[k];
  const why =
    offer.problem === "slot"
      ? ru
        ? "нет места — улучши Ратушу"
        : "no room — upgrade the Town Hall"
      : offer.problem === "level"
        ? ru
          ? `нужна Ратуша ур. ${offer.needLevel}`
          : `needs Town Hall Lv ${offer.needLevel}`
        : null;
  return (
    <section className="town-hall-build" aria-label={NAME[ru ? 0 : 1]}>
      <div className="town-hall-build__looks">
        <Church className="h-12 w-12 text-[#e9b858]" aria-hidden="true" />
      </div>
      <div className="town-hall-build__info">
        <h2>{NAME[ru ? 0 : 1]}</h2>
        <p>
          {owned ? (
            <b>{alpha ? (ru ? "есть · альфа-тест" : "owned · alpha test") : ru ? "есть" : "owned"}</b>
          ) : (
            <span>{why ?? (ru ? "1 место в лимите зданий" : "takes 1 building slot")}</span>
          )}
        </p>
      </div>
      {!owned && (
        <>
          <div className="town-hall-build__cost">
            {TOWN_HALL_RES.filter((k) => offer.cost[k] > 0).map((k) => (
              <span key={k} className={short(k) ? "town-hall-build__lack" : undefined}>
                <img src={RES_ICON[k]} alt="" />
                {offer.cost[k].toLocaleString(ru ? "ru-RU" : "en-US")}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={buy.isPending || offer.problem !== null || TOWN_HALL_RES.some(short)}
            onClick={() => buy.mutate(TEMPLE_KIND)}
          >
            {buy.isPending ? (
              <Loader2 className="town-hall-build__spin animate-spin" />
            ) : (
              <Hammer aria-hidden="true" />
            )}
            {ru ? "Купить" : "Buy"}
          </button>
        </>
      )}
    </section>
  );
}
