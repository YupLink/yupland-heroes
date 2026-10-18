// «Рыба» в карточке своего товара (владелец, 06.10.2026): галочка «этот товар
// ловится удочкой» и доля вида внутри улова.
//
// Доли живут одной настройкой мира (fishing_config), а не в каждом товаре:
// сумма обязана быть ровно 100 %, и считать её можно только зная все виды
// сразу. Поэтому здесь же, рядом с галочкой, стоит весь список — «шанс на эту
// рыбу такой-то, на ту такой-то», и видно, как едут соседи, пока правишь свой.
//
// Пишется настройка сразу, без кнопки «Сохранить товар»: это другая таблица, и
// связывать её с сохранением имени и картинки было бы ложным обещанием.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fish, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { withFishItem, withoutFishItem, type FishItem } from "@/lib/raid/fishChances";
import type { FishingConfig } from "@/lib/raid/fishing";
import { getFishingAdmin, saveFishingAdmin } from "@/server/api/beta-raid/fishing/fishing-config";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import { FishChances } from "@/components/admin/fishing/FishChances";

const KEY = ["admin-fishing"] as const;

export function CustomFishField({
  id,
  pending,
  onPending,
}: {
  /** id шаблона; null — товар ещё не создан, галочка ждёт создания. */
  id: string | null;
  /** Галочка у несозданного товара — её применит родитель после создания. */
  pending: boolean;
  onPending: (next: boolean) => void;
}) {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: KEY, queryFn: () => getFishingAdmin() });
  const all = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  const items: FishItem[] = cfg.data?.items ?? [];
  const on = id ? items.some((it) => it.id === id) : pending;

  const save = useMutation({
    mutationFn: (next: FishItem[]) =>
      saveFishingAdmin({
        data: {
          intervalMin: cfg.data?.intervalMin ?? 1,
          chancePct: cfg.data?.chancePct ?? 10,
          items: next,
        },
      }),
    onSuccess: (res: FishingConfig) => qc.setQueryData(KEY, res),
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const toggle = (checked: boolean) => {
    if (!id) return onPending(checked);
    save.mutate(checked ? withFishItem(items, id) : withoutFishItem(items, id));
  };

  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={save.isPending || cfg.isLoading}
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        <Fish className="h-3.5 w-3.5 shrink-0 text-gold" />
        <span>Рыба — попадается на удочку</span>
        {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </label>

      {id && on && items.length > 0 && (
        <div className="mt-2">
          <FishChances
            items={items}
            all={all.data ?? []}
            highlight={id}
            onChange={(next) => save.mutate(next)}
          />
        </div>
      )}
    </div>
  );
}
