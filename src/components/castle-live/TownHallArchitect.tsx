import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
// Ратуша замка → «Архитектор» (ПРАВИЛА §8.59.7): постройка и улучшение до 4-го
// уровня ресурсами и товарами (цены задаёт админ; товары — из рюкзака выбранного
// героя). Каждый уровень открывает заготовку шахты: здесь — что откроет
// следующий. «Открыть» — окно изготовления: с 1-го уровня, у выбранного
// героя-Строителя (ему Архитектор не нужен) и у админа (правка цен в окне).
// Правила — lib/castleArchitect.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DraftingCompass, Hammer, Loader2 } from "lucide-react";
import { upgradeCastleArchitect } from "@/server/api/castle-architect/architect-state";
import { getSession } from "@/server/api/user-auth";
import { ARCHITECT_RES, type ArchitectRes } from "@/lib/castleArchitect";
import { goodsOk } from "@/lib/castleArchitectGoods";
import { blueprintLabel } from "@/lib/mineBlueprint";
import { openArchitect } from "@/lib/architectBus";
import { newOpId } from "@/lib/opId";
import { architectErrorText } from "@/lib/castleArchitectText";
import { ARCHITECT_LOOK } from "./modularArchitect";
import {
  refreshArchitectData,
  useArchitectResources,
  useCastleArchitect,
} from "./useWithArchitect";
import { RES_ICON } from "./architect/architectIcons";
import { ArchitectGoodItem } from "./architect/ArchitectGoodItem";

export function TownHallArchitect({ ru }: { ru: boolean }) {
 const purchaseSuccess=useTownHallPurchaseSuccess();
  const qc = useQueryClient();
  const q = useCastleArchitect();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const a = q.data;
  const have = useArchitectResources(a?.resources);
  const up = useMutation({
    mutationFn: () =>
      upgradeCastleArchitect({ data: { fromLevel: a?.level ?? 0, opId: newOpId() } }),
    onSuccess: (r) => {
      if(r.level===1)purchaseSuccess({kind:'building',id:'architect'});
      toast.success(
        r.level === 1
          ? ru
            ? "Архитектор рудников построен"
            : "Architect built"
          : ru
            ? `Архитектор рудников — уровень ${r.level}`
            : `Architect — level ${r.level}`,
      );
    },
    onError: (e: unknown) => toast.error(architectErrorText(e, ru)),
    onSettled: () => refreshArchitectData(qc),
  });

  if (!a) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const built = a.level > 0;
  const cost = a.cost;
  const short = (k: ArchitectRes) => !!cost && (have[k] ?? 0) < cost[k];
  const next = a.blueprints.find((b) => b.needLevel === a.level + 1);
  const goods = a.costGoods ?? [];
  const canOpen = built || a.hero?.builder === true || session.data?.isAdmin === true;

  return (
    <section className="town-hall-build" aria-label={ru ? "Архитектор рудников" : "Architect"}>
      <div className="town-hall-build__looks">
        <img className={built ? undefined : "town-hall-build__next"} src={ARCHITECT_LOOK} alt="" />
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Архитектор рудников" : "Architect"}</h2>
        <p>
          <b>
            {ru ? "ур." : "Lv"} {a.level}/{a.maxLevel}
          </b>
          {next && (
            <span>
              {ru ? "откроет" : "unlocks"}: {blueprintLabel(next.kind, ru)}
              {/* Вид закрыт («скоро») — уровень его не даст (§8.59.7). */}
              {next.problem === "soon" && (ru ? " (скоро)" : " (soon)")}
            </span>
          )}
        </p>
      </div>
      {cost && (
        <>
          <div className="town-hall-build__cost">
            {ARCHITECT_RES.filter((k) => cost[k] > 0).map((k) => (
              <span key={k} className={short(k) ? "town-hall-build__lack" : undefined}>
                <img src={RES_ICON[k]} alt="" />
                {cost[k].toLocaleString(ru ? "ru-RU" : "en-US")}
              </span>
            ))}
            {goods.map((g) => (
              <ArchitectGoodItem
                key={g.key}
                good={g}
                ru={ru}
                lackClassName="town-hall-build__lack"
                imgClassName="h-5 w-5 shrink-0 object-contain"
              />
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={up.isPending || ARCHITECT_RES.some(short) || !goodsOk(goods)}
            onClick={() => up.mutate()}
          >
            {up.isPending ? (
              <Loader2 className="town-hall-build__spin animate-spin" />
            ) : (
              <Hammer aria-hidden="true" />
            )}
            {built ? (ru ? "Улучшить" : "Upgrade") : ru ? "Построить" : "Build"}
          </button>
        </>
      )}
      {canOpen && (
        <button type="button" className="town-hall-build__go" onClick={() => openArchitect()}>
          <DraftingCompass aria-hidden="true" />
          {ru ? "Заготовки шахт" : "Mine blueprints"}
        </button>
      )}
    </section>
  );
}

/** Same authoritative price as the existing build dialog; never a copied tariff. */
export function TownHallArchitectPrice() {
  const q = useCastleArchitect();
  if (q.isPending) return <span>Загрузка цены…</span>;
  if (q.isError) return <span>Цена недоступна</span>;
  const a = q.data;
  if (!a || a.level > 0 || !a.cost) return <span>—</span>;
  const rows = ARCHITECT_RES.filter(k => a.cost![k] > 0);
  const goods = a.costGoods ?? [];
  return <>
    {rows.map(k => <span key={k} aria-label={`${k}: ${a.cost![k]}`}><img src={RES_ICON[k]} alt="" />{a.cost![k].toLocaleString("ru-RU")}</span>)}
    {goods.map(g => <ArchitectGoodItem key={g.key} good={g} ru={true} lackClassName="" imgClassName="h-5 w-5 shrink-0 object-contain" />)}
    {!rows.length && !goods.length && <span>Бесплатно</span>}
  </>;
}

