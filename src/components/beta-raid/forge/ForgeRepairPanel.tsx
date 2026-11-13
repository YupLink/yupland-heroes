// Вкладка «Ремонт» в окне кузницы (владелец, 23.10.2026; ПРАВИЛА §8.72): «как
// галочки проставлять — починить эти, или кнопка „починить все“. Ты выбираешь —
// у тебя сразу же сумма набирается. … В кузнице кнопка для починки — отдельная
// вкладка, в дизайне приложения. Выбрать полностью починенные арты нельзя — они
// уже починенные».
//
// Список изношенных (картинка, полоса износа, на ком, цена) — целых в нём нет
// (сервер отдаёт только износ > 0). Галочки, «Выбрать все»; внизу сумма
// выбранного — золото и алмазы отдельно, нехватка красным — и две кнопки:
// главная «Починить (N)», вторая «Починить все». Сумму сверяет сервер: платишь
// показанное. Список листается своим блоком, высота — остаток окна постройки
// (85dvh минус шапка, картинка, вкладки и итог): итог и кнопки на виду без
// прокрутки окна (ПРАВИЛА 14 п. 4.0); на совсем низком экране — минимум два ряда.
import { useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { useResources } from "@/lib/hooks/useResources";
import { ART_REPAIR_PRICE, repairShort, repairTotal } from "@/lib/hero/artRepair";
import { metaLabel } from "@/components/heroMeta";
import { cn } from "@/lib/utils";
import { ForgeRepairRow, RepairCostLabel } from "./ForgeRepairRow";
import { useForgeRepair, useForgeRepairList } from "./useForgeRepair";

export function ForgeRepairPanel({ q, r }: { q: number; r: number }) {
  const t = useT();
  const lang = useLang();
  const list = useForgeRepairList(true);
  const res = useResources();
  const repair = useForgeRepair(q, r);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());

  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  // Выбор — только из живых строк: починенное и ушедшее из списка не считается.
  const chosen = useMemo(() => items.filter((i) => picked.has(i.id)), [items, picked]);
  const total = repairTotal(chosen);
  const allTotal = repairTotal(items);
  const short = repairShort(total, res.data);
  const allShort = repairShort(allTotal, res.data);
  const busy = repair.isPending || list.isFetching;
  const allPicked = items.length > 0 && chosen.length === items.length;

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)));
  const run = (all: boolean) =>
    repair.mutate(
      all
        ? { ids: items.map((i) => i.id), all: true, expect: allTotal }
        : { ids: chosen.map((i) => i.id), all: false, expect: total },
      { onSuccess: () => setPicked(new Set()) },
    );

  if (list.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }
  if (list.isError) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{t("artfix.load_failed")}</p>
    );
  }
  if (items.length === 0) {
    return (
      <div data-forge-repair className="forge-repair-empty">
        <h3 className="forge-repair-heading">{t("artfix.title")}</h3>
        <div className="forge-repair-empty-card">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          <strong>{t("artfix.empty")}</strong>
          <p>{lang === "ru" ? "Нет артефактов, которым нужен ремонт." : "You have no artifacts that need repair."}</p>
        </div>
        <details className="forge-repair-rates">
          <summary>{lang === "ru" ? "Стоимость ремонта" : "Repair cost"}</summary>
          <ul>
            {(Object.entries(ART_REPAIR_PRICE) as Array<[keyof typeof ART_REPAIR_PRICE, typeof ART_REPAIR_PRICE[keyof typeof ART_REPAIR_PRICE]]>).map(([rarity, cost]) => (
              <li key={rarity}>
                <span>{metaLabel(rarity, lang)}</span>
                <RepairCostLabel cost={cost} />
              </li>
            ))}
          </ul>
        </details>
        <p className="forge-repair-hint">{lang === "ru" ? "Для ремонта герой должен стоять у кузницы." : "The hero must stand by the forge to repair artifacts."}</p>
      </div>
    );
  }
  return (
    <div data-forge-repair className="flex flex-col">
      <h3 className="forge-repair-heading">{t("artfix.title")}</h3>
      <button
        type="button"
        role="checkbox"
        aria-checked={allPicked}
        onClick={toggleAll}
        disabled={repair.isPending}
        className="mb-2 flex min-h-11 items-center gap-2 self-start rounded-xl px-2 text-xs font-semibold text-gold"
      >
        <span
          className={cn(
            "grid h-4 w-4 place-items-center rounded border",
            allPicked ? "border-gold bg-gold text-gold-foreground" : "border-gold/60",
          )}
        >
          {allPicked && <Check className="h-3 w-3" />}
        </span>
        {allPicked ? t("artfix.unpick_all") : t("artfix.pick_all")}
      </button>
      <div data-forge-repair-list className="-mx-1 max-h-[max(7.5rem,calc(85dvh-33rem))] space-y-1.5 overflow-y-auto overscroll-contain px-1 sm:max-h-[max(10rem,calc(88vh-29rem))]">
        {items.map((it) => (
          <ForgeRepairRow
            key={it.id}
            item={it}
            picked={picked.has(it.id)}
            disabled={repair.isPending}
            onToggle={() => toggle(it.id)}
          />
        ))}
      </div>
      <div data-forge-repair-summary className="mt-3 space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("artfix.total")}</span>
          <RepairCostLabel cost={total} short={short} withZero className="text-base font-bold" />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={busy || chosen.length === 0 || short.gold || short.diamonds}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl gradient-gold px-3 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {repair.isPending && !repair.variables?.all && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t("artfix.repair_n", { n: chosen.length })}
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy || allShort.gold || allShort.diamonds}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-gold/50 bg-gold/10 px-3 py-3 text-sm font-semibold text-gold disabled:opacity-50"
          >
            {repair.isPending && repair.variables?.all && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t("artfix.repair_all")}
          </button>
        </div>
      </div>
    </div>
  );
}
