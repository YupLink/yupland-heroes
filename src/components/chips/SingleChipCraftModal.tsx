import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleCheck } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { craftChip, CRAFT_RULES } from "@/server/api/chips-craft";
import { myChipInventory } from "@/server/api/chips-pack";
import { getMyTickets } from "@/server/api/user-tickets";
import { fmtTickets, levelKey } from "@/components/chips/collectionsHelpers";
import { AutoUpgradeModal } from "@/components/chips/AutoUpgradeModal";
import { UpgradeChip, UpgradeCurrency, UpgradeHero, UpgradeShell, levelNumber, starLevel } from "@/components/chips/ChipUpgradeUI";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { humanError } from "@/lib/humanError";
import { invalidateAfterCraft } from "@/lib/chipCraftInvalidate";

function SingleChipCraftModal({ chipId, chipLevel, template, onClose, onCrafted }: {
  chipId: string;
  chipLevel: number;
  template: { id: string; templateNo: number; name: string; imageUrl: string };
  onClose: () => void;
  onCrafted: (newChipId: string, newLevel: number) => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const blockedRef = useRef(false);
  const wasAutoOpen = useRef(false);
  onCloseRef.current = onClose;
  const qc = useQueryClient();
  const rule = CRAFT_RULES[levelKey(chipLevel)];
  const tickets = useQuery({ queryKey: ["my-tickets"], queryFn: () => getMyTickets() });
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory() });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionInitializedFor = useRef<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  useEffect(() => {
    if (autoOpen) { wasAutoOpen.current = true; return; }
    if (wasAutoOpen.current) {
      dialogRef.current?.querySelector<HTMLButtonElement>(".chip-upgrade__auto-entry")?.focus();
      wasAutoOpen.current = false;
    }
  }, [autoOpen]);

  const ticketsAvailable = (tickets.data as { availableRaw?: number } | undefined)?.availableRaw ?? tickets.data?.available ?? 0;
  const allItems = inv.data ?? [];
  const base = allItems.find(i => i.chipIds.includes(chipId));
  const candidates = useMemo(() => !rule || !base ? [] : (inv.data ?? [])
    .filter(i => i.collectionId === base.collectionId && i.level === (rule.sacrificeLevel ?? chipLevel) && (!rule.requireIdentical || i.templateId === base.templateId))
    .flatMap(item => item.chips.filter(ch => ch.id !== chipId && !ch.studying && (!ch.restUntil || new Date(ch.restUntil).getTime() <= Date.now())).map(ch => ({ id: ch.id, item }))), [inv.data, base, chipId, chipLevel, rule]);

  useEffect(() => {
    if (!inv.data) return;
    const firstSelection = selectionInitializedFor.current !== chipId;
    selectionInitializedFor.current = chipId;
    const available = new Set(candidates.map(c => c.id));
    // Preselect once; a background refetch must not silently replace the
    // player's reviewed materials. Remove only candidates that vanished.
    setSelectedIds(previous => firstSelection
      ? candidates.slice(0, rule?.sacrifices ?? 0).map(c => c.id)
      : previous.every(id => available.has(id)) ? previous : previous.filter(id => available.has(id)));
    if (firstSelection) setShowCandidates(false);
  }, [candidates, chipId, inv.data, rule?.sacrifices]);
  const craft = useMutation({
    mutationFn: () => craftChip({ data: { baseChipId: chipId, sacrificeChipIds: selectedIds } }),
    onSuccess: r => {
      toast.success(<span>{template.name}: {starLevel(r.newLevel)} · −{fmtTickets(r.costTickets)} <ResourceGlyph kind="tickets" /></span>);
      onCrafted(r.newChipId, r.newLevel);
      invalidateAfterCraft(qc, template.id);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const autoOpenRef = useRef(autoOpen);
  autoOpenRef.current = autoOpen;
  blockedRef.current = craft.isPending;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (autoOpenRef.current) return;
      if (blockedRef.current) { if (event.key === "Tab") event.preventDefault(); return; }
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
  if (!rule) return null;

  const ticketsEnough = ticketsAvailable >= rule.costTickets;
  const canConfirm = selectedIds.length === rule.sacrifices && selectedIds.every(id => candidates.some(c => c.id === id)) && ticketsEnough && !craft.isPending && !tickets.isError && !inv.isError && !tickets.isFetching && !inv.isFetching;
  const sacrLevel = rule.sacrificeLevel ?? chipLevel;
  const selected = selectedIds.map(id => candidates.find(c => c.id === id)).filter((c): c is typeof candidates[number] => !!c);
  const selectionComplete = selected.length === rule.sacrifices;
  const toggle = (id: string) => {
    if (craft.isPending || autoOpen) return;
    if (!selectedIds.includes(id) && selectedIds.length >= rule.sacrifices) {
      toast.info(ru ? "Сначала убери одну выбранную фишку." : "Remove a selected chip first.");
      return;
    }
    if (!selectedIds.includes(id) && selectedIds.length + 1 >= rule.sacrifices) setShowCandidates(false);
    if (selectedIds.includes(id)) setShowCandidates(true);
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < rule.sacrifices ? [...prev, id] : prev);
  };

  return <>
    <UpgradeShell title={ru ? "Улучшить фишку" : "Upgrade chip"} onClose={onClose} dialogRef={dialogRef} busy={craft.isPending} inactive={autoOpen} compact={selectionComplete}>
      <UpgradeHero imageUrl={template.imageUrl} name={template.name} level={chipLevel} templateNo={template.templateNo} />
      {(tickets.isError || inv.isError) && <div role="alert" className="chip-upgrade__state"><p>{(ru ? "Не удалось загрузить фишки и баланс." : "Could not load chips and balance.")}</p><button className="chip-upgrade__retry" type="button" onClick={() => { void tickets.refetch(); void inv.refetch(); }}>{t("chips.retry")}</button></div>}
      {(tickets.isFetching || inv.isFetching) && <div className="chip-upgrade__state">{ru ? "Загрузка фишек…" : "Loading chips…"}</div>}
      <div className="chip-upgrade__material">
        <div className="chip-upgrade__material-copy"><strong>{ru ? <>{rule.sacrifices === 1 ? "Нужна" : "Нужны"} {rule.sacrifices} {rule.sacrifices === 1 ? "фишка" : "фишки"} {levelNumber(sacrLevel)}<span className="chip-upgrade__star">★</span></> : <>Required: {rule.sacrifices} {levelNumber(sacrLevel)}<span className="chip-upgrade__star">★</span> chip{rule.sacrifices === 1 ? "" : "s"}</>}</strong><p>{rule.requireIdentical ? (ru ? "Того же вида" : "Same type") : (ru ? "Из этой коллекции" : "From this collection")}</p></div>
        {selected.length > 0 && <div className="chip-upgrade__tiny-list">{selected.map(c => <UpgradeChip disabled={craft.isPending} key={c.id} imageUrl={c.item.imageUrl} name={c.item.templateName} level={c.item.level} templateNo={c.item.templateNo} selected onClick={() => toggle(c.id)} />)}</div>}
        <em className="chip-upgrade__material-count">{selectedIds.length}/{rule.sacrifices}</em>
      </div>
      {candidates.length > 0 && !selectionComplete && <>
        <button type="button" className="chip-upgrade__candidate-toggle" disabled={craft.isPending} aria-expanded={showCandidates} onClick={() => setShowCandidates(v => !v)}>{ru ? "Выбрать фишки" : "Choose chips"}<span>{showCandidates ? "⌃" : "⌄"}</span></button>
        {showCandidates && <div className="chip-upgrade__candidates">{candidates.map(c => <UpgradeChip disabled={craft.isPending} key={c.id} imageUrl={c.item.imageUrl} name={c.item.templateName} level={c.item.level} templateNo={c.item.templateNo} selected={selectedIds.includes(c.id)} onClick={() => toggle(c.id)} />)}</div>}
      </>}
      {!inv.isFetching && candidates.length < rule.sacrifices && <p className="chip-upgrade__warning">{ru ? "Готовых фишек не хватает. Автоподбор может собрать недостающие." : "Not enough ready chips. Auto select may craft the missing ones."}</p>}
      {selectionComplete && <p className="chip-upgrade__selection-state"><CircleCheck aria-hidden="true" /> {ru ? `${rule.sacrifices} ${rule.sacrifices === 1 ? "фишка выбрана" : "фишки выбраны"}` : `${rule.sacrifices} chip${rule.sacrifices === 1 ? "" : "s"} selected`}</p>}
      {!selectionComplete && <button type="button" className="chip-upgrade__auto-entry" disabled={craft.isPending} onClick={() => setAutoOpen(true)}>{ru ? "Рассчитать автоподбор →" : "Calculate auto select →"}</button>}
      <div className="chip-upgrade__summary"><UpgradeCurrency label={ru ? "Цена" : "Cost"} value={rule.costTickets} /><UpgradeCurrency label={ru ? "Баланс" : "Balance"} value={ticketsAvailable} /></div>
      <button data-game-button="primary" type="button" className="chip-upgrade__confirm" disabled={!canConfirm} onClick={() => craft.mutate()} aria-label={ru ? `Улучшить за ${fmtTickets(rule.costTickets)} билетов` : `Upgrade for ${fmtTickets(rule.costTickets)} tickets`}>{craft.isPending ? (ru ? "Улучшаем…" : "Upgrading…") : <>{ru ? "Улучшить за" : "Upgrade for"} {fmtTickets(rule.costTickets)} <ResourceGlyph kind="tickets" /></>}</button>
      {!ticketsEnough && <p role="status" className="chip-upgrade__warning">{ru ? "Недостаточно билетов" : "Not enough tickets"}</p>}
      {!selectionComplete && <button type="button" className="chip-upgrade__back" onClick={onClose} disabled={craft.isPending}>{t("common.cancel")}</button>}
    </UpgradeShell>
    {autoOpen && <AutoUpgradeModal chipId={chipId} chipLevel={chipLevel} template={template} onClose={() => setAutoOpen(false)} onDone={onCrafted} />}
  </>;
}

export { SingleChipCraftModal };
