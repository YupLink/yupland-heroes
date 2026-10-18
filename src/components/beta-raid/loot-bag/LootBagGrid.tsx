// Мешочек как склад (владелец, 29.09): слева рюкзак героя, справа мешочек —
// теми же плитками, что у склада (WarehouseCells). Тап по плитке рюкзака —
// «положить», по плитке мешочка — «забрать»; сколько — окно QtyDialog у
// LootBagWindow. На плитке мешочка — сколько осталось жить ближайшей порции
// вида. У бугорка не видно ничего: ни содержимого, ни срока.
import { Timer } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { MAP_ART } from "@/lib/gameArt";
import type { LootBagView } from "@/lib/lootBag";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { EmptyCell, FilledCell } from "@/components/beta-raid/WarehouseCells";
import { buildCells, type Cell } from "@/components/beta-raid/warehouseGrid";
import { bagCells, leftLabel } from "@/components/beta-raid/loot-bag/lootBagPick";

const HEAD = "truncate text-[10px] font-semibold text-muted-foreground";

/** «осталось N ч» — у плитки мешочка и у бугорка. */
function Left({ leftMs, gotAt, now, className }: {
  leftMs: number;
  gotAt: number;
  now: number;
  className: string;
}) {
  const t = useT();
  const l = leftLabel(leftMs, gotAt, now);
  if (!l) return null;
  return (
    <span className={className}>
      <Timer className="h-2.5 w-2.5 shrink-0" />
      {t(l.key, l.params)}
    </span>
  );
}

export function LootBagGrid({
  bag,
  backpack,
  gotAt,
  now,
  busyKey,
  onPut,
  onTake,
}: {
  bag: LootBagView;
  backpack: BackpackView | undefined;
  gotAt: number;
  now: number;
  busyKey: string | null;
  onPut: (c: Cell) => void;
  onTake: (c: Cell) => void;
}) {
  const t = useT();
  const lang = useLang();
  const name = (n: string) => localizeAssetName(n, lang);

  // Бугорок — только картинка: по нему не видно ни что закопано (мешочек или
  // сундук, ПРАВИЛА §8.22), ни сколько ему жить (бугорок сундука не сгорает).
  if (bag.buried) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        <img src={MAP_ART.lootMound} alt="" className="h-20 w-20 object-contain" />
      </div>
    );
  }

  const left = new Map(bag.items.map((i) => [i.stackKey, i.leftMs]));
  const stacks = (backpack?.stacks ?? []).map((s) => ({ ...s, name: name(s.name) }));
  const bpCells = backpack?.heroId
    ? buildCells(
        stacks,
        stacks.reduce((n, s) => n + s.cells, 0) + Math.max(0, backpack.capacity - backpack.occupied),
      )
    : [];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <section className="space-y-1">
        <h4 className={HEAD}>
          {backpack?.heroId
            ? t("braid.wh_backpack", {
                hero: backpack.heroName ?? "",
                used: backpack.occupied,
                all: backpack.capacity,
              })
            : t("braid.wh_no_hero")}
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          {bpCells.map((c, i) =>
            c ? (
              <FilledCell
                key={c.key}
                cell={c}
                dir="in"
                busy={busyKey === `bp:${c.key}`}
                onClick={() => onPut(c)}
              />
            ) : (
              <EmptyCell key={`bp-e-${i}`} />
            ),
          )}
        </div>
      </section>
      <section className="space-y-1">
        <h4 className={HEAD}>{t("bag.title")}</h4>
        <div className="grid grid-cols-2 gap-1.5">
          {bagCells(bag.items, name).map((c) => (
            <div key={c.key} className="relative">
              <FilledCell
                cell={c}
                dir="out"
                busy={busyKey === `bag:${c.key}`}
                onClick={() => onTake(c)}
              />
              <Left
                leftMs={left.get(c.stack.stackKey) ?? 0}
                gotAt={gotAt}
                now={now}
                className="pointer-events-none absolute bottom-3.5 left-0.5 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-1 text-[9px] font-bold tabular-nums text-amber-300"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
