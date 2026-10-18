// Замок: герой и артефакты. Раскладка снята с HeroPickerModal: снизу на
// телефоне, по центру на десктопе, с запасом под нижнюю панель.
//
// Вкладки «Отряд» здесь больше нет (владелец, 27.08) — состав снова собирают
// в окне боя с боссом.
import { useState, lazy, Suspense, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { CastleTabs, type CastleTab } from "./CastleTabs";
import { CastleHeroTab } from "./CastleHeroTab";
import { CastleGearTab } from "./CastleGearTab";
import { CastleBackpackTab } from "./CastleBackpackTab";
import { SpellbookGrid } from "../spellbook/SpellbookGrid";
import { HeroEffectSummary } from "../HeroEffectSummary";
import { requestCenter } from "../centerMapBus";
import { useCastle } from "./useCastle";
import { metaLabel } from "@/components/heroMeta";
import { thumb } from "@/lib/image";

const TavernSpellbook = lazy(() => import("@/components/castle-live/TavernSpellbook").then((m) => ({ default: m.TavernSpellbook })));
const HeroItemsGameActions = lazy(() => import("@/components/castle-live/HeroItemsGameActions").then((m) => ({ default: m.HeroItemsGameActions })));

export function CastleModal({
  onClose,
  /** Стоим ли у замка. Не стоим — окно смотрится, но правки сервер не примет. */
  atCastle = true,
  viewedHeroId,
  readOnly = false,
  embedded = false,
  embeddedTab,
  onEmbeddedTabChange,
  allowLevelUp = false,
  activeHero = false,
  heroNavigator,
  heroAction,
  onShowArtifacts,
  showGearTab = true,
}: {
  onClose: () => void;
  atCastle?: boolean;
  viewedHeroId?: string;
  readOnly?: boolean;
  embedded?: boolean;
  embeddedTab?: CastleTab;
  onEmbeddedTabChange?: (tab: CastleTab) => void;
  allowLevelUp?: boolean;
  activeHero?: boolean;
  heroNavigator?: ReactNode | ((slotCount?: number) => ReactNode);
  heroAction?: ReactNode;
  onShowArtifacts?: () => void;
  showGearTab?: boolean;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const [internalTab, setInternalTab] = useState<CastleTab>(embedded ? "gear" : "hero");
  const tab = embeddedTab ?? internalTab;
  const isItemScreen = embedded && (tab === "backpack" || tab === "potions");
  const setTab = onEmbeddedTabChange ?? setInternalTab;
  const castle = useCastle({ viewedHeroId: activeHero ? undefined : viewedHeroId, readOnly, allowActiveGear: embedded });
  const headerHero = embedded ? castle.heroes.data?.find(h => h.id === viewedHeroId) : null;
  // Просмотр по id: рисуем только УСПЕШНЫЙ ответ этой сессии (ключи «view» не
  // персистятся). isFetchedAfterMount тут не годится: список героев уже свеж
  // из таверны (общий ключ, staleTime 30 с) — окно не перезапрашивает его, и
  // флаг не взводился никогда: «Загрузка…» навечно.
  const gear = !viewedHeroId || castle.gear.isSuccess ? castle.gear.data : undefined;
  const sectionQuery =
    tab === "gear" ? castle.gear : (tab === "backpack" || tab === "potions") ? castle.backpack : castle.heroes;
  // Тап по координате склада во вкладке «Рюкзак»: окно закрываем сами — игрок
  // просил показать клетку, а не читать список поверх неё (как «Добыча» в
  // BetaRaidHud); камеру везёт шина centerMapBus, канвас под окном смонтирован.
  const showCell = (q: number, r: number) => {
    if (castle.readOnly) return;
    onClose();
    requestCenter({ q, r, ttlMs: 3000 });
  };

  return (
    <div
      className={
        embedded
          ? "w-full"
          : "fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      }
      onClick={embedded ? undefined : onClose}
    >
      <div
        data-tavern-hero={embedded ? "true" : undefined}
        data-hero-screen={embedded ? tab : undefined}
        className={
          embedded
            ? "w-full rounded-2xl border border-border bg-background"
            : "flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:max-h-[88vh] sm:rounded-3xl"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {!isItemScreen && <div data-hero-header className={embedded && heroNavigator && (tab === "hero" || tab === "gear") ? "flex flex-col items-stretch gap-3 p-4 pb-2" : "flex shrink-0 items-center justify-between p-4 pb-2"}>
          {embedded && heroNavigator && (tab === "hero" || tab === "gear") ? <>{typeof heroNavigator === "function" ? heroNavigator(tab === "gear" && gear && Array.isArray(gear.slots) ? gear.slots.length : undefined) : heroNavigator}</> : headerHero ? <div data-hero-identity className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              {headerHero.imageUrl && <img src={thumb(headerHero.imageUrl, 96, "black")} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />}
              <div data-hero-heading className="relative min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="min-w-0 text-base">{headerHero.name}</h3>
                  {showGearTab && (tab === "gear" || tab === "hero") && <button data-game-button="legacy" data-hero-characteristics type="button" onClick={() => setTab(tab === "gear" ? "hero" : "gear")} className="min-h-11 shrink-0 text-xs">{tab === "gear" ? (ru ? "Характеристики" : "Characteristics") : (ru ? "Экипировка" : "Equipment")}</button>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
                    {[headerHero.race, headerHero.specialization, gear?.rarity ?? headerHero.rarity].filter(Boolean).map(v => metaLabel(v!, ru ? "ru" : "en")).join(" · ")}
                    {tab === "gear" && gear && Array.isArray(gear.slots) && <> · <span className="text-gold">{gear.slots.length} {ru ? (gear.slots.length === 4 ? "слота" : "слотов") : "slots"}</span></>}
                  </p>
                </div>
              </div>
            </div>
          </div> : <h3 className="font-display text-base font-bold">
            {embedded ? (ru ? "Герой" : "Hero") : t("braid.castle_title")}
          </h3>}
          {!embedded && <button data-close-button data-game-button="icon"
            onClick={onClose}
            aria-label={embedded ? (ru ? "К списку героев" : "Back to heroes") : t("common.close")}
            className="grid h-11 w-11 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>}
        </div>}

        <div className="shrink-0 space-y-2 px-4 pb-2">
          {castle.readOnly && !embedded && (
            <p id="hero-action-help" className="text-xs text-muted-foreground">
              {activeHero ? (ru ? "Снаряжение и характеристики активного героя." : "Equipment and stats of your active hero.") : embedded && allowLevelUp
                ? ru
                  ? "Можно повысить уровень героя. Активный герой не меняется. Экипировку можно менять только у активного героя."
                  : "You can level up this hero without changing the active hero. Only the active hero’s equipment can be changed."
                : ru
                ? allowLevelUp
                    ? "Можно повысить уровень этого героя. Активный герой не меняется."
                    : "Просмотр героя. Снаряжение, карманы и активный герой не изменяются."
                : allowLevelUp
                    ? "You can level up this hero without changing your active hero."
                    : "Viewing a hero. Equipment, pockets and active hero remain unchanged."}
            </p>
          )}
          {!atCastle && !castle.readOnly && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {t("braid.castle_need_castle")}
            </p>
          )}
          {/* Тот же блок, что в окне героя с карты: одно объяснение эффектов
              на оба окна — своя плашка в шапке замка говорила о том же
              другими словами. */}
          {!embedded && gear?.heroId && <HeroEffectSummary combat={gear.combat} field={gear.field} />}
          {gear?.unknownRace && (
            <p className="text-[10px] text-muted-foreground">{t("braid.castle_unknown_race")}</p>
          )}
          {gear?.specFallback && (
            <p className="text-[10px] text-muted-foreground">{t("braid.castle_no_spec")}</p>
          )}
          {!embedded && <CastleTabs tab={tab} onTab={setTab} />}
        </div>

        <div
          className={
            embedded
              ? "space-y-3 px-4 pb-4"
              : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+120px)] sm:pb-6"
          }
        >
          {embedded && tab === "hero" && heroNavigator && <h2 data-hero-stats-title>{ru ? "Характеристики" : "Stats"}</h2>}
          {viewedHeroId && sectionQuery.isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>
                {ru
                  ? "Этот раздел сейчас недоступен. Остальные вкладки можно открыть."
                  : "This section is unavailable. Other tabs remain accessible."}
              </p>
              <button data-game-button="secondary"
                onClick={() => {
                  void sectionQuery.refetch();
                }}
                className="rounded border p-2"
              >
                {ru ? "Повторить" : "Retry"}
              </button>
            </div>
          ) : viewedHeroId && !sectionQuery.isSuccess ? (
            <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
          ) : (
            <>
              {embedded && ["backpack", "potions", "spells"].includes(tab) && <>
                {tab === "spells" ? <h3 data-subpage-title>{ru ? "Книга заклинаний" : "Spellbook"}</h3> : <h3 data-subpage-title>{ru ? "Вещи героя" : "Hero items"}</h3>}
                {castle.readOnly && (tab === "spells" || !castle.backpackUseAllowed) && <div data-subpage-note role={castle.selected.isError ? "alert" : "note"}>
                  {tab === "backpack" || tab === "potions" ? (
                    castle.selected.isError ? <>{ru ? "Не удалось проверить активного героя." : "Could not verify the active hero."} <button type="button" onClick={() => void castle.selected.refetch()}>{ru ? "Повторить" : "Retry"}</button></>
                    : castle.selected.isFetching ? (ru ? "Проверяем активного героя…" : "Checking the active hero…")

                    : (ru ? "Использовать вещи можно только у активного героя." : "Only the active hero can use items.")
                  ) : (ru ? "Только просмотр · действия в таверне недоступны" : "View only · actions are unavailable in the tavern")}
                </div>}
              </>}
              {tab === "hero" && (
                <>
                  <CastleHeroTab castle={castle} atCastle={atCastle} allowLevelUp={allowLevelUp} prioritizeLevelUp={embedded} heroAction={heroAction} />
                </>
              )}
              {tab === "gear" && <CastleGearTab castle={castle} atCastle={atCastle} paperDoll={embedded} race={headerHero?.race} onNavigate={onShowArtifacts ? undefined : setTab} referenceLayout={!!onShowArtifacts} />}
              {tab === "gear" && embedded && onShowArtifacts && <button data-all-artifacts-link type="button" onClick={onShowArtifacts}><i data-artifacts-icon aria-hidden="true" /><span>{ru ? "Посмотреть все артефакты" : "View all artifacts"}</span><ChevronRight size={20} aria-hidden="true" /></button>}
              {embedded && (tab === "backpack" || tab === "potions") && <Suspense fallback={null}><HeroItemsGameActions data={castle.backpack.data} loading={castle.backpack.isLoading} readOnly={castle.readOnly} allowUse={castle.backpackUseAllowed} beforeUse={castle.beforeUseBackpack} /></Suspense>}
              {tab === "backpack" && !embedded && <CastleBackpackTab castle={castle} onShowCell={showCell} />}
              {tab === "potions" && !embedded && <CastleBackpackTab castle={castle} compartment="potions" onShowCell={showCell} />}
              {/* Книга своего запроса героя не делает — читает собственный ключ,
              но принадлежит тому же выбранному герою, что и вкладки рядом. */}
              {tab === "spells" && (
                embedded
                  ? <Suspense fallback={null}><TavernSpellbook heroId={activeHero ? undefined : viewedHeroId} readOnly={castle.readOnly} /></Suspense>
                  : <SpellbookGrid heroId={viewedHeroId} readOnly={castle.readOnly} hideOwner={embedded} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
