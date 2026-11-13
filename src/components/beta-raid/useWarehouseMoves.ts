// Перекладывание между рюкзаком и складом: окно «сколько», запросы и спиннер
// на плитке. Вынесено из WarehouseAction ради лимита ≤250 строк.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { qtyText } from "@/lib/qtyPick";
import { transferQty } from "@/lib/storageTransfer";
import { useStorageMove } from "./useStorageMove";
import type { DepositScope } from "@/lib/warehouseCells";
import type { WarehousePick } from "./warehousePick";
import type { WarehouseApi } from "./warehouseApi";

export function useWarehouseMoves(api: WarehouseApi, scope: DepositScope) {
  const lang = useLang(), t = useT(), qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<WarehousePick | null>(null);
  const submitted = useRef(false);
  const refresh = async () => {
    await Promise.all([api.key, ["my-hero-backpack"], ["beta-raid-warehouse-badges"], ["my-warehouses"]]
      .map(queryKey => qc.invalidateQueries({ queryKey }, { throwOnError: true })));
  };
  const move = useStorageMove(lang, refresh, e => humanError(e));
  const submit = (qty: number) => {
    if (!pick || submitted.current || move.pending || move.blocked) return;
    submitted.current = true;
    const selected = pick;
    let details = '';
    setBusy(selected.busyKey);
    void move.run({
      requested: qty, sourceTotal: selected.total,
      source: selected.mode === "put" ? "backpack" : "warehouse",
      details: () => details,
      send: async () => {
        if (selected.mode === "take") {
          const res = await api.take({ stackKey: selected.stackKey, qty, scope: selected.scope ?? "shared" });
          return res.qty;
        }
        const res = await api.store({ scope, stackKey: selected.stackKey, qty });
        if (api.shared) details = t('braid.wh_stored', { own: qtyText(res.own, lang), shared: qtyText(res.shared, lang) });
        return transferQty(res.own + res.shared);
      },
      done: () => setPick(null),
    }).finally(() => { submitted.current = false; setBusy(null); });
  };
  return {
    busy, pick,
    open: (next: WarehousePick | null) => { if (!submitted.current && !move.pending && !move.blocked) setPick(next); },
    close: () => { if (!submitted.current) setPick(null); },
    submit, pending: move.pending,
  };
}
