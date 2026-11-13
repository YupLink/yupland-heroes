import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { previewAutoUpgradeChip, autoUpgradeChip } from "@/server/api/chips-craft";
import { CRAFT_RULES } from "@/server/api/chips-craft";
import { myChipInventory } from "@/server/api/chips-pack";
import { levelKey } from "@/components/chips/collectionsHelpers";
import { fmtGold } from "@/lib/craftGold";
import { CRAFT_GOLD_KEY } from "@/components/chips/useCraftGoldPrice";
import { UpgradeChip, UpgradeCurrency, UpgradeHero, UpgradeShell, starLevel } from "@/components/chips/ChipUpgradeUI";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { UpgradeUnfeasible, type MissReason } from "./UpgradeUnfeasible";
import { GoldShortNote } from "./GoldPriceLine";
import { humanError } from "@/lib/humanError";
import { invalidateAfterCraft } from "@/lib/chipCraftInvalidate";

function AutoUpgradeModal({ chipId, chipLevel, template, onClose, onDone }: {
  chipId: string;
  chipLevel: number;
  template: { id: string; templateNo: number; name: string; imageUrl: string };
  onClose: () => void;
  onDone: (newChipId: string, newLevel: number) => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(false);
  onCloseRef.current = onClose;
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["auto-upgrade-preview", chipId],
    queryFn: () => previewAutoUpgradeChip({ data: { baseChipId: chipId } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory() });
  const run = useMutation({
    mutationFn: async () => {
      const fresh = await previewAutoUpgradeChip({ data: { baseChipId: chipId } });
      const shown = preview.data;
      const ids = (value: typeof fresh) => value.burnChips.map(c => c.id).sort().join("|");
      if (!shown || !fresh.feasible || fresh.totalGold !== shown.totalGold || ids(fresh) !== ids(shown)) {
        throw new Error(ru ? "План изменился. Проверь фишки и цену ещё раз." : "The plan changed. Review the chips and price again.");
      }
      return autoUpgradeChip({ data: { baseChipId: chipId, expectGold: shown.totalGold } });
    },
    onSuccess: r => {
      toast.success(<span>{template.name}: {starLevel(r.newLevel)} · −{fmtGold(r.spentGold, ru)} <ResourceGlyph kind="gold" /></span>);
      onDone(r.newChipId, r.newLevel);
      invalidateAfterCraft(qc, template.id);
    },
    onError: (e: Error) => { toast.error(humanError(e)); void preview.refetch(); void qc.invalidateQueries({ queryKey: CRAFT_GOLD_KEY }); },
  });
  pendingRef.current = run.isPending;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (pendingRef.current) { if (event.key === "Tab") event.preventDefault(); return; }
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialogRef.current)) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);

  const p = preview.data;
  const rule = CRAFT_RULES[levelKey(chipLevel)];
  const hasIntermediate = !!p && !!rule && p.burnCount > rule.sacrifices;
  const canConfirm = !!p?.feasible && !run.isPending && !preview.isFetching && !preview.isError && !inv.isLoading && !inv.isError;
  const burn = p?.burnChips ?? [];
  const burnItems = burn.map(c => {
    const group = inv.data?.find(g => g.chipIds.includes(c.id));
    return { ...c, imageUrl: group?.imageUrl ?? template.imageUrl, name: group?.templateName ?? template.name, templateNo: group?.templateNo ?? null };
  });

  return createPortal(<UpgradeShell title={p?.feasibleChips ? (ru ? "План автоподбора" : "Auto select plan") : (ru ? "Автоподбор" : "Auto select")} onClose={onClose} dialogRef={dialogRef} busy={run.isPending} topLayer autoPlan>
    <UpgradeHero imageUrl={template.imageUrl} name={template.name} level={chipLevel} templateNo={template.templateNo} />
    {preview.isLoading || inv.isLoading ? <div className="chip-upgrade__state" role="status">{ru ? "Рассчитываем план…" : "Calculating plan…"}</div>
      : preview.isError || inv.isError ? <div className="chip-upgrade__state" role="alert"><p>{(ru ? "Не удалось загрузить план улучшения." : "Could not load the upgrade plan.")}</p><button className="chip-upgrade__retry" type="button" onClick={() => { void preview.refetch(); void inv.refetch(); }}>{t("chips.retry")}</button></div>
      : !p ? <div className="chip-upgrade__state">{t("chips.no_data")}</div>
      : <>
        {p.feasibleChips && <div className="chip-upgrade__material is-auto">
          <div className="chip-upgrade__material-copy"><strong>{ru ? `Будут израсходованы: ${p.burnCount}` : `Will be consumed: ${p.burnCount}`}</strong></div>
          {burnItems.length > 0 ? <div className="chip-upgrade__candidates">{burnItems.map(c => <UpgradeChip key={c.id} imageUrl={c.imageUrl} name={c.name} level={c.level} templateNo={c.templateNo} />)}</div>
            : <p>{ru ? "Подходящих фишек пока нет" : "No suitable chips yet"}</p>}
        </div>}
        {p.feasibleChips && <div className="chip-upgrade__steps">
          <h3>{ru ? "Что сделает автоподбор" : "What auto select will do"}</h3>
          <p>{hasIntermediate
            ? (ru ? "Сначала соберёт недостающий материал из выбранных фишек, затем улучшит эту фишку на 0,5★." : "It will craft missing material from selected chips, then upgrade this chip by 0.5★.")
            : (ru ? "Использует готовые фишки для одного шага улучшения на 0,5★." : "It will use ready chips for one 0.5★ upgrade.")}</p>
        </div>}
        {!p.feasibleChips && <UpgradeUnfeasible concise shortfall={p.shortfall} goldShortfall={p.goldShortfall} needGold={p.totalGold} haveGold={p.haveGold} missReason={(p as typeof p & { missReason?: MissReason | null }).missReason} />}
        {p.feasibleChips && <div className="chip-upgrade__summary"><UpgradeCurrency label={ru ? "Требуется золото" : "Gold required"} value={p.totalGold} /><UpgradeCurrency label={ru ? "Баланс" : "Balance"} value={p.haveGold} /></div>}
        {p.feasibleChips && p.goldShortfall > 0 && <GoldShortNote className="chip-upgrade__warning" need={p.totalGold} have={p.haveGold} />}
      </>}
    <button data-game-button="primary" type="button" className="chip-upgrade__confirm" disabled={!canConfirm} onClick={() => run.mutate()} aria-label={p?.feasibleChips ? (ru ? `Подтвердить улучшение за ${fmtGold(p.totalGold, ru)} золота` : `Confirm upgrade for ${fmtGold(p.totalGold, ru)} gold`) : undefined}>{run.isPending ? (ru ? "Улучшаем…" : "Upgrading…") : <>{ru ? "Улучшить" : "Upgrade"}{p?.feasibleChips && <> {ru ? "за" : "for"} {fmtGold(p.totalGold, ru)} <ResourceGlyph kind="gold" /></>}</>}</button>
    <button type="button" className={`chip-upgrade__back${!p?.feasible ? " is-prominent" : ""}`} onClick={onClose} disabled={run.isPending}>{ru ? "Назад к выбору" : "Back to selection"}</button>
  </UpgradeShell>, document.body);
}

export { AutoUpgradeModal };
