// Открытый магический сундук: слева рюкзак героя, справа сеть хозяина (10
// ячеек, одна на все его сундуки). На плитке рюкзака — сколько её штук ляжет в
// сундук (собранное, без купленного и изношенного), тап кладёт их — и у
// хозяина, и у чужого (30.09: положенное чужим — в сети хозяина). Хозяин: тап
// по ячейке сети забирает её часть (≤ 20), ниже — охрана. Чужой: тап по ячейке
// сети спрашивает «сколько» (QtyDialog склада), берёт, сколько влезет; блока
// охраны нет.
import { useState } from "react";
import { Backpack } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { CHEST_NET_CELLS } from "@/lib/magicChest";
import { EmptyCell, FilledCell } from "@/components/beta-raid/WarehouseCells";
import { QtyDialog } from "@/components/beta-raid/QtyDialog";
import type { Cell } from "@/components/beta-raid/warehouseGrid";
import {
  bagCells,
  movableByCell,
  netCells,
  storeQty,
} from "@/components/beta-raid/chest/chestPicks";
import { useChestNetActions } from "@/components/beta-raid/chest/useChestActions";
import { guardOf, useGuardLite } from "@/components/beta-raid/chest/chestGuard";
import { ChestGuardBlock } from "@/components/beta-raid/chest/ChestGuardBlock";
import { useChestNet } from "@/components/beta-raid/chest/useChestViews";
import { StorageMoveStatus } from "../useStorageMove";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";

export function ChestOwnerPanel({ q, r, foreign = false }: { q: number; r: number; foreign?: boolean }) {
  const t = useT();
  const net = useChestNet(q, r);
  const { put, take, busy, move } = useChestNetActions(q, r);
  const { lite } = useGuardLite(q, r);
  // Чужой берёт «сколько» — ячейка, по которой тапнули.
  const [asking, setAsking] = useState<Cell | null>(null);

  if (net.isLoading) return <ChestSpinner />;
  if (!net.data) {
    return (
      <p className="py-3 text-center text-xs text-destructive">
        {serverErrorText(net.error, t, t("braid.open_failed"))}
      </p>
    );
  }
  const d = net.data;
  const guard = guardOf(d, lite);
  const bp = d.backpack;
  const cells = bagCells(bp.stacks, bp.capacity, bp.occupied);
  const movableOf = movableByCell(cells, bp.stacks);
  const takeCell = (c: Cell, qty: number) =>
    take.mutate(
      { stackKey: c.stack.stackKey, qty, cell: c.key, sourceTotal: c.stack.count },
      { onSuccess: () => setAsking(null) },
    );

  return (
    <div className="space-y-2.5">
      <StorageMoveStatus move={move}/>
      <fieldset disabled={move.pending || move.blocked} className="grid min-w-0 grid-cols-2 gap-2.5 border-0 p-0">
        <section className="min-w-0 space-y-1">
          <h4 className="truncate text-[10px] font-semibold text-muted-foreground">
            {t("braid.wh_backpack", {
              hero: bp.heroName ?? "",
              used: bp.occupied,
              all: bp.capacity,
            })}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {cells.map((c, i) => {
              if (!c) return <EmptyCell key={`bp-e-${i}`} />;
              const movable = movableOf.get(c.key) ?? 0;
              return (
                // Без собранного (купленное) — видно, но не нажимается. grid —
                // чтобы плитка тянулась на всю ячейку сетки, как без обёртки.
                <div
                  key={c.key}
                  className={cn("grid", movable <= 0 && "pointer-events-none opacity-40")}
                >
                  <FilledCell
                    cell={c}
                    dir="in"
                    movable={movable}
                    busy={busy === `in:${c.key}`}
                    onClick={() => {
                      if (movable <= 0 || move.pending || move.blocked) return;
                      const qty = storeQty({ stackKey: c.stack.stackKey, movable }, d.slots);
                      if (qty <= 0) {
                        toast.error(t("chest.net_full"));
                        return;
                      }
                      put.mutate({ stackKey: c.stack.stackKey, qty, cell: c.key, requested: movable, sourceTotal: c.stack.count });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="min-w-0 space-y-1">
          <h4 className="truncate text-[10px] font-semibold text-gold">
            {t("chest.net_cells", { used: d.used, all: d.cells || CHEST_NET_CELLS })}
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {netCells(d.slots, d.cells || CHEST_NET_CELLS).map((c, i) =>
              c ? (
                <FilledCell
                  key={c.key}
                  cell={c}
                  own
                  dir="out"
                  busy={busy === `out:${c.key}`}
                  onClick={() => (foreign ? setAsking(c) : takeCell(c, c.units))}
                />
              ) : (
                <EmptyCell key={`net-e-${i}`} own />
              ),
            )}
          </div>
        </section>
      </fieldset>

      {!foreign && <ChestGuardBlock q={q} r={r} guard={guard} />}
      {asking && (
        <QtyDialog
          key={asking.key}
          name={asking.stack.name}
          image={asking.stack.image}
          haveKey="pchest.have"
          total={asking.stack.count}
          cell={asking.units}
          icon={Backpack}
          label={t("pchest.take")}
          tone="gold"
          busy={move.pending || move.blocked}
          onSubmit={(qty) => takeCell(asking, qty)}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
