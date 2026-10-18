// Выбор шаблонов для раздачи: сундуки/монетки берут вид объекта, артефакты —
// конкретные предметы. Выбор МНОЖЕСТВЕННЫЙ, пустой список значит «любой
// подходящий» — так задумано и так подписано на кнопке.
//
// Попап рисуется порталом в body: панель раздачи стоит под backdrop-blur, и
// вложенный список та обрезала бы вместе с кнопкой «Готово».
//
// Редкость видна прямо на плитке — цветом рамки и подписью. Без неё выбор
// артефактов превращался в угадайку по названию.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminListItems } from "@/server/api/items";
import { RARITY_COLOR } from "@/components/admin/itemsAdminShared";
import { RefThumb } from "@/components/beta-raid/market/RefThumb";
import { isCoinTemplate } from "@/lib/raid/pileKind";

export type TemplateKind = "chest" | "artifact";

export function ScatterTemplatePicker({
  kind,
  pile,
  value,
  onChange,
  rarities,
  title,
}: {
  kind: TemplateKind;
  /**
   * Сундуки или монетки. Вид шаблона у них общий, поэтому без этого фильтра в
   * разделе «Монетки» показывались и большие сундуки — админ выбирал такой, а
   * раздача отвечала «подходящих шаблонов не нашлось»: она-то отбирает по
   * запасу HP (lib/raid/pileKind), тем же правилом, что и этот список.
   */
  pile?: "chest" | "coin";
  value: string[];
  onChange: (next: string[]) => void;
  /** Показывать только эти редкости; пусто — все. */
  rarities?: string[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  // Ключ общий с редактором объекта (AdminObjectSettings): справочник тяжёлый,
  // и второй раз его тянуть незачем.
  const q = useQuery({
    queryKey: ["hex-editor-items", kind],
    queryFn: () => adminListItems({ data: { kind } }),
    staleTime: 5 * 60_000,
    enabled: open || value.length > 0,
  });

  const all = (q.data ?? []).filter((i) => i.active || value.includes(i.id));
  const byPile = pile ? all.filter((i) => isCoinTemplate(i.meta) === (pile === "coin")) : all;
  const list =
    rarities && rarities.length > 0
      ? byPile.filter((i) => (i.rarity ? rarities.includes(i.rarity) : false))
      : byPile;
  const picked = all.filter((i) => value.includes(i.id));
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left text-[12px]"
      >
        <span className={cn("min-w-0 truncate", value.length === 0 && "text-muted-foreground")}>
          {value.length === 0
            ? "все подходящие"
            : picked.length > 0
              ? `${value.length} шт · ${picked.map((p) => p.name).join(", ")}`
              : `${value.length} шт`}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase text-gold">выбрать</span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
                <h4 className="font-display text-sm font-bold">{title}</h4>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Закрыть"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                {q.isLoading ? (
                  <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> загрузка…
                  </p>
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">
                    Подходящих шаблонов нет
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {list.map((i) => {
                      const on = value.includes(i.id);
                      const color = i.rarity ? (RARITY_COLOR[i.rarity] ?? "#9aa4bd") : "#41d3c6";
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => toggle(i.id)}
                          style={{ boxShadow: on ? `0 0 0 2px ${color}` : undefined }}
                          className={cn(
                            "relative rounded-lg border p-1 text-left",
                            on ? "border-transparent bg-gold/5" : "border-border",
                          )}
                        >
                          <RefThumb image={i.imageUrl} size={120} />
                          <span className="mt-0.5 block truncate text-[10px] font-semibold">
                            {i.name}
                          </span>
                          {i.rarity && (
                            <span className="block text-[9px]" style={{ color }}>
                              {i.rarity}
                            </span>
                          )}
                          {on && (
                            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-gold text-gold-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2 border-t border-border p-2 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-2">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-xl border border-border px-3 py-2.5 text-[12px] font-semibold text-muted-foreground"
                >
                  Сбросить
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl gradient-gold px-3 py-2.5 text-[13px] font-bold text-gold-foreground"
                >
                  Готово{value.length > 0 ? ` · ${value.length}` : ": все"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
