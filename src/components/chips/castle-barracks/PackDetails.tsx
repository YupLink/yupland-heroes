import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { ISLAND_TRAINING_PACK, TRAINING_PACK_CHIPS } from "@/lib/raid/island/catalog";
import type { listChipPacksPublic } from "@/server/api/chips-pack";
import type { listChipCollectionsPublic } from "@/server/api/chips-stake";
import "./pack-details.css";

import { thumb } from "@/lib/image";
export type OwnedPackStack = { id: string; name: string; imageUrl: string | null; count: number; kind: "chips" | "mystic" | "nft-ft" };
type PublicPack = Awaited<ReturnType<typeof listChipPacksPublic>>[number];
type Collection = Awaited<ReturnType<typeof listChipCollectionsPublic>>[number];
type Drop = { collectionId?: string | null; templateId?: string | null; level: number; weight: number };
type Guarantee = { minLevel: number; slotsAtLeast: number };

function percent(value: number, ru: boolean) {
  if (value > 0 && value < 0.01) return ru ? "<0,01 %" : "<0.01%";
  return `${new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(value)} %`;
}

function chipCountLabel(count: number) {
  const ending = count % 10;
  return count % 100 >= 11 && count % 100 <= 14 ? "фишек" : ending === 1 ? "фишка" : ending >= 2 && ending <= 4 ? "фишки" : "фишек";
}

export function PackDetails({ stack, pack, collections, detailsLoading, detailsError, pending, allowMultiOpen = true, canOpen = true, onClose, onOpen, onRetryDetails }: {
  stack: OwnedPackStack;
  pack?: PublicPack;
  collections?: Collection[];
  detailsLoading: boolean;
  detailsError: boolean;
  pending: boolean;
  allowMultiOpen?: boolean;
  canOpen?: boolean;
  onClose: () => void;
  onOpen: (count: number) => void;
  onRetryDetails: () => void;
}) {
  const ru = useAppStore((state) => state.lang) === "ru";
  const closeRef = useRef<HTMLButtonElement>(null);
  const oddsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
      if (event.key !== "Tab") return;
      const sheet = closeRef.current?.closest(".pack-detail-sheet");
      const actions = [...(sheet?.querySelectorAll<HTMLElement>("button:not(:disabled), summary") ?? [])].filter((item) => item.getClientRects().length > 0);
      if (!actions.length) return;
      const first = actions[0], last = actions[actions.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, []);

  const raw = pack?.dropTable as { slots?: number; dropTable?: Drop[]; guarantees?: Guarantee[] } | null | undefined;
  // Тренировочный пак острова (§8.47) скрыт из продажи — в каталоге его нет, состав знаем сами.
  const training = stack.id === ISLAND_TRAINING_PACK;
  const slots = training ? TRAINING_PACK_CHIPS : Number.isInteger(raw?.slots) && Number(raw?.slots) > 0 ? Number(raw?.slots) : null;
  const rawDrops = Array.isArray(raw?.dropTable) ? raw.dropTable : [];
  const drops = rawDrops.filter((item) => item != null && Number.isFinite(item.weight) && item.weight > 0 && Number.isInteger(item.level) && item.level > 0);
  const totalWeight = drops.reduce((sum, item) => sum + item.weight, 0);
  const guarantees = Array.isArray(raw?.guarantees) ? raw.guarantees : [];
  const validGuarantees = guarantees.filter(item => item != null && Number.isInteger(item.slotsAtLeast) && item.slotsAtLeast > 0 && item.slotsAtLeast <= (slots ?? 0) && Number.isInteger(item.minLevel) && item.minLevel > 0);
  const oddsAvailable = slots !== null && drops.length === rawDrops.length && validGuarantees.length === guarantees.length && Number.isFinite(totalWeight) && totalWeight > 0;
  const odds = new Map<string, { label: string; weight: number }>();
  for (const item of drops) {
    const collection = collections?.find((entry) => entry.id === item.collectionId);
    const subject = collection?.name ?? (item.collectionId ? (ru ? "Коллекция" : "Collection") : (ru ? "Фишка" : "Chip"));
    const label = item.templateId
      ? `${ru ? "Конкретная фишка" : "Specific chip"} · ${subject} · ${item.level}★`
      : `${subject} · ${item.level}★`;
    const key = `${item.templateId ? `template:${item.templateId}` : `collection:${item.collectionId ?? "any"}`}|${item.level}`;
    odds.set(key, { label, weight: (odds.get(key)?.weight ?? 0) + item.weight });
  }
  const maxOpen = Math.min(stack.count, 50);
  const description = pack?.description?.trim();
  const isChips = stack.kind === "chips";
  const typeLabel = stack.kind === "mystic" ? (ru ? "Мистический бокс" : "Mystic box") : stack.kind === "nft-ft" ? (ru ? "Пак NFT/FT" : "NFT/FT pack") : null;

  return createPortal(<div className="pack-detail-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section className="pack-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="pack-detail-title">
      <header className="pack-detail-head">
        <h2 id="pack-detail-title">{stack.name}</h2>
        <button ref={closeRef} type="button" className="pack-detail-close" onClick={onClose} disabled={pending} aria-label={ru ? "Закрыть" : "Close"}><X size={22} /></button>
      </header>
      <div className="pack-detail-scroll">
        <div className="pack-detail-summary">
          {stack.imageUrl ? <img src={thumb(stack.imageUrl, 400)} alt="" /> : <div className="pack-detail-image-empty">{ru ? "Арт пака недоступен" : "Pack art unavailable"}</div>}
          <div className="pack-detail-summary-copy">
            {typeLabel && <strong className="pack-detail-type">{typeLabel}</strong>}
            <span className="pack-detail-owned">{ru ? `×${stack.count} в наличии` : `×${stack.count} owned`}</span>
            {isChips && slots !== null && <strong>{ru ? "В одном паке —" : "Each pack has"} <em>{slots}</em> {ru ? chipCountLabel(slots) : "chips"}</strong>}
            {!isChips && <strong>{ru ? "Один розыгрыш при открытии" : "One draw when opened"}</strong>}
            {description && description !== "Три фишки внутри" && <p>{description}</p>}
          </div>
        </div>
        <details ref={oddsRef} className="pack-detail-odds">
          <summary onClick={(event) => { event.preventDefault(); if (oddsRef.current) oddsRef.current.open = !oddsRef.current.open; }}>{ru ? "Что может выпасть" : "What can drop"}</summary>
          <div className="pack-detail-odds-content">
          {detailsLoading ? <p role="status">{ru ? "Загружаем состав…" : "Loading contents…"}</p>
            : detailsError ? <div role="alert" className="pack-detail-unavailable"><p>{ru ? "Не удалось загрузить состав пака." : "Could not load pack contents."}</p><button type="button" onClick={onRetryDetails}>{ru ? "Повторить" : "Retry"}</button></div>
              : training ? <p>{ru ? "Тренировочные фишки 1–3★: бьются вполсилы, на рынке не продаются." : "Training chips 1–3★: half strength, can't be sold on the market."}</p>
              : !isChips ? <p>{ru ? "Состав и вероятности этого пака сейчас недоступны." : "Contents and chances are currently unavailable for this pack."}</p>
              : !pack || !oddsAvailable ? <p>{ru ? "Состав и вероятности этого пака сейчас недоступны." : "Contents and chances are currently unavailable for this pack."}</p>
              : <>
                {[...odds.entries()].map(([key, item]) => <div className="pack-detail-odds-row" key={key}><span>{item.label}</span><strong>{percent(item.weight / totalWeight * 100, ru)}</strong></div>)}
                {drops.some((item) => item.templateId) && <p className="pack-detail-footnote">{ru ? "Названия конкретных фишек пока не передаются в карточку пака." : "Specific chip names are not available in pack details yet."}</p>}
                {validGuarantees.map((item, index) => <p className="pack-detail-guarantee" key={index}>{ru ? `Гарантия: минимум ${item.slotsAtLeast} из ${slots} — от ${item.minLevel}★` : `Guaranteed: at least ${item.slotsAtLeast} of ${slots} at ${item.minLevel}★ or higher`}</p>)}
                <p className="pack-detail-footnote">{ru ? "Шанс для одной фишки до гарантий. Если пак заменят, состав изменится." : "Chance for one chip before guarantees. Contents change if the pack is substituted."}</p>
              </>}
          </div>
        </details>
      </div>
      <footer className="pack-detail-actions">
        <p className="pack-detail-warning">{ru ? "Содержимое разыгрывается в момент открытия — случайно и один раз. Закрыть пак обратно или переоткрыть его нельзя." : "Contents are drawn at opening, randomly and only once. The pack cannot be closed again or reopened."}</p>
        <div>
          <button type="button" className="pack-detail-primary" onClick={() => onOpen(1)} disabled={!canOpen || pending || detailsLoading || detailsError}>{!canOpen ? (ru ? "Открытие недоступно" : "Opening unavailable") : pending ? (ru ? "Открываем…" : "Opening…") : ru ? "Открыть 1" : "Open 1"}</button>
          {allowMultiOpen && stack.count > 1 && <button type="button" className="pack-detail-secondary" onClick={() => onOpen(maxOpen)} disabled={!canOpen || pending || detailsLoading || detailsError}>{ru ? maxOpen === stack.count ? `Все ×${stack.count}` : `Открыть ${maxOpen}` : maxOpen === stack.count ? `All ×${stack.count}` : `Open ${maxOpen}`}</button>}
        </div>
      </footer>
    </section>
  </div>, document.body);
}
