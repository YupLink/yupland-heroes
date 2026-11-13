// Панель острова: две вкладки. «Ачивки» (по умолчанию, §8.57) — восемь
// занятий до обычной редкости, с ними портал пускает в мир. «Обучение» —
// проходка: глава, шаг N из M, что сделать и куда нажать; «Показать» — камера
// к цели (кнопки дальше подсвечивает useGuideSpot), у объяснений — «Понятно».
// Свёрнутость и вкладку помнит устройство.
import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronLeft, ChevronUp, X } from "lucide-react";
import { IslandMineIntro } from "./IslandMineIntro";
import { useIslandPanelClosed } from "./useIslandPanelClosed";
import type { IslandStepId } from "@/lib/raid/island/steps";
import type { IslandView } from "@/server/api/beta-raid/island/island-api";
import { islandGateDone, type AchCounts } from "@/lib/achievements/tracks";
import { IslandAchList } from "./IslandAchList";
import { IslandShortReward, IslandShortSkip } from "./IslandShortReward";
import { IslandSkipControl } from "./IslandSkipControl";
import { GUIDE_PATHS } from "./guidePaths";
import { useLang, useT } from "@/lib/i18n";
import "./island.css";

const FOLD_KEY = "beta-raid:island-folded";
const VIEW_KEY = "beta-raid:island-view";
type View = "ach" | "guide";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeKey(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* без памяти устройства — просто не запомним */
  }
}

/** «Замок» засчитывает конец тура, а не кнопка на панели. */
const ackOnPanel = (step: IslandView["steps"][number]) =>
  step.kind === "ack" && step.id !== "x_castle" && step.id !== "achievements" && step.id !== "chest_backpack";

export function IslandQuestPanel({
  island,
  targetOverride,
  backpackIntro = false,
  woodIntro = false,
  counts,
  onShow,
  onAck,
  busy,
  tutorialPilot,
}: {
  island: IslandView;
  /** Live nearby object; null when every seeded target is currently cleared. */
  targetOverride?: IslandView["target"];
  backpackIntro?: boolean;
  woodIntro?: boolean;
  /** Счётчики ачивок аккаунта (опрос на острове). */
  counts: AchCounts;
  onShow?: (q: number, r: number) => void;
  onAck: (id: IslandStepId) => void;
  busy: boolean;
  tutorialPilot: boolean;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const panelRef = useRef<HTMLElement>(null);
  const active = island.steps.find((step) => step.available && step.current);
  // Во время проходки сразу показываем задание. Сохранённые настройки панели
  // относятся к свободной игре и не должны прятать шаг после перезапуска.
  const guiding = !!active && active.id !== "hello" && !island.skipped;
  const [folded, setFolded] = useState(() => (guiding ? false : readKey(FOLD_KEY) === "1"));
  const [closed, setClosed] = useIslandPanelClosed(island.mapId, !guiding);
  const [view, setView] = useState<View>(() =>
    guiding ? "guide" : readKey(VIEW_KEY) === "guide" ? "guide" : "ach",
  );
  const mineIntroKey = `beta-raid:island-mine-intro:${island.mapId}`;
  const [mineIntroOpen, setMineIntroOpen] = useState(
    () => tutorialPilot && active?.id === "mine" && readKey(mineIntroKey) !== "1",
  );
  useEffect(() => {
    if (!guiding) return;
    setFolded(false); // новое задание всплывает само (владелец, 13.11.2026)
    setView("guide");
  }, [guiding, active?.id]);
  useEffect(() => {
    if (!guiding || !panelRef.current) return;
    const panel = panelRef.current;
    const update = () => {
      document.documentElement.style.setProperty(
        "--island-tutorial-toast-top",
        `${Math.ceil(panel.getBoundingClientRect().bottom + 8)}px`,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--island-tutorial-toast-top");
    };
  }, [guiding]);
  useEffect(() => {
    if (tutorialPilot && active?.id === "mine" && readKey(mineIntroKey) !== "1")
      setMineIntroOpen(true);
  }, [tutorialPilot, active?.id, mineIntroKey]);
  useEffect(() => {
    if (island.places.lesson && !active && !island.skipped && !island.done.includes("short_finish")) {
      setFolded(false); setView("guide");
    }
  }, [active?.id, island.mapId, island.skipped, island.done.includes("short_finish")]);
  if (active?.id === "hello") return null;
  const cur = active?.id ?? null;
  const short = !!island.places.lesson;
  const lessonKey = island.places.lesson?.pillar && (cur === "spell" || cur === "sail") ? `islet_${cur}` : cur === "chest_backpack" && island.chestPending ? "chest_collect" : short && ["hero", "chest", "axe", "chop", "slime", "slime_loot"].includes(cur ?? "") ? `short_${cur}` : cur;
  const gate = islandGateDone(counts);
  // Порядок, доступность и засчитанное приходят с сервера; приветствие — отдельное окно.
  const steps = island.steps.filter((step) => step.available && step.id !== "hello");
  const n = active ? steps.findIndex((step) => step.id === active.id) + 1 : steps.length;
  const doneCount = steps.filter((step) => step.done).length;
  const pct =
    view === "ach"
      ? Math.round((gate / 8) * 100)
      : Math.round((doneCount / Math.max(1, steps.length)) * 100);
  const toggle = () => {
    setFolded(!folded);
    if (!guiding) writeKey(FOLD_KEY, folded ? "0" : "1");
  };
  const pick = (v: View) => {
    setView(v);
    writeKey(VIEW_KEY, v);
    if (v === "ach" && active?.id === "achievements") onAck("achievements");
  };
  const target = targetOverride === undefined ? active?.target : targetOverride;
  const guidePath = cur ? GUIDE_PATHS[cur] : undefined;
  // The pack and chip lessons start in the always-available profile, not at the Town Hall.
  const localBackpackIntro = backpackIntro || woodIntro;
  const showMapTarget = !localBackpackIntro && !!target && cur !== "x_pack" && cur !== "chips";
  const showGuideAction = localBackpackIntro || !!guidePath || showMapTarget;
  const revealTarget = () => {
    setFolded(true);
    if (showMapTarget && target && onShow) onShow(target.q, target.r);
  };
  const closeMineIntro = () => {
    setMineIntroOpen(false);
    writeKey(mineIntroKey, "1");
  };
  return (
    <>
      {((guiding && folded) || closed) && (
        <button
          type="button"
          className="island-guide-tab"
          aria-label={closed ? (ru ? "Открыть ачивки острова" : "Open island achievements") : ru ? "Открыть обучение" : "Open tutorial"}
          aria-expanded={false}
          aria-controls="island-quest-panel"
          onClick={() => (closed ? setClosed(false) : setFolded(false))}
        >
          <BookOpen aria-hidden="true" />
          <span>{closed ? `${gate}/8` : `${n}/${steps.length}`}</span>
        </button>
      )}
      <section
        id="island-quest-panel"
        hidden={closed}
        ref={panelRef}
        data-guiding={guiding ? "true" : undefined}
        className={`island-quest${folded ? " island-quest--folded" : ""}${guiding ? " island-quest--drawer" : ""}`}
        aria-hidden={guiding && folded}
        inert={guiding && folded}
        aria-live="polite"
      >
        <div className="island-quest__head">
          <span className="island-quest__tabs" role="group">
            <button
              type="button"
              className="island-quest__tab"
              aria-pressed={view === "ach"}
              onClick={() => pick("ach")}
            >
              {t("island.tab_ach")} {gate}/8
            </button>
            <button
              type="button"
              className="island-quest__tab"
              aria-pressed={view === "guide"}
              onClick={() => pick("guide")}
            >
              {t("island.tab_guide")}
            </button>
          </span>
          <button
            type="button"
            className="island-quest__fold"
            aria-label={folded ? t("island.expand") : t("island.collapse")}
            aria-expanded={!folded}
            onClick={toggle}
          >
            {guiding ? <ChevronLeft aria-hidden="true" /> : folded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
          {!guiding && <button type="button" className="island-quest__fold" aria-label={ru ? "Закрыть" : "Close"} onClick={() => setClosed(true)}><X aria-hidden="true" /></button>}
        </div>
        <div
          className="island-quest__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        {tutorialPilot && (cur || island.skipped) && ( // прошёл обучение — пропускать нечего (владелец, 13.11.2026)
          <div className="island-quest__skip-row">
            {short && cur && cur !== "hero_pick" ? <IslandShortSkip /> : <IslandSkipControl skipped={island.skipped} />}
          </div>
        )}
        {!folded && view === "ach" && (
          <>
            <p className="island-ach__gate">{t("ach.gate")}</p>
            <IslandAchList counts={counts} places={island.places} onShow={onShow} />
          </>
        )}
        {!folded && view === "guide" && (
          <p className="island-ach__gate">
            {island.skipped
              ? ru
                ? "Обучение пропущено"
                : "Tutorial skipped"
              : cur
                ? t("island.step_of", { n, total: steps.length })
                : t("island.all_done")}
            {active && ` · ${t(`island.ch.${active.chapter}`)}`}
          </p>
        )}
        {!folded && view === "guide" && cur && (
          <>
            <h3 className="island-quest__title">{t(woodIntro ? "island.wood_backpack.title" : backpackIntro ? "island.backpack.title" : `island.${lessonKey}.title`)}</h3>
            <p className="island-quest__text">{t(woodIntro ? "island.wood_backpack.text" : backpackIntro ? "island.backpack.text" : `island.${lessonKey}.text`)}</p>
            <div className="island-quest__foot">
              {cur === "spell" && short && !island.places.lesson?.pillar && <IslandShortReward />}
              {showGuideAction && (
                <button
                  type="button"
                  data-game-button="secondary"
                  className="island-quest__show"
                  onClick={revealTarget}
                >
                  {t("island.show")}
                </button>
              )}
              {active && !(short && cur === "hero") && !localBackpackIntro && ackOnPanel(active) && (
                <button
                  type="button"
                  data-game-button="primary"
                  className="island-quest__show"
                  disabled={busy}
                  onClick={() => onAck(cur)}
                >
                  {t("island.got_it")}
                </button>
              )}
            </div>
          </>
        )}
        {short && !cur && !island.skipped && !folded && view === "guide" && <>
          <h3 className="island-quest__title">{ru ? "Теперь исследуй мир" : "Now explore the world"}</h3>
          <p className="island-quest__text">{ru ? "Ты знаешь, где найти героя и вещи, как торговать, добывать ресурсы, сражаться и плавать. Продолжай исследование самостоятельно." : "You know where to find your hero and items, how to trade, gather resources, fight and sail. Continue exploring on your own."}</p>
          <div className="island-quest__foot"><button type="button" data-game-button="primary" className="island-quest__show" onClick={() => { setClosed(true); onAck("short_finish"); }}>{ru ? "Исследовать мир" : "Explore the world"}</button></div>
        </>}
      </section>
      {mineIntroOpen && active?.id === "mine" && <IslandMineIntro onClose={closeMineIntro} />}
    </>
  );
}
