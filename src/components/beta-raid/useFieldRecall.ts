// Снять героя с грядки издалека: мутация и всё, что после неё перечитать.
//
// Правило «без F5»: герой снят и серый (отдыхает), грядка с её флажком и значком
// «занято/всего», склады с дробным хвостом — всё обновляется сразу, из какого бы
// окна ни нажали (замок, выбор героя).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recallHeroFromField } from "@/api";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { invalidateHeroQueries } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { FIELD_RECALL_REST_H } from "@/lib/fieldRecall";

/** Что задевает снятие, кроме героя: хвост на счёт, флажки грядок, «Добыча», склады. */
const TOUCHED = [
  "acc-balances",
  "my-resources",
  "my-like-balance",
  "my-tickets",
  "my-energy",
  "beta-raid-mine-flags",
  "beta-raid-field-slots",
  "beta-raid-harvest",
  "beta-raid-warehouse-badges",
  "my-warehouses",
];

/** at — «q,r» грядки из списка героев: по нему перечитываем её окно. */
export function useFieldRecall(onDone: () => void) {
  const qc = useQueryClient();
  const t = useT();

  const refresh = (at: string | null) => {
    invalidateHeroQueries(qc, TOUCHED);
    const [q, r] = (at ?? "").split(",").map(Number);
    if (at && Number.isFinite(q) && Number.isFinite(r)) {
      qc.invalidateQueries({ queryKey: ["beta-field", q, r] });
      qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    }
  };

  return useMutation({
    // Ключ — свой на каждое нажатие: по нему сервер отличает повтор от нового.
    mutationFn: (v: { heroId: string; at: string | null }) =>
      recallHeroFromField({ data: { heroId: v.heroId, op: newOpId() } }),
    onSuccess: (res, v) => {
      // У самой грядки и с грядки, которой нет, сервер снимает без отдыха —
      // тогда и в тосте о нём ни слова.
      if (!res.repeat) {
        toast.success(
          res.rested
            ? t("braid.field_recalled", { hero: res.heroName ?? "", h: FIELD_RECALL_REST_H })
            : t("braid.field_removed"),
        );
      }
      refresh(res.at ? `${res.at.q},${res.at.r}` : v.at);
    },
    // Отказ тоже перечитывает: «уже свободен» значит, что список героев устарел.
    onError: (e: Error, v) => {
      toast.error(serverErrorText(e, t));
      refresh(v.at);
    },
    onSettled: () => onDone(),
  });
}
