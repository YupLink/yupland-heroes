// Сундук как склад (ПРАВИЛА §8.22): слева рюкзак героя, справа десять ячеек
// сундука — теми же плитками, что у склада и мешочка (WarehouseCells). Тап по
// плитке рюкзака — «положить», по плитке сундука — «забрать»; сколько — окно
// QtyDialog у PlainChestWindow. Пустые ячейки сундука видны — сколько влезет.
import { useLang, useT } from "@/lib/i18n";
import { PLAIN_CHEST_CELLS, type PlainChestView } from "@/lib/plainChest";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { BackpackView } from "@/server/api/beta-raid/market-backpack";
import { EmptyCell, FilledCell } from "@/components/beta-raid/WarehouseCells";
import { buildCells, type Cell } from "@/components/beta-raid/warehouseGrid";
import { netCells } from "@/components/beta-raid/chest/chestPicks";

const HEAD = "truncate text-[10px] font-semibold text-muted-foreground";

export function PlainChestGrid({
  view,
  backpack,
  busyKey,
  onPut,
  onTake,
}: {
  view: PlainChestView;
  backpack: BackpackView | undefined;
  busyKey: string | null;
  onPut: (c: Cell) => void;
  onTake: (c: Cell) => void;
}) {
  const t = useT();
  const lang = useLang();
  const name = (n: string) => localizeAssetName(n, lang);
  const stacks = (backpack?.stacks ?? []).map((s) => ({ ...s, name: name(s.name) }));
  const bpCells = backpack?.heroId
    ? buildCells(
        stacks,
        stacks.reduce((n, s) => n + s.cells, 0) + Math.max(0, backpack.capacity - backpack.occupied),
      )
    : [];
  const slots = (Array.isArray(view.slots) ? view.slots : []).map((s) => ({ ...s, name: name(s.name) }));
  const chestCells = netCells(slots, view.cells || PLAIN_CHEST_CELLS);

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <section className="min-w-0 space-y-1">
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
      <section className="min-w-0 space-y-1">
        <h4 className="truncate text-[10px] font-semibold text-gold">
          {t("pchest.cells", { used: view.used, all: view.cells || PLAIN_CHEST_CELLS })}
        </h4>
        <div className="grid grid-cols-2 gap-1.5">
          {chestCells.map((c, i) =>
            c ? (
              <FilledCell
                key={c.key}
                cell={c}
                dir="out"
                busy={busyKey === `bag:${c.key}`}
                onClick={() => onTake(c)}
              />
            ) : (
              <EmptyCell key={`pc-e-${i}`} />
            ),
          )}
        </div>
      </section>
    </div>
  );
}
