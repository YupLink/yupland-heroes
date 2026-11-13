// Карточка кода в окне «Промокоды»: код с копированием, вкл/выкл, сколько
// игроков ввели из предела и сколько каждая награда уже выдала из объёма.
// Удалить можно только код, который никто не вводил; введённый — выключается.
import { useState } from "react";
import { Copy, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { formatPromoRange } from "@/lib/promo/promoRange";
import type { PromoCodeAdmin, PromoLineAdmin } from "@/lib/promo/promoTypes";
import { promoShares, promoShareText } from "@/lib/promo/promoShares";
import { promoItemImage, promoItemName } from "../promoView";
import { PROMO_KIND_ICON } from "../promoKindIcon";
import { usePromoDelete, usePromoToggle } from "./usePromoAdmin";

const fmt = (n: number, lang: string): string => n.toLocaleString(lang === "en" ? "en-US" : "ru-RU");

/** Доля для полоски: 0..100; без предела — null (полоски нет). */
const share = (used: number, max: number | null): number | null =>
  max == null || max <= 0 ? null : Math.min(100, Math.round((used / max) * 100));

/** Ширина полоски — классом с шагом в 5 % (буквально: Tailwind видит только целые имена). */
const WIDTH = ["w-0", "w-[5%]", "w-[10%]", "w-[15%]", "w-[20%]", "w-[25%]", "w-[30%]", "w-[35%]", "w-[40%]", "w-[45%]", "w-[50%]", "w-[55%]", "w-[60%]", "w-[65%]", "w-[70%]", "w-[75%]", "w-[80%]", "w-[85%]", "w-[90%]", "w-[95%]", "w-full"];
const widthCls = (pct: number): string => WIDTH[Math.round(pct / 5)] ?? "w-full";

function Bar({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <span className={cn("block h-full rounded-full bg-gold", widthCls(pct))} />
    </span>
  );
}

/** share — шанс строки, % (вес / сумма весов); одна строка — null. */
function LineRow({ line, share }: { line: PromoLineAdmin; share: number | null }) {
  const t = useT();
  const lang = useLang();
  const nothing = line.kind === "nothing";
  const got = {
    ...line,
    name: nothing ? t("promo.adm.kind_nothing") : line.title,
    amount: line.max,
    where: "balance" as const,
  };
  const src = nothing ? null : promoItemImage(got);
  const { Icon, tint } = PROMO_KIND_ICON[line.kind];
  const chance = share == null ? "" : `${nothing ? "" : " · "}${promoShareText(share, lang)}`;
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
      <span className="grid h-7 w-7 place-items-center overflow-hidden rounded-lg bg-secondary/60">
        {src ? (
          <img src={thumb(src, 48)} alt="" className="h-6 w-6 object-contain" />
        ) : (
          <Icon className={cn("h-4 w-4", tint)} aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm">{promoItemName(got, t)}</span>
        <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
          {nothing ? "" : formatPromoRange(line.min, line.max)}
          {chance}
        </span>
      </span>
      <span className="text-right text-xs tabular-nums">
        <span className="font-display text-foreground">{fmt(line.given, lang)}</span>
        <span className="text-muted-foreground">
          {" / "}
          {line.budget == null ? "∞" : fmt(line.budget, lang)}
        </span>
      </span>
    </li>
  );
}

export function PromoCodeCard({ promo }: { promo: PromoCodeAdmin }) {
  const t = useT();
  const lang = useLang();
  // Шанс — среди строк с остатком объёма (как бросает база): выбранная — 0 %.
  const shares = promoShares(
    promo.lines.map((l) => (l.budget != null && l.given >= l.budget ? 0 : l.chance)),
  );
  const toggle = usePromoToggle();
  const del = usePromoDelete();
  const [confirm, setConfirm] = useState(false);
  const copy = () =>
    void navigator.clipboard
      ?.writeText(promo.code)
      .then(() => toast.success(t("promo.adm.copied"), { position: "top-center" }))
      .catch(() => undefined);
  return (
    <article
      data-promo-code={promo.code}
      className={cn(
        "space-y-2 rounded-2xl border bg-card/70 p-3 transition",
        promo.active ? "border-gold/30" : "border-border opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          aria-label={t("promo.adm.copy")}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left"
        >
          <span className="truncate font-display text-base font-bold tracking-wider text-gold">
            {promo.code}
          </span>
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={promo.active}
          aria-label={t("promo.adm.toggle")}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id: promo.id, active: !promo.active })}
          className="grid h-11 w-14 shrink-0 place-items-center rounded-xl disabled:opacity-60"
        >
          {/* Дорожка 28 px, а палец попадает во всю кнопку 44 px. */}
          <span
            className={cn(
              "relative block h-7 w-12 rounded-full border transition",
              promo.active ? "border-gold/60 gradient-gold" : "border-border bg-secondary",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                promo.active ? "left-6" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-display text-sm text-foreground tabular-nums">
            {fmt(promo.usedUsers, lang)}
          </span>
          <span className="tabular-nums">
            / {promo.maxUsers == null ? "∞" : fmt(promo.maxUsers, lang)} {t("promo.adm.players")}
          </span>
        </div>
        <Bar pct={share(promo.usedUsers, promo.maxUsers)} />
        {promo.createdBy && (
          <p className="truncate text-[11px] text-muted-foreground">
            {t("promo.adm.by")}: {promo.createdBy}
          </p>
        )}
      </div>
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {promo.lines.map((l, i) => (
          <LineRow key={l.idx} line={l} share={promo.lines.length > 1 ? shares[i] : null} />
        ))}
      </ul>
      {promo.usedUsers === 0 && (
        <div className="flex items-center justify-end gap-2">
          {confirm ? (
            <>
              <span className="mr-auto truncate text-xs text-muted-foreground">
                {t("promo.adm.confirm_delete", { code: promo.code })}
              </span>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="min-h-11 rounded-xl px-3 text-xs text-muted-foreground"
              >
                {t("promo.adm.cancel")}
              </button>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() => del.mutate(promo.id)}
                className="min-h-11 rounded-xl border border-destructive/60 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
              >
                {t("promo.adm.delete")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              aria-label={t("promo.adm.delete")}
              className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
