// Карточка инструмента (ПРАВИЛА §8.24): картинка, прочность текущей штуки, штуки
// и одна кнопка — «Сделать основным» или «Убрать из рук». Открывается тапом по
// инструменту в рюкзаке и по значку над картой. Подписей-пояснений нет — числа.
// Раскладка — как у карточки буста: снизу на телефоне, по центру на десктопе.
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { Hand, Loader2, Pickaxe, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { formatQty } from "@/lib/formatQty";
import { shownDurability } from "@/lib/raid/mainTool";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { useSetMainTool } from "@/components/beta-raid/tool/useMainTool";

export function ToolCard({
  stack,
  main,
  readOnly = false,
  onClose,
}: {
  stack: BackpackStack;
  /** Этот инструмент сейчас в руках. */
  main: boolean;
  /** Чужой герой (просмотр) — без кнопки. */
  readOnly?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const set = useSetMainTool();
  const d = stack.durability == null ? null : shownDurability(stack.durability);
  return (
    <ResourceActionDialog
      title={stack.name}
      busy={set.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      className="mb-[calc(env(safe-area-inset-bottom)+76px)] w-full max-w-sm rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:rounded-3xl"
    >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary/40">
              {stack.image ? (
                <img
                  src={thumb(stack.image, 120, "black")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Pickaxe className="h-6 w-6 text-gold" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 truncate font-display text-base font-bold">
                {main && (
                  <Hand className="h-4 w-4 shrink-0 text-gold" aria-label={t("tool.main")} />
                )}
                <span className="truncate">{stack.name}</span>
              </h3>
              <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                {d !== null && (
                  <span
                    aria-label={t("braid.tool_durability", { n: d })}
                    className={d <= 25 ? "text-destructive" : "text-gold"}
                  >
                    {d}%
                  </span>
                )}
                <span className="text-muted-foreground">×{formatQty(stack.count)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={set.isPending}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!readOnly && (
          <button
            type="button"
            disabled={set.isPending}
            onClick={() => set.mutate(main ? null : stack.stackKey, { onSuccess: onClose })}
            className={
              main
                ? "flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
                : "flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
            }
          >
            {set.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Hand className="h-4 w-4" />
            )}
            {t(main ? "tool.put_away" : "tool.make_main")}
          </button>
        )}
    </ResourceActionDialog>
  );
}
