import { heroAbilityLabel } from "@/lib/hero/heroAbilities";
import "./tavern.css";
import "./tavern-immersive.css";
import "./tavern-hero-cards.css";
import { TavernArtifacts } from "./TavernArtifacts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { listMyHeroes } from "@/server/api/heroes-read";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { useAppStore } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { thumb } from "@/lib/image";
import { metaLabel } from "@/components/heroMeta";
import { HeroSummaryCard } from "@/components/heroes/HeroSummaryCard";
import { HeroEffectSummary } from "@/components/beta-raid/HeroEffectSummary";
import { HeroLevelUp } from "@/components/beta-raid/HeroLevelUp";
import { heroCombat, heroField } from "@/lib/hero/heroPowerCurve";
import { heroSlots } from "@/lib/hero/heroSlots";
import { CastleModal } from "@/components/beta-raid/castle/CastleModal";
import type { CastleTab } from "@/components/beta-raid/castle/CastleTabs";
import { TavernSelectHero } from "./TavernSelectHero";
import { TavernHeroCard } from "./TavernHeroCard";
import { TavernOtherHeroes, useTavernHeroOrder } from "./TavernHeroOrder";

/** Original hero components, real owned data; viewing never selects or wakes a hero. */
function scrollHostFor(element: HTMLElement | null): HTMLElement | null {
  for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
    if (["auto", "scroll"].includes(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

export function TavernWindow({ onClose, allowHeroSelection = false, initialSection = "heroes", rewardItemId }: { onClose: () => void; allowHeroSelection?: boolean; initialSection?: "heroes" | "artifacts"; rewardItemId?: string }) {
  const ru = useLang() === "ru";
  const wallet = useAppStore((s) => s.walletAddress);
  // Тот же ключ, что у окна героя в режиме просмотра (useCastle): один список
  // на таверну и открытого героя, а не по запросу на каждый тап.
  const heroes = useQuery({
    queryKey: ["my-heroes", "view", wallet],
    queryFn: () => listMyHeroes(),
    staleTime: 30_000,
    gcTime: 0,
  });
  const selectedHero = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
  });
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<CastleTab>("gear");
  const [compareMode, setCompareMode] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(initialSection === "artifacts");
  const autoOpenedRewardItem = useRef<string | null>(null);
  const listHost = useRef<HTMLDivElement>(null);
  const listScrollTop = useRef<number | null>(null);
  const switchingHero = useRef(false);
  // Успешный ответ этой сессии: ключи «view» не персистятся, gcTime 0.
  const ready = heroes.isSuccess;
  const rows = ready ? (heroes.data ?? []) : [];
  const keyOf = (h: (typeof rows)[number]) => h.itemId ?? h.id ?? `template:${h.templateId}`;
  const activeHeroId = selectedHero.isSuccess ? selectedHero.data?.heroId : null;
  const activeHero = activeHeroId ? rows.find((h) => h.id === activeHeroId) : null;
  const heroOrder = useTavernHeroOrder(rows, activeHeroId, wallet);
  const otherHeroes = heroOrder.otherHeroes;
  const chosen = chosenKey === null ? null : rows.find((h) => keyOf(h) === chosenKey || (h.id != null && h.id === chosenKey));
  const browsable = heroOrder.browsable;
  const chosenIndex = chosenKey === null ? -1 : browsable.findIndex(h => keyOf(h) === chosenKey || (h.id != null && h.id === chosenKey));
  const openHero = (h: (typeof rows)[number]) => {
    listScrollTop.current = scrollHostFor(listHost.current)?.scrollTop ?? null;
    const inactive = h.id !== activeHeroId;
    setDetailTab(inactive ? "hero" : "gear");
    setCompareMode(inactive);
    setChosenKey(keyOf(h));
  };
  useLayoutEffect(() => {
    if (chosenKey !== null || listScrollTop.current === null) return;
    scrollHostFor(listHost.current)?.scrollTo({ top: listScrollTop.current });
    listScrollTop.current = null;
  }, [chosenKey]);
  useLayoutEffect(() => {
    if (chosenKey !== null || !switchingHero.current) return;
    switchingHero.current = false;
    const frame = requestAnimationFrame(() => {
      const others = listHost.current?.querySelector<HTMLElement>("[data-other-heroes]");
      others?.scrollIntoView({ block: "start" });
      others?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [chosenKey]);
  useEffect(() => {
    if (initialSection !== "heroes" || !rewardItemId || !heroes.isSuccess || autoOpenedRewardItem.current === rewardItemId) return;
    const rewarded = rows.find(h => h.itemId === rewardItemId);
    if (rewarded) {
      autoOpenedRewardItem.current = rewardItemId;
      openHero(rewarded);
    }
  }, [heroes.isSuccess, rewardItemId]);
  const browse = (step: number) => {
    const next = browsable[chosenIndex + step];
    if (!next) return;
    const active = next.id === activeHeroId;
    setCompareMode(!active);
    setDetailTab(active ? "gear" : "hero");
    setChosenKey(keyOf(next));
  };
  const detailHost = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastDetailKey = useRef<string | null>(null);
  const selectionFor = (placement: "gear" | "hero") => chosen && allowHeroSelection && selectedHero.isSuccess
    ? <TavernSelectHero key={`${keyOf(chosen)}:${placement}`} hero={chosen} active={chosen.id != null && chosen.id === activeHeroId} ru={ru} onSelected={id => { setChosenKey(id); void selectedHero.refetch(); void heroes.refetch(); }} />
    : null;
  useEffect(() => {
    if (!chosen) { lastDetailKey.current = null; return; }
    detailHost.current?.scrollIntoView({ block: "start" });
    if (!lastDetailKey.current) detailHost.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    lastDetailKey.current = keyOf(chosen);
  }, [chosenKey]);
  const heroNavigator = chosen && browsable.length > 1 ? () => <><div data-hero-pager
    onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
    onTouchEnd={event => { const start = touchStart.current; touchStart.current = null; if (!start) return; const dx = event.changedTouches[0].clientX - start.x; const dy = event.changedTouches[0].clientY - start.y; if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) browse(dx < 0 ? 1 : -1); }}
    onTouchCancel={() => { touchStart.current = null; }}
  >
    <button type="button" aria-label={ru ? "Предыдущий герой" : "Previous hero"} disabled={chosenIndex <= 0} onClick={() => browse(-1)}><ChevronLeft aria-hidden="true" /></button>
    <div data-hero-pager-current data-rarity={chosen.rarity} aria-live="polite">
      {chosen.imageUrl && <span data-hero-pager-portrait><img src={thumb(chosen.imageUrl, 128, "black")} alt="" /></span>}
      <div data-hero-pager-details>
        <strong>{chosen.name}</strong>
        <span data-hero-pager-meta>{[chosen.race, chosen.specialization].filter(Boolean).map(value => metaLabel(value as string, ru ? "ru" : "en")).concat(heroAbilityLabel(chosen.ability, ru ? "ru" : "en") || []).join(" · ")}</span>
        <span data-hero-pager-facts><span data-hero-pager-rarity>{metaLabel(chosen.rarity, ru ? "ru" : "en")}</span><span data-hero-pager-slots>{heroSlots(chosen.rarity).length} {ru ? "слотов" : "slots"}</span></span>
        {chosen.id === activeHeroId && <button data-hero-pager-action type="button" onClick={() => setDetailTab(detailTab === "gear" ? "hero" : "gear")}>{detailTab === "gear" ? (ru ? "Характеристики" : "Characteristics") : (ru ? "Экипировка" : "Equipment")}</button>}
      </div>
    </div>
    <button type="button" aria-label={ru ? "Следующий герой" : "Next hero"} disabled={chosenIndex >= browsable.length - 1} onClick={() => browse(1)}><ChevronRight aria-hidden="true" /></button>
  </div></> : undefined;
  if (showArtifacts) return <div data-tavern-artifacts-page className="mx-auto w-full max-w-md px-4 pb-8">
    <button data-artifacts-back data-game-button="text" type="button" className="mb-5 flex min-h-11 items-center gap-2" onClick={() => setShowArtifacts(false)}><ArrowLeft size={18} aria-hidden="true" />{chosen ? `${chosen.name} · ${ru ? "Снаряжение" : "Equipment"}` : (ru ? "Герои" : "Heroes")}</button>
    {heroes.isError ? <p role="alert">{ru ? "Не удалось проверить героев и артефакты." : "Could not verify heroes and artifacts."} <button data-game-button="secondary" type="button" onClick={() => void heroes.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>
      : !ready ? <p role="status">{ru ? "Загрузка артефактов…" : "Loading artifacts…"}</p>
      : <TavernArtifacts heroes={rows} rewardItemId={rewardItemId} heroId={chosen ? chosen.id : (activeHeroId ?? null)} heroName={chosen ? chosen.name : (activeHero?.name ?? null)} canEquip={!chosen || chosen.id === activeHeroId} />}
  </div>;
  if (chosen?.id)
    return (
      <div data-tavern-detail ref={detailHost} className="mx-auto w-full max-w-md space-y-2">
        <div data-hero-detail-actions>
          <button data-game-button="secondary"
            data-hero-back
            type="button"
            className="flex min-h-11 items-center gap-2 px-3 text-sm"
            onClick={() => { setChosenKey(null); setCompareMode(false); }}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {ru ? "Мои герои" : "My heroes"}
          </button>
          {chosen.id === activeHeroId && otherHeroes.length > 0 && <button data-change-hero type="button" onClick={() => { switchingHero.current = true; setChosenKey(null); setCompareMode(false); }}>
            {ru ? "Сменить героя" : "Change hero"}
          </button>}
        </div>
        {detailTab === "gear" ? selectionFor("gear") : null}
        <CastleModal
          key={chosen.id}
          viewedHeroId={chosen.id}
          embedded
          embeddedTab={detailTab}
          onEmbeddedTabChange={setDetailTab}
          heroNavigator={heroNavigator}
          heroAction={detailTab === "hero" ? selectionFor("hero") : undefined}
          onShowArtifacts={() => setShowArtifacts(true)}
          showGearTab={chosen.id === activeHeroId}
          allowLevelUp
          readOnly
          onClose={() => setChosenKey(null)}
        />
      </div>
    );
  if (chosen) return (
    <div data-tavern-detail data-tavern-hero="true" data-hero-screen="hero" ref={detailHost} className="mx-auto w-full max-w-md space-y-2">
      <button data-game-button="secondary" data-hero-back type="button" className="flex min-h-11 items-center gap-2 px-3 text-sm" onClick={() => { setChosenKey(null); setCompareMode(false); }}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />{ru ? "Мои герои" : "My heroes"}
      </button>
      <div className="px-4 pb-4">
        {heroNavigator?.()}
        <h2 data-hero-stats-title className="mt-4">{ru ? "Характеристики" : "Stats"}</h2>
        <div className="mt-1.5 mb-3"><HeroLevelUp hero={chosen} expanded onLeveled={setChosenKey} /></div>
        <HeroSummaryCard hero={chosen} stats={chosen.stats} showIdentity={!heroNavigator} radarSize={300} compact afterRadar={selectionFor("hero")}
          detailsContent={<HeroEffectSummary compact combat={heroCombat(chosen.stats)} field={heroField(chosen.stats)} />} />
      </div>
    </div>
  );
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        ref={listHost}
        data-tavern-list
        data-tavern-immersive
        aria-labelledby="tavern-title"
        className="w-full rounded-2xl border border-border bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tavern-title" className="px-4 pt-4 font-semibold">{ru ? "Активный герой" : "Active hero"}</h2>
        <div className="space-y-5 p-4">
          {initialSection === "heroes" && rewardItemId && ready && !rows.some(h => h.itemId === rewardItemId) && <p role="status" className="text-sm text-muted-foreground">{ru ? "Полученный герой пока не появился в списке." : "The rewarded hero is not in the list yet."}</p>}
          {selectedHero.isError && <p role="alert" className="text-sm text-muted-foreground">{ru ? "Не удалось проверить выбранного героя." : "Could not verify the selected hero."} <button data-game-button="secondary" type="button" onClick={() => void selectedHero.refetch()}>{ru ? "Повторить" : "Retry"}</button></p>}
          {selectedHero.isFetching && !selectedHero.isError && <p role="status" className="text-sm text-muted-foreground">{ru ? "Проверяем выбранного героя…" : "Checking the selected hero…"}</p>}
          {heroes.isError ? (
            <div role="alert" className="space-y-2">
              <p>{humanError(heroes.error)}</p>
              <button data-game-button="secondary" className="rounded border p-3" onClick={() => void heroes.refetch()}>
                {ru ? "Повторить" : "Retry"}
              </button>
            </div>
          ) : !ready ? (
            <div role="status" className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {ru ? "Загрузка…" : "Loading…"}
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm">
              {ru ? "У тебя пока нет героев" : "You have no heroes yet"}
            </p>
          ) : (
            <>
            {activeHero && <div data-active-hero-feature><TavernHeroCard key={keyOf(activeHero)} hero={activeHero} active lang={ru ? "ru" : "en"} onOpen={() => openHero(activeHero)} /></div>}
            {!activeHero && selectedHero.isSuccess && <p className="text-sm text-muted-foreground">{ru ? "Активный герой не выбран" : "No active hero selected"}</p>}
            <TavernOtherHeroes order={heroOrder} ru={ru} onOpen={openHero} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
