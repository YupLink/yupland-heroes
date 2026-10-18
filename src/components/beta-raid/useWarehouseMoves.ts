// Перекладывание между рюкзаком и складом: окно «сколько», запросы и спиннер
// на плитке. Вынесено из WarehouseAction ради лимита ≤250 строк.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { qtyText } from "@/lib/qtyPick";
import type { DepositScope } from "@/lib/warehouseCells";
import type { WarehousePick } from "./warehousePick";
import type { WarehouseApi } from "./warehouseApi";

export function useWarehouseMoves(api: WarehouseApi, scope: DepositScope) {
  const t = useT();
  const lang = useLang();
  // Числа в тостах — как в окне: «всё» уходит точным количеством (7,738083…).
  const n = (v: number) => qtyText(v, lang);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  // Открытое окно «сколько»: по какой плитке тапнули и что она предлагает.
  const [pick, setPick] = useState<WarehousePick | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: api.key });
    qc.invalidateQueries({ queryKey: ["my-hero-backpack"] });
    // Бейдж над складом и список «Мои склады» — сразу, без F5: SSE о складе
    // не ходит (опрос раз в минуту), а игрок только что сам всё поменял.
    qc.invalidateQueries({ queryKey: ["beta-raid-warehouse-badges"] });
    qc.invalidateQueries({ queryKey: ["my-warehouses"] });
  };
  const done = () => {
    setBusy(null);
    setPick(null);
    refresh();
  };
  // Отказ (полка полна, столько нет) окно не закрывает: поправил число — и снова.
  const fail = (e: Error) => {
    toast.error(humanError(e));
    setBusy(null);
  };

  const put = useMutation({
    mutationFn: (v: { stackKey: string; qty: number }) => api.store({ scope, ...v }),
    onSuccess: (res) => {
      toast.success(t("braid.wh_stored", { own: n(res.own), shared: n(res.shared) }));
      done();
    },
    onError: fail,
  });

  const take = useMutation({
    mutationFn: (v: { stackKey: string; scope: "own" | "shared"; qty: number }) => api.take(v),
    onSuccess: (res) => {
      toast.success(t("braid.wh_taken", { n: n(res.qty) }));
      done();
    },
    onError: fail,
  });

  const submit = (qty: number) => {
    if (!pick) return;
    setBusy(pick.busyKey);
    if (pick.mode === "put") put.mutate({ stackKey: pick.stackKey, qty });
    else take.mutate({ stackKey: pick.stackKey, scope: pick.scope ?? "shared", qty });
  };

  return {
    busy,
    pick,
    open: setPick,
    close: () => setPick(null),
    submit,
    pending: put.isPending || take.isPending,
  };
}
