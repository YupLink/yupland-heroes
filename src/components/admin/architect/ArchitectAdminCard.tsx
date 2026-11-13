// Админка шахт: цены Архитектора замка (ПРАВИЛА §8.59.7) — шаги уровней 0→1 … 3→4
// и одна заготовка каждого вида шахты. Пустое поле — 0 (ресурс не берётся).
// Настройка мира, одна на всю игру (settings.architect_config, как рыбалка);
// по умолчанию — значения из lib/castleArchitect. Товары в цене правятся в окне
// Архитектора («Изменить цены»); здесь они видны и сохраняются как есть.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DraftingCompass, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { ARCHITECT_RES, type ArchitectConfig } from "@/lib/castleArchitect";
import {
  getArchitectAdmin,
  saveArchitectAdmin,
} from "@/server/api/castle-architect/architect-config";
import {
  ARCHITECT_ADMIN_KEY as KEY,
  PRICE_ROWS as ROWS,
  patchPrice as patch,
  setRes,
  toSave,
  type PriceRow as Row,
} from "@/components/castle-live/architect/architectPriceDraft";
import { ARCHITECT_KEY } from "@/components/castle-live/useWithArchitect";

const RES_RU: Record<(typeof ARCHITECT_RES)[number], string> = {
  wood: "Дерево",
  stone: "Камень",
  gold: "Золото",
  diamonds: "Алмазы",
};

export function ArchitectAdminCard() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: KEY, queryFn: () => getArchitectAdmin() });
  const [draft, setDraft] = useState<ArchitectConfig | null>(null);
  const cur = draft ?? cfg.data ?? null;

  const save = useMutation({
    mutationFn: (data: ArchitectConfig) => saveArchitectAdmin({ data: toSave(data) }),
    onSuccess: (res) => {
      toast.success("Цены Архитектора сохранены");
      setDraft(null);
      qc.setQueryData(KEY, res);
      // Окно и карточка в Ратуше держат цены в своём ответе — пусть перечитают.
      void qc.invalidateQueries({ queryKey: ARCHITECT_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const edit = (row: Row, res: (typeof ARCHITECT_RES)[number], raw: string) => {
    if (!cur) return;
    setDraft(patch(cur, row.id, setRes(row.cost(cur), res, raw)));
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <DraftingCompass className="h-3.5 w-3.5" />
        Архитектор: цены
      </div>
      {!cur ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="py-1 pr-2 font-medium" />
                {ARCHITECT_RES.map((r) => (
                  <th key={r} className="px-1 py-1 font-medium">
                    {RES_RU[r]}
                  </th>
                ))}
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap py-1 pr-2 text-xs text-muted-foreground">
                    {row.label(true)}
                  </td>
                  {ARCHITECT_RES.map((r) => (
                    <td key={r} className="px-1 py-1">
                      <input
                        inputMode="numeric"
                        aria-label={`${row.label(true)}: ${RES_RU[r]}`}
                        value={String(row.cost(cur)[r])}
                        onChange={(e) => edit(row, r, e.target.value)}
                        className="w-full min-w-[84px] rounded-xl border border-border bg-background px-2 py-1.5 text-base tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="max-w-[10rem] px-1 py-1 text-xs text-muted-foreground">
                    {(row.cost(cur).goods ?? []).map((g) => `${g.name} ×${g.qty}`).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() => draft && save.mutate(draft)}
        disabled={!draft || save.isPending}
        className="mt-3 flex items-center gap-1.5 rounded-xl gradient-gold px-4 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
      >
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Сохранить
      </button>
    </div>
  );
}
