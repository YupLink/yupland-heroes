import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, X } from "lucide-react";
import type { Item } from "@/components/MysticInventoryCards";
import { ringOf } from "@/components/MysticInventoryCards";
import { GearSlotIcon } from "@/components/beta-raid/castle/GearPaperDoll";
import { GearItemLines } from "@/components/beta-raid/castle/GearItemLines";
import { gearSlotLabel } from "@/components/beta-raid/castle/GearSlotDetails";
import { RARITY_COLOR } from "@/components/heroes/heroLabels";
import { artifactSummary } from "@/components/artifactSummary";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { invalidateHeroQueries } from "@/lib/query";
import { equipArtifact, getOwnedHeroGear } from "@/server/api/heroes-gear";
import { getMySelectedHero } from "@/server/api/heroes-select";
import type { GearItemView } from "@/server/api/heroes-gear-read";
import { TavernDialog } from "./TavernDialog";
import { ArtWearBar } from "@/components/ArtWearBar";
import { useArtLocked } from "@/lib/hooks/useArtBroken";
import { humanError } from "@/lib/humanError";
import { EnchantMark } from "@/components/EnchantMark";

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const number = (value: number, ru: boolean) => new Intl.NumberFormat(ru ? "ru" : "en", { maximumFractionDigits: 2 }).format(finite(value));

function ItemFace({ item, status, ru }: { item: Item | GearItemView; status: "selected" | "equipped"; ru: boolean }) {
  const imageUrl = item.imageUrl;
  const color = RARITY_COLOR[item.rarity ?? ""] ?? "#9aa4bd";
  return <div data-compare-item>
    <div data-compare-image style={{ borderColor: color }}>
      {imageUrl ? <img src={thumb(imageUrl, 180)} alt="" /> : <GearSlotIcon slot={item.slot ?? "Голова"} />}
      <span data-compare-sticker={status}>{status === "equipped" ? (ru ? "Надето" : "Equipped") : (ru ? "Выбрано" : "Selected")}</span>
      <ArtWearBar durability={item.durability} className="rounded-b-[7px]" />
    </div>
    <strong>{stripStatSuffix(item.name)}</strong>
    <span style={{ color }}>{metaLabel(item.rarity, ru ? "ru" : "en")}</span>
    <EnchantMark pct={item.enchantPct} show="text" className="mt-0.5 text-[11px]" />
  </div>;
}

export function TavernArtifactSheet({ artifact, heroId, heroName, canEquip, onClose }: {
  artifact: Item; heroId: string | null; heroName: string | null; canEquip: boolean; onClose: () => void;
}) {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const [slotKey, setSlotKey] = useState<string | null>(null);
  // Сломанный при запущенной механике не надевается (§8.63 п.3) — кнопка неактивна.
  const broken = useArtLocked()(artifact.durability);
  const gear = useQuery({
    queryKey: ["my-hero-gear", "view", heroId],
    queryFn: () => getOwnedHeroGear({ data: { heroId: heroId! } }),
    enabled: !!heroId,
    staleTime: 30_000,
  });
  const slots = Array.isArray(gear.data?.slots) ? gear.data.slots.filter(slot => slot.slot === artifact.slot) : [];
  const wornSlot = slots.find(slot => slot.item?.itemIds.includes(artifact.id));
  const chosenSlot = slots.find(slot => slot.key === slotKey) ?? wornSlot ?? slots[0];
  const worn = chosenSlot?.item ?? null;
  const candidate = wornSlot?.item ?? gear.data?.available?.[artifact.slot ?? ""]?.find(item => item.itemIds.includes(artifact.id)) ?? null;
  const canCompare = !!candidate?.statKey && (!worn || candidate.statKey === worn.statKey) &&
    Number.isFinite(candidate.total) && (!worn || Number.isFinite(worn.total));
  const before = canCompare && worn ? worn.total : 0;
  const after = canCompare ? candidate.total : 0;
  const difference = after - before;
  const direction = difference > 0 ? "gain" : difference < 0 ? "loss" : "equal";
  const scale = Math.max(1, before, after);
  const statName = candidate?.statType ? metaLabel(candidate.statType, ru ? "ru" : "en") : "";
  const rawFacts = artifactSummary({ ...artifact, slot: null }, ru ? "ru" : "en").split("\n").filter(Boolean);
  const equip = useMutation({
    mutationFn: async () => {
      if (!canEquip || !heroId || !chosenSlot || !candidate || wornSlot) throw new Error(ru ? "Предмет сейчас недоступен" : "Item is unavailable");
      const selected = await getMySelectedHero();
      if (selected.heroId !== heroId) throw new Error(ru ? "Активный герой изменился. Открой снаряжение заново." : "The active hero changed. Reopen equipment.");
      return equipArtifact({ data: { itemId: artifact.id, slotKey: chosenSlot.key } });
    },
    onSuccess: async () => { await invalidateHeroQueries(qc); onClose(); },
  });
  return <TavernDialog title={stripStatSuffix(artifact.name)} onClose={onClose} locked={equip.isPending} overlayClassName="fixed inset-0 z-[130] flex items-end justify-center bg-black/70" className="artifact-bottom-sheet artifact-compare-sheet" style={{ borderColor: ringOf(artifact) }}>
    <div data-artifact-sheet-handle aria-hidden="true" />
    <button data-artifact-sheet-close type="button" aria-label={ru ? "Закрыть" : "Close"} onClick={onClose} disabled={equip.isPending}><X aria-hidden="true" size={22} /></button>
    <h3 data-compare-title>{artifact.slot ? metaLabel(artifact.slot, ru ? "ru" : "en") : stripStatSuffix(artifact.name)}</h3>
    {slots.length > 1 && <div data-compare-slots role="group" aria-label={ru ? "Место для сравнения" : "Slot to compare"}>
      {slots.map(slot => <button data-game-button="surface" key={slot.key} type="button" aria-pressed={chosenSlot?.key === slot.key} onClick={() => setSlotKey(slot.key)}>{gearSlotLabel(slot, ru ? "ru" : "en")}</button>)}
    </div>}
    <div data-compare-items data-single={wornSlot ? "true" : undefined}>
      <ItemFace item={artifact} status={wornSlot ? "equipped" : "selected"} ru={ru} />
      {!wornSlot && <><ArrowLeftRight data-compare-arrow aria-hidden="true" size={22} />
        {worn ? <ItemFace item={worn} status="equipped" ru={ru} /> : <div data-compare-empty>{ru ? "Место свободно" : "Empty slot"}</div>}</>}
    </div>
    {heroId && gear.isPending && <p role="status">{ru ? "Считаем характеристики…" : "Loading attributes…"}</p>}
    {gear.isError && <p role="alert">{ru ? "Не удалось загрузить характеристики героя." : "Could not load hero attributes."} <button data-game-button="surface" type="button" onClick={() => void gear.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>}
    {canCompare && !wornSlot && <div data-compare-track data-direction={direction}>
      <div data-compare-track-label><strong>{statName}{heroName ? ` ${ru ? "для" : "for"} ${heroName}` : ""}</strong><span>{number(before, ru)} <ArrowRight aria-hidden="true" size={17} /> {number(after, ru)}</span><b>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{number(Math.abs(difference), ru)}</b></div>
      <div data-compare-rail role="img" aria-label={`${statName}: ${number(before, ru)} → ${number(after, ru)}, ${difference > 0 ? "+" : difference < 0 ? "−" : ""}${number(Math.abs(difference), ru)}`}>
        <span data-compare-before style={{ width: `${Math.max(0, before / scale * 100)}%` }} />
        <span data-compare-after style={{ left: `${Math.max(0, Math.min(before, after) / scale * 100)}%`, width: `${Math.abs(difference) / scale * 100}%` }} />
        <i data-compare-marker style={{ left: `${Math.max(0, before / scale * 100)}%` }} />
      </div>
    </div>}
    {(candidate || (worn && !wornSlot)) && <div data-compare-breakdowns data-dual={candidate && worn && !wornSlot ? "true" : undefined}>
      {candidate && <div data-compare-breakdown>
        <h4>{wornSlot ? (ru ? "Надето" : "Equipped") : (ru ? "Выбрано" : "Selected")} · {stripStatSuffix(candidate.name)}</h4>
        <GearItemLines item={candidate} />
      </div>}
      {worn && !wornSlot && <div data-compare-breakdown>
        <h4>{ru ? "Надето" : "Equipped"} · {stripStatSuffix(worn.name)}</h4>
        <GearItemLines item={worn} />
      </div>}
    </div>}
    {candidate && worn && !canCompare && !wornSlot && <p data-compare-note>{ru ? "Предметы меняют разные характеристики; общую разницу показать нельзя." : "These items affect different attributes; there is no single difference."}</p>}
    {!candidate && rawFacts.length > 0 && <div data-compare-breakdown><h4>{ru ? "Характеристики предмета" : "Item attributes"}</h4>{rawFacts.map((fact, index) => <p key={`${index}-${fact}`}>{fact}</p>)}</div>}
    {!heroId && <p data-compare-note>{ru ? "Выбери героя, чтобы сравнить предметы." : "Select a hero to compare items."}</p>}
    {heroId && gear.isSuccess && !candidate && <p data-compare-note>{ru ? "Для этого героя расчёт предмета сейчас недоступен." : "This item's calculation is unavailable for this hero."}</p>}
    {!wornSlot && candidate && chosenSlot && canEquip && <button data-compare-equip data-game-button="primary" type="button" disabled={equip.isPending || broken} data-art-locked={broken ? "1" : undefined} onClick={() => equip.mutate()}>{equip.isPending ? (ru ? "Надеваем…" : "Equipping…") : `${ru ? "Надеть" : "Equip"} ${stripStatSuffix(artifact.name)}`}</button>}
    {equip.isError && <p role="alert" data-compare-note>{equip.error instanceof Error ? humanError(equip.error) : (ru ? "Не удалось надеть предмет." : "Could not equip item.")}</p>}
  </TavernDialog>;
}
