// Админка шахт: «Хижина шаманов» (владелец, 28.10.2026: «дай админу
// возможность ставить цену и характеристики, как у босса»).
//  · Цена — ресурс (список) и сумма; «Сохранить» — шаманов начинают продавать,
//    «Снять с продажи» — в хижине снова «Скоро в продаже».
//  · Характеристики — тот же редактор босса, что у всех боссов (шаблон
//    rbt_shaman): HP, урон, способности, картинка. Пока HP и урон не заданы,
//    шаман годится только для обряда погоды — в охрану шахты его не взять.
import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Swords } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { SHAMAN_HUT_KEY } from "@/lib/shamanHutBus";
import {
  SHAMAN_CURRENCIES,
  SHAMAN_PRICE_MAX,
  SHAMAN_TEMPLATE_ID,
  type ShamanCurrency,
  type ShamanPrice,
} from "@/lib/shamanHut";
import { adminGetShamanConfig, adminSetShamanPrice } from "@/server/api/shaman-hut/shaman-config";
import { FullObjectEditor } from "@/components/admin/hex-editor/FullObjectEditor";

const KEY = ["admin-shaman-config"] as const;
const CURRENCY_RU: Record<ShamanCurrency, string> = {
  gold: "Золото",
  diamonds: "Алмазы",
  wood: "Дерево",
  stone: "Камень",
};

export function ShamanAdminCard({ portalContainer }: { portalContainer?: () => Element | null } = {}) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => adminGetShamanConfig(), staleTime: 0 });
  const [draft, setDraft] = useState<{ currency: ShamanCurrency; amount: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const saved = q.data?.price ?? null;
  const currency = draft?.currency ?? saved?.currency ?? "gold";
  const amount = draft?.amount ?? (saved ? String(saved.amount) : "");
  const n = Number(amount);
  const valid = amount !== "" && Number.isInteger(n) && n >= 1 && n <= SHAMAN_PRICE_MAX;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    // Окно хижины у игроков держит цену и характеристики в своём ответе.
    void qc.invalidateQueries({ queryKey: SHAMAN_HUT_KEY });
  };
  const save = useMutation({
    mutationFn: (price: ShamanPrice | null) => adminSetShamanPrice({ data: { price } }),
    onSuccess: (res) => {
      toast.success(res.price ? "Шаманов продают" : "Шаманы сняты с продажи");
      setDraft(null);
      refresh();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const tpl = q.data?.template ?? null;
  const busy = q.isPending || save.isPending;
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Хижина шаманов">
      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Swords className="h-3.5 w-3.5" aria-hidden="true" />
        Хижина шаманов
      </div>
      {q.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : q.isError ? (
        <p role="alert" className="text-sm">
          {humanError(q.error)}
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            {tpl && (
              <img
                src={tpl.image}
                alt=""
                className="h-14 w-14 object-contain [image-rendering:pixelated]"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{tpl?.name ?? "Шаблона шамана нет"}</div>
              <div className="text-xs text-muted-foreground">
                {tpl
                  ? `HP ${tpl.hp || "—"} · урон ${tpl.attack ?? "—"} · ${tpl.guard ? "можно в охрану шахты" : "только обряд погоды"}`
                  : "Накатите миграцию shaman-02"}
              </div>
            </div>
            {tpl && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs"
              >
                Характеристики
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={currency}
              disabled={busy}
              onChange={(e) => setDraft({ currency: e.target.value as ShamanCurrency, amount })}
              className="h-9 rounded-xl border border-border bg-background px-2"
              aria-label="Ресурс цены"
            >
              {SHAMAN_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_RU[c]}
                </option>
              ))}
            </select>
            <input
              inputMode="numeric"
              value={amount}
              disabled={busy}
              onChange={(e) => setDraft({ currency, amount: e.target.value.replace(/[^\d]/g, "") })}
              placeholder="Цена"
              aria-label="Цена шамана"
              className="h-9 w-28 rounded-xl border border-border bg-background px-3"
            />
            <button
              type="button"
              disabled={busy || !valid}
              onClick={() => save.mutate({ currency, amount: n })}
              className="flex h-9 items-center gap-1.5 rounded-xl gradient-gold px-4 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Сохранить
            </button>
            {saved && (
              <button
                type="button"
                disabled={busy}
                onClick={() => save.mutate(null)}
                className="h-9 rounded-xl border border-border px-3 text-xs disabled:opacity-50"
              >
                Снять с продажи
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {saved
              ? `Продаётся: ${saved.amount} · ${CURRENCY_RU[saved.currency]}`
              : "Не продаётся — в хижине покупка недоступна"}
          </p>
        </div>
      )}
      {/* Поверх всего: карточку открывают и из окна хижины в замке (там окно — слой 110). */}
      {editing &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="shaman-hut-live__admin-editor fixed inset-0 z-[150]">
            <FullObjectEditor
              sub="boss"
              refId={SHAMAN_TEMPLATE_ID}
              cellKey="—"
              terrains={[]}
              onClose={() => setEditing(false)}
              onUpdated={() => {
                setEditing(false);
                refresh();
              }}
            />
          </div>,
          portalContainer?.() ?? document.body,
        )}
    </section>
  );
}
