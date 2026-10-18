import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, History, Search, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { myChipInventory, myChipPackGrants } from "@/server/api/chips-pack";
import { getMyCollectionFarms, listChipCollectionsPublic } from "@/server/api/chips-stake";
import { needsCollectionUpgrade } from "./collectionUpgrade";
import { myTrainingChips } from "@/server/api/hallway";
import { ChipImage } from "@/components/ChipImage";
import { BarracksChipDetailLoader } from "./BarracksChipDetailLoader";
import { TrainingChipDetailModal } from "@/components/chips/TrainingChipDetailModal";
import { ChipHistoryModal } from "@/components/chips/ChipHistoryModal";
import { ShopTab } from "@/components/chips/ShopTab";
import { MyPacksScreen } from "./MyPacksScreen";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import yupikPackPreview from "@/assets/quests/yupik-pack.webp";
import { CollectionsTab } from "@/components/chips/CollectionsTab";
import { listMyMysticPacks } from "@/server/api/mystic";
import { chipBusyView } from "@/components/chips/chipBusy";
import { useNowTick } from "@/components/chips/chipBusy";
import { useT } from "@/lib/i18n";
import { useChipUpgradeReadiness } from "@/components/chips/useChipUpgradeReadiness";
import { upgradeBlockText } from "@/lib/chips/upgradeBlock";
import type { FlatChip } from "@/components/chips/FlatChipCard";
import "./barracks.css";
import "./pack-notice.css";

export function BarracksScreen({ onClose, onTavern, onViewMysticReward, onInitialPacksBack, onPacksBackToCamp, packsContent, initialPage = "chips", giftPack }: { onClose: () => void; onTavern: () => void; onViewMysticReward?: (kind: MysticRewardDestination) => void; onInitialPacksBack?: () => void; onPacksBackToCamp?: () => void; packsContent?: ReactNode; initialPage?: "chips" | "packs"; giftPack?: { giftId: string; packId: string } | null }) {
  const ru = useAppStore(s => s.lang) === "ru", t = useT(), tick = useNowTick();
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory() });
  const train = useQuery({ queryKey: ["my-training-chips"], queryFn: () => myTrainingChips() });
  const packs = useQuery({ queryKey: ["my-chip-packs"], queryFn: () => myChipPackGrants() });
  const boxes = useQuery({ queryKey: ["my-mystic-packs"], queryFn: () => listMyMysticPacks() });
  const [page, setPage] = useState<"chips" | "collections" | "packs">(initialPage);
  const [packTab, setPackTab] = useState<"owned" | "shop">("owned");
  const [returnPage, setReturnPage] = useState<"chips" | "collections">("chips");
  const [packOrigin, setPackOrigin] = useState<"camp" | "profile" | "close">(onPacksBackToCamp ? "camp" : onInitialPacksBack ? "profile" : initialPage === "packs" ? "close" : "camp");
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus(); }, [page]);
  const [search, setSearch] = useState(""), [filters, setFilters] = useState(false);
  const [level, setLevel] = useState(""), [collection, setCollection] = useState(""), [upgradeOnly, setUpgradeOnly] = useState(false);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const collectionMenuRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(6), [history, setHistory] = useState(false);
  const farms = useQuery({ queryKey: ["my-collection-farms"], queryFn: () => getMyCollectionFarms() });
  const collectionCovers = useQuery({ queryKey: ["chip-collections-public"], queryFn: () => listChipCollectionsPublic() });
  const readiness = useChipUpgradeReadiness(page === "chips");
  useEffect(() => {
    if (!collectionMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!collectionMenuRef.current?.contains(event.target as Node)) setCollectionMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [collectionMenuOpen]);
  const inventoryPending = inv.isFetching || train.isFetching;
  const collectionNeedsUpgrade = (farms.data ?? []).some(needsCollectionUpgrade);
  const [selected, setSelected] = useState<FlatChip | null>(null);
  const chipTrigger = useRef<HTMLButtonElement | null>(null);
  const closeChip = () => { setSelected(null); requestAnimationFrame(() => (chipTrigger.current?.isConnected ? chipTrigger.current : back.current)?.focus()); };
  const flat = useMemo<FlatChip[]>(() => {
    const owned = (!inv.isError && !inv.isFetching ? inv.data ?? [] : []).flatMap(g => g.chips.map(c => ({ ...c, templateId: g.templateId, templateNo: g.templateNo, templateName: g.templateName, imageUrl: g.imageUrl, collectionId: g.collectionId, collectionName: g.collectionName, level: g.level })));
    const training = (!train.isError && !train.isFetching ? train.data ?? [] : []).map(c => ({ ...c, templateId: "__training__", templateNo: c.serialNo, templateName: ru ? "Тренировочная" : "Training", imageUrl: c.imageUrl ?? "", collectionId: "__training__", collectionName: ru ? "Тренировочные" : "Training", level: c.star, isTraining: true }));
    return [...owned, ...training].sort((a, b) => b.level - a.level || (a.serialNo ?? 0) - (b.serialNo ?? 0));
  }, [inv.data, inv.isError, inv.isFetching, train.data, train.isError, train.isFetching, ru]);
  const options = [...new Map(flat.map(c => [c.collectionId, c.collectionName])).entries()];
  const coverByCollection = new Map((collectionCovers.data ?? []).map(item => [item.id, item.coverImageUrl]));
  const levels = [...new Set(flat.map(c => c.level))].sort((a, b) => a - b);
  const query = search.trim().toLocaleLowerCase().replace(/^№|^#/, "");
  const filtered = flat.filter(c => (!level || c.level === Number(level)) && (!collection || c.collectionId === collection) && (!query || `${c.templateName} ${c.serialNo ?? ""} ${c.templateNo}`.toLocaleLowerCase().includes(query)) && (!upgradeOnly || readiness.data?.chips[c.id]?.can === true));
  const readinessWaiting = upgradeOnly && !readiness.data && !readiness.isError;
  const readinessFailed = upgradeOnly && readiness.isError;
  const packCountReady = packs.data !== undefined && boxes.data !== undefined && !packs.isError && !boxes.isError && !packs.isFetching && !boxes.isFetching;
  const count = packCountReady ? packs.data.filter(p => !p.openedAt).length + boxes.data.filter(b => !b.opened).length : 0;
  const reset = () => { setSearch(""); setLevel(""); setCollection(""); setUpgradeOnly(false); setVisible(6); };
  const name = (c: FlatChip) => c.templateName.replace(/^#\d+\s*/, "").replace(/\s*\(Premium\)$/i, "");
  const returnToList = () => {
    if (packOrigin === "profile") return onInitialPacksBack?.();
    if (packOrigin === "close") return onClose();
    onPacksBackToCamp?.();
    setPage(returnPage);
  };
  return <section className={`barracks-preview${page === "packs" && packTab === "shop" ? " barracks-preview--shop" : ""}`} aria-label={page === "packs" ? (ru ? "Паки" : "Packs") : (ru ? "Тренировочный лагерь" : "Training camp")}>
    <header className="barracks-header">
      <button ref={back} onClick={page === "packs" ? packTab === "shop" ? () => setPackTab("owned") : returnToList : onClose} className="barracks-back"><ArrowLeft size={19} />{page === "packs" ? packTab === "shop" ? (ru ? "Мои паки" : "My packs") : packOrigin === "camp" ? (ru ? "Тренировочный лагерь" : "Training camp") : packOrigin === "profile" ? (ru ? "Профиль" : "Profile") : (ru ? "Назад" : "Back") : (ru ? "Замок" : "Castle")}</button>
      <h1 id="castle-window-title">{page === "packs" ? (ru ? "Паки" : "Packs") : (ru ? "Тренировочный лагерь" : "Training camp")}</h1>
      <button className="barracks-history" onClick={() => setHistory(true)} aria-label={ru ? "История фишек" : "Chip history"}><History size={19} /><span>{ru ? "История" : "History"}</span></button>
    </header>
    <div className="barracks-courtyard" aria-hidden="true" />
    <div className="barracks-content">
      {(page === "chips" || page === "collections") && <>
        <button className="barracks-pack-entry" onClick={() => { setReturnPage(page); setPackOrigin("camp"); setPage("packs"); }} aria-label={packCountReady && count ? (ru ? `Паки, неоткрытых: ${count}` : `Packs, unopened: ${count}`) : undefined}>
          <img src={yupikPackPreview} alt="" /><span><strong>{ru ? "Паки" : "Packs"}</strong><small>{packs.isFetching || boxes.isFetching ? (ru ? "Загрузка…" : "Loading…") : packs.isError || boxes.isError ? (ru ? "Открыть паки" : "View packs") : count ? (ru ? "Ждут открытия" : "Waiting to open") : (ru ? "Нет неоткрытых паков" : "No unopened packs")}</small></span>{count > 0 && <span className="barracks-pack-notice" aria-hidden="true">{count > 9 ? "9+" : count}</span>}<ChevronRight size={22} />
        </button>
        <nav className="barracks-tabs" aria-label={ru ? "Разделы лагеря" : "Camp sections"}>
          <button aria-pressed={page === "chips"} onClick={() => setPage("chips")}>{ru ? "Фишки" : "Chips"}</button>
          <button
            aria-pressed={page === "collections"}
            aria-label={collectionNeedsUpgrade ? (ru ? "Коллекции: проверь доход" : "Collections: check earnings") : undefined}
            onClick={() => setPage("collections")}
          >
            {ru ? "Коллекции" : "Collections"}
            {collectionNeedsUpgrade && <span className="barracks-collection-notice" aria-hidden="true" />}
          </button>
        </nav>
      </>}
      {page === "chips" && <>
        <div className="barracks-search-row"><label className="barracks-search"><Search size={19} /><input aria-label={ru ? "Найти фишку" : "Find a chip"} placeholder={ru ? "Найти фишку" : "Find a chip"} value={search} onChange={e => { setSearch(e.target.value); setVisible(6); }} /></label>
          <button className="barracks-filter-button" aria-label={ru ? "Фильтры" : "Filters"} aria-expanded={filters} onClick={() => setFilters(!filters)}><SlidersHorizontal size={18} /><span>{ru ? "Фильтры" : "Filters"}{level || collection || upgradeOnly ? " ·" : ""}</span></button></div>
        {filters && <div className="barracks-filters">
          <label>{ru ? "Коллекция" : "Collection"}<div className="barracks-collection-picker" ref={collectionMenuRef} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setCollectionMenuOpen(false); }}>
            <button type="button" className="barracks-collection-trigger" aria-haspopup="listbox" aria-expanded={collectionMenuOpen} onClick={() => setCollectionMenuOpen(open => !open)} onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setCollectionMenuOpen(true); requestAnimationFrame(() => collectionMenuRef.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus()); } }}><span>{options.find(([id]) => id === collection)?.[1] ?? (ru ? "Все коллекции" : "All collections")}</span><ChevronDown aria-hidden="true" size={14} /></button>
            {collectionMenuOpen && <div className="barracks-collection-list" role="listbox" aria-label={ru ? "Коллекции" : "Collections"}>
              {([["", ru ? "Все коллекции" : "All collections"], ...options] as [string, string][]).map(([id, title]) => <button key={id || "all"} type="button" role="option" aria-selected={collection === id} onClick={() => { setCollection(id); setVisible(6); setCollectionMenuOpen(false); collectionMenuRef.current?.querySelector<HTMLButtonElement>('.barracks-collection-trigger')?.focus(); }} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); setCollectionMenuOpen(false); collectionMenuRef.current?.querySelector<HTMLButtonElement>('.barracks-collection-trigger')?.focus(); } else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const items = Array.from(collectionMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []); const at = items.indexOf(e.currentTarget); items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); } }}>{id && coverByCollection.get(id) ? <img className="barracks-collection-icon" src={coverByCollection.get(id)!} alt="" onError={e => { e.currentTarget.hidden = true; }} /> : id ? <span className="barracks-collection-icon is-empty" aria-hidden="true" /> : null}<span>{title}</span></button>)}
            </div>}
          </div></label>
          <label>{ru ? "Уровень" : "Level"}<select value={level} onChange={e => { setLevel(e.target.value); setVisible(6); }}><option value="">{ru ? "Все уровни" : "All levels"}</option>{levels.map(l => <option key={l} value={l}>{l} ★</option>)}</select></label>
          <label className="barracks-upgrade-filter"><input type="checkbox" checked={upgradeOnly} onChange={e => { setUpgradeOnly(e.target.checked); setVisible(6); }} /><span>{ru ? "Можно улучшить" : "Can upgrade"}</span></label>
          {(search || level || collection || upgradeOnly) && <button className="barracks-filter-reset" onClick={reset}>{ru ? "Сбросить" : "Reset"}</button>}
        </div>}
        <h2 className="barracks-count">{ru ? "Мои фишки" : "My chips"} · {inv.isError || train.isError ? "—" : inventoryPending || readinessWaiting || readinessFailed ? "…" : filtered.length}</h2>
        {(inv.isError || train.isError) && <div role="alert" className="barracks-message"><p>{inv.isError ? (ru ? "Не удалось загрузить обычные фишки" : "Unable to load regular chips") : (ru ? "Не удалось загрузить тренировочные фишки" : "Unable to load training chips")}</p><button onClick={() => { void inv.refetch(); void train.refetch(); }}>{ru ? "Повторить" : "Retry"}</button></div>}
        {inventoryPending && <p role="status" className="barracks-message">{ru ? "Загрузка фишек…" : "Loading chips…"}</p>}
        {readinessWaiting && !inventoryPending && <p role="status" className="barracks-message">{ru ? "Проверяем возможность улучшения…" : "Checking upgrade availability…"}</p>}
        {readinessFailed && !inventoryPending && <div role="alert" className="barracks-message"><p>{ru ? "Не удалось проверить улучшения" : "Could not check upgrades"}</p><button onClick={() => void readiness.refetch()}>{ru ? "Повторить" : "Retry"}</button></div>}
        {!readinessWaiting && !readinessFailed && (filtered.length === 0 && !inventoryPending && !inv.isError && !train.isError ? <div className="barracks-message"><p>{flat.length ? upgradeOnly ? (ru ? "Сейчас нет фишек, которые можно улучшить" : "No chips can be upgraded now") : (ru ? "Фишки не найдены" : "No matching chips") : (ru ? "У тебя пока нет фишек" : "You have no chips yet")}</p>{flat.length > 0 && <button onClick={reset}>{ru ? "Сбросить поиск и фильтры" : "Clear search and filters"}</button>}</div> : <div className="barracks-shelves">
          {Array.from({ length: Math.ceil(Math.min(visible, filtered.length) / 3) }, (_, row) => <div className="barracks-shelf-row" key={row}>
          {filtered.slice(row * 3, Math.min(row * 3 + 3, visible)).map(c => { const busy = chipBusyView(c, tick, t); const upgrade = c.isTraining || readiness.isError ? undefined : readiness.data?.chips[c.id]; const reason = upgrade && !upgrade.can ? upgradeBlockText(upgrade.reason, t) : null; return <button key={c.id} className="barracks-chip" onClick={e => { chipTrigger.current = e.currentTarget; setSelected(c); }} aria-label={`${name(c)}, ${c.isTraining ? (ru ? `тренировочная фишка №${c.serialNo ?? "?"}` : `training chip #${c.serialNo ?? "?"}`) : (ru ? `вид №${c.templateNo}` : `type #${c.templateNo}`)}, ${ru ? "уровень" : "level"} ${c.level}${busy ? `, ${busy.hint}` : ""}${upgrade?.can ? (ru ? ", можно улучшить" : ", can upgrade") : reason ? (ru ? `, улучшение недоступно: ${reason}` : `, upgrade unavailable: ${reason}`) : ""}`}>
            <ChipImage src={c.imageUrl} level={c.level} alt="" className={busy ? "grayscale opacity-70" : ""} />
            <strong>{name(c)}</strong><small>№{c.isTraining ? c.serialNo ?? "?" : c.templateNo}</small>{upgrade && <span className={`barracks-upgrade-mark${upgrade.can ? " is-ready" : ""}`} title={reason ?? undefined}>{upgrade.can ? (ru ? "Можно улучшить" : "Can upgrade") : (ru ? "Пока нельзя" : "Not available")}</span>}{busy && <span className="barracks-busy">{busy.hint}</span>}{c.isTraining && <span className="barracks-busy">{ru ? "Тренировочная" : "Training"}</span>}
          </button>; })}<div className="barracks-shelf-board" aria-hidden="true"><img src="/design-assets/barracks-shelf.webp" alt="" /></div></div>)}
        </div>)}
        {visible < filtered.length && <button className="barracks-more" onClick={() => setVisible(v => v + 6)}>{ru ? "Показать ещё" : "Show more"}<ChevronDown size={18} /></button>}
        <button className="barracks-tavern" onClick={onTavern}>{ru ? "Герои и снаряжение" : "Heroes and equipment"}<ArrowRight size={16} />{ru ? "Таверна" : "Tavern"}</button>
      </>}
      {page === "packs" && (packTab === "owned" ? <div className="barracks-packs">{packsContent ?? <MyPacksScreen onViewMysticReward={onViewMysticReward} giftPack={giftPack} onBuyPacks={() => setPackTab("shop")} />}</div> : <ShopTab mode="camp" onClose={() => setPackTab("owned")} onOpenPacks={() => setPackTab("owned")} />)}
      {page === "collections" && <CollectionsTab compactHelp />}
    </div>
    {history && <ChipHistoryModal onClose={() => setHistory(false)} />}
    {selected && !selected.isTraining && <div className="barracks-chip-detail"><BarracksChipDetailLoader upgradeState={readiness.isError ? undefined : readiness.data?.chips[selected.id]} chipId={selected.id} templateId={selected.templateId} stunUntil={selected.stunUntil} onClose={closeChip} /></div>}
    {selected?.isTraining && <TrainingChipDetailModal chipId={selected.id} star={selected.level} serialNo={selected.serialNo ?? selected.templateNo} sellTickets={selected.sellTickets ?? 0} sellable={selected.sellable !== false} imageUrl={selected.imageUrl} onClose={closeChip} onSold={() => { closeChip(); void train.refetch(); }} />}
  </section>;
}

