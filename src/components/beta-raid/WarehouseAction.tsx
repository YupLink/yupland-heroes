// Склад: сетка ячеек как в рюкзаке. Слева — рюкзак героя, справа — склад
// (личные ячейки жёлтым и отдельной подписью, общие — обычным цветом).
//
// Кладёшь из рюкзака — сначала занимаются личные ячейки, остаток уходит на
// общую полку. Общее забирает кто угодно, своё — только ты. Тап по ячейке
// открывает окно «сколько» (QtyDialog): из рюкзака на склад, со склада — в
// рюкзак. Сами ячейки — в WarehouseCells, запросы — в useWarehouseMoves
// (лимит ≤250 строк на файл).
import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, Loader2, Warehouse } from "lucide-react";
import { useT } from "@/lib/i18n";
import { EmptyCell, FilledCell, OwnCell } from "./WarehouseCells";
import { buildCells, mergeOwn, ownCellItems } from "./warehouseGrid";
import { WarehouseScopePick } from "./WarehouseScopePick";
import { QtyDialog } from "./QtyDialog";
import { putPick, takeOwnPick, takeSharedPick } from "./warehousePick";
import { useWarehouseMoves } from "./useWarehouseMoves";
import type { DepositScope } from "@/lib/warehouseCells";
import { mapWarehouseApi, type WarehouseApi } from "./warehouseApi";
import { UpgradeOffer } from "./upgrade/UpgradeOffer";

/** Склад на клетке карты. */
export function WarehouseAction({ q, r }: { q: number; r: number }) {
  const api = useMemo(() => mapWarehouseApi(q, r), [q, r]);
  // +1 личная ячейка за алмаз, один раз (lib/accountUpgrade) — только у складов карты.
  return <WarehouseView api={api} footer={<UpgradeOffer kind="warehouse" />} />;
}

/** Окно склада: полки и рюкзак — для склада на карте и склада замка. */
export function WarehouseView({ api, footer }: { api: WarehouseApi; footer?: React.ReactNode }) {
  const t = useT();
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: api.key,
    queryFn: () => api.load(),
    refetchInterval: 30_000,
    retry: false,
    // Закрытое окно склада сутки в кэше не держим (см. lib/queryWindows.ts).
    gcTime: 60_000,
  });
  // Открытие окна доливает урожай полей в личные ячейки (settleFieldsFor-
  // Warehouse) — бейдж этого склада мог вырасти без единого тапа.
  // Один раз на первый ответ окна: обычный рефетч окна (30 с) бейдж не меняет.
  const settledOnce = useRef(false);
  useEffect(() => {
    if (!state.dataUpdatedAt || settledOnce.current) return;
    settledOnce.current = true;
    qc.invalidateQueries({ queryKey: ["beta-raid-warehouse-badges"] });
  }, [state.dataUpdatedAt, qc]);

  // Куда класть — выбор игрока, держится на время окна.
  const [scope, setScope] = useState<DepositScope>("auto");
  const moves = useWarehouseMoves(api, scope);
  const { busy, pick } = moves;

  const d = state.data;
  const bp = d?.backpack ?? null;
  // Свои ячейки = полка (бывает дробной) + «зреет» с поля, слитые в одну ячейку.
  const ownItems = d ? ownCellItems(mergeOwn(d.own, d.pending ?? [])) : [];
  const ownSlots = d ? Math.max(d.ownCells, ownItems.length) : 0;

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-secondary/20 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        {t("braid.wh_title")}
      </div>

      {state.isLoading && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            {/* ── Слева: рюкзак героя ── */}
            <section className="space-y-1">
              <h4 className="truncate text-[10px] font-semibold text-muted-foreground">
                {bp
                  ? t("braid.wh_backpack", {
                      hero: bp.heroName ?? "",
                      used: bp.occupied,
                      all: bp.capacity,
                    })
                  : t("braid.wh_no_hero")}
              </h4>
              {api.shared && <WarehouseScopePick value={scope} onChange={setScope} />}
              <div className="grid grid-cols-2 gap-1.5">
                {bp ? (
                  // Всё, что лежит (с зельями из сумки), и пустые ячейки —
                  // сколько свободно в рюкзаке.
                  buildCells(
                    bp.stacks,
                    bp.stacks.reduce((n, s) => n + s.cells, 0) +
                      Math.max(0, bp.capacity - bp.occupied),
                  ).map((c, i) =>
                    c ? (
                      <FilledCell
                        key={c.key}
                        cell={c}
                        dir="in"
                        busy={busy === `bp:${c.stack.stackKey}`}
                        onClick={() => moves.open(putPick(c))}
                      />
                    ) : (
                      <EmptyCell key={`bp-e-${i}`} />
                    ),
                  )
                ) : (
                  <p className="col-span-2 text-[10px] text-muted-foreground">
                    {t("braid.wh_no_hero")}
                  </p>
                )}
              </div>
            </section>

            {/* ── Справа: склад — личные (жёлтым) и общие ── */}
            <section className="space-y-1.5">
              <div className="space-y-1">
                <h4 className="truncate text-[10px] font-semibold text-gold">
                  {t("braid.wh_own", { used: d.ownUsed, all: d.ownCells })}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {Array.from({ length: ownSlots }).map((_, i) => {
                    const it = ownItems[i];
                    return it ? (
                      <OwnCell
                        key={it.cellKey}
                        item={it}
                        busy={busy === `own:${it.cellKey}`}
                        onTake={() => {
                          if (it.whole <= 0) return;
                          // Окно начинает с содержимого ИМЕННО этой ячейки:
                          // плитка показывает двадцать — столько и предлагаем.
                          const all = d.own.find((s) => s.stackKey === it.stackKey)?.count ?? 0;
                          moves.open(takeOwnPick(it, all));
                        }}
                      />
                    ) : (
                      <EmptyCell key={`own-e-${i}`} own />
                    );
                  })}
                </div>
              </div>

              {api.shared && (
                <div className="space-y-1">
                  <h4 className="truncate text-[10px] font-semibold text-muted-foreground">
                    {t("braid.wh_shared", { used: d.sharedUsed, all: d.sharedCells })}
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {buildCells(d.shared, d.sharedCells).map((c, i) =>
                      c ? (
                        <FilledCell
                          key={c.key}
                          cell={c}
                          dir="out"
                          busy={busy === `shared:${c.stack.stackKey}`}
                          onClick={() => moves.open(takeSharedPick(c))}
                        />
                      ) : (
                        <EmptyCell key={`sh-e-${i}`} />
                      ),
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          {api.shared && (
            <>
              <p className="text-center text-[10px] text-muted-foreground">
                {t("braid.wh_growing_hint")}
              </p>
              <p className="text-center text-[10px] text-muted-foreground">{t("braid.wh_hint")}</p>
            </>
          )}
          {footer}
        </>
      )}

      {/* Окно «сколько»: положить одну штуку, ячейку или всё — выбор игрока. */}
      {pick && (
        <QtyDialog
          key={pick.busyKey}
          name={pick.name}
          image={pick.image}
          haveKey={pick.mode === "put" ? "braid.backpack_have" : "braid.wh_have"}
          total={pick.total}
          cell={pick.cell}
          icon={pick.mode === "put" ? Warehouse : Backpack}
          label={t(pick.mode === "put" ? "braid.wh_put" : "braid.wh_take")}
          tone="gold"
          busy={moves.pending}
          onSubmit={moves.submit}
          onClose={moves.close}
        />
      )}
    </div>
  );
}
