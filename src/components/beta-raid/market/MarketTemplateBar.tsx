// Шаблоны ЦЕЛОГО маркета (админ): сохранить все товары клетки как именованный
// шаблон и развернуть на другой маркет одной кнопкой. Сворачиваемый блок в
// MarketEditor. Тексты inline по-русски — панель только для админа.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Layers,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import {
  saveMarketTemplate,
  listMarketTemplates,
  applyMarketTemplate,
  deleteMarketTemplate,
  type TplPreview,
} from "@/server/api/beta-raid/market-template";
import { invalidateMarketCell } from "./invalidateMarket";

/** Маленькая иконка товара шаблона: картинка шаблона или иконка ресурса. */
function PreviewIcon({ it }: { it: TplPreview }) {
  const isRes = !it.image && it.kind === "resource";
  const src = it.image
    ? thumb(it.image, 48, "black")
    : isRes
      ? marketResourceIconSrc(it.refId)
      : null;
  if (!src) {
    return <div className="h-5 w-5 shrink-0 rounded border border-border bg-secondary/40" />;
  }
  return (
    <img
      src={src}
      alt=""
      className={
        isRes
          ? "h-5 w-5 shrink-0 object-contain [image-rendering:pixelated]"
          : "h-5 w-5 shrink-0 rounded border border-border object-cover"
      }
    />
  );
}

export function MarketTemplateBar({ q, r }: { q: number; r: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["market-templates"],
    queryFn: () => listMarketTemplates(),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => saveMarketTemplate({ data: { q, r, name: name.trim() } }),
    onSuccess: () => {
      toast.success("Маркет сохранён в шаблон");
      setName("");
      qc.invalidateQueries({ queryKey: ["market-templates"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const apply = useMutation({
    mutationFn: (id: string) => applyMarketTemplate({ data: { q, r, templateId: id } }),
    onSuccess: (res) => {
      toast.success(`Шаблон развёрнут · ${res.count} товаров`);
      // Витрина игрока лежит в НЕактивном запросе (окно лавки у админа закрыто)
      // и без refetchType:'all' отдала бы прежние товары до перезагрузки —
      // общий хелпер снимает и список админа, и её.
      invalidateMarketCell(qc, q, r);
      // Фильтр покупателей шаблон тоже переписывает — свой ключ, своя запись.
      void qc.invalidateQueries({ queryKey: ["market-shop", q, r] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteMarketTemplate({ data: { id } }),
    onSuccess: () => {
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["market-templates"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const templates = list.data ?? [];

  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Layers className="h-3.5 w-3.5" /> Шаблоны маркета
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {/* Сохранить текущий маркет в шаблон. */}
          <div className="flex gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="имя шаблона"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              className="flex shrink-0 items-center gap-1 rounded-lg gradient-gold px-2.5 py-1.5 text-[11px] font-bold text-gold-foreground disabled:opacity-50"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              В шаблон
            </button>
          </div>

          {/* Список шаблонов: развернуть / удалить. */}
          {list.isLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground">Шаблонов пока нет</p>
          ) : (
            <div className="space-y-1">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-lg border border-border bg-background/40 px-2 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                      {tpl.name}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {tpl.itemCount} тов.
                    </span>
                    <button
                      type="button"
                      onClick={() => apply.mutate(tpl.id)}
                      disabled={apply.isPending}
                      aria-label="Развернуть"
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2 py-1 text-[10px] font-bold text-gold disabled:opacity-50"
                    >
                      <Rocket className="h-3 w-3" /> Развернуть
                    </button>
                    {confirmDel === tpl.id ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => del.mutate(tpl.id)}
                          disabled={del.isPending}
                          aria-label="Подтвердить"
                          className="grid h-6 w-6 place-items-center rounded-full bg-destructive text-white disabled:opacity-50"
                        >
                          {del.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDel(null)}
                          aria-label="Отмена"
                          className="grid h-6 w-6 place-items-center rounded-full border border-border"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDel(tpl.id)}
                        aria-label="Удалить"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Что внутри шаблона — маленькими иконками. preview может
                      отсутствовать у ответа из старого persist-кэша — защищаемся. */}
                  {(tpl.preview ?? []).length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1">
                      {(tpl.preview ?? []).map((it, i) => (
                        <PreviewIcon key={i} it={it} />
                      ))}
                      {tpl.itemCount > (tpl.preview ?? []).length && (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          +{tpl.itemCount - (tpl.preview ?? []).length}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] leading-tight text-muted-foreground">
            «Развернуть» заменит товары этого маркета товарами шаблона.
          </p>
        </div>
      )}
    </div>
  );
}
