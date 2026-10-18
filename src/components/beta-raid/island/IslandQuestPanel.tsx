// Панель острова: две вкладки. «Ачивки» (по умолчанию, §8.57) — восемь
// занятий до обычной редкости, с ними портал пускает в мир. «Обучение» —
// проходка: глава, шаг N из M, что сделать и куда нажать; «Показать» — камера
// к цели (кнопки дальше подсвечивает useGuideSpot), у объяснений — «Понятно».
// Свёрнутость и вкладку помнит устройство.
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ISLAND_STEP_IDS,
  isAckStep,
  stepAvailable,
  stepChapter,
  type IslandStepId,
} from "@/lib/raid/island/steps";
import type { IslandView } from "@/server/api/beta-raid/island/island-api";
import { islandGateDone, type AchCounts } from "@/lib/achievements/tracks";
import { IslandAchList } from "./IslandAchList";
import { useT } from "@/lib/i18n";
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
const ackOnPanel = (step: IslandStepId) => isAckStep(step) && step !== "x_castle";

export function IslandQuestPanel({
  island,
  counts,
  onShow,
  onAck,
  busy,
}: {
  island: IslandView;
  /** Счётчики ачивок аккаунта (опрос на острове). */
  counts: AchCounts;
  onShow?: (q: number, r: number) => void;
  onAck: (id: IslandStepId) => void;
  busy: boolean;
}) {
  const t = useT();
  const [folded, setFolded] = useState(() => readKey(FOLD_KEY) === "1");
  const [view, setView] = useState<View>(() => (readKey(VIEW_KEY) === "guide" ? "guide" : "ach"));
  const cur = island.current;
  if (cur === "hello") return null;
  const gate = islandGateDone(counts);
  // Приветствие — отдельным окном, не шагом; недоступные на острове — не в счёт.
  const steps = ISLAND_STEP_IDS.filter((s) => s !== "hello" && stepAvailable(s, island.places));
  const n = cur ? steps.indexOf(cur) + 1 : steps.length;
  const pct =
    view === "ach"
      ? Math.round((gate / 8) * 100)
      : Math.round(((cur ? n - 1 : n) / steps.length) * 100);
  const toggle = () => {
    setFolded(!folded);
    writeKey(FOLD_KEY, folded ? "0" : "1");
  };
  const pick = (v: View) => {
    setView(v);
    writeKey(VIEW_KEY, v);
  };
  const target = island.target;
  return (
    <section className={`island-quest${folded ? " island-quest--folded" : ""}`} aria-live="polite">
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
          {folded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
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
      {!folded && view === "ach" && (
        <>
          <p className="island-ach__gate">{t("ach.gate")}</p>
          <IslandAchList counts={counts} places={island.places} onShow={onShow} />
        </>
      )}
      {!folded && view === "guide" && (
        <p className="island-ach__gate">
          {cur ? t("island.step_of", { n, total: steps.length }) : t("island.all_done")}
          {cur && ` · ${t(`island.ch.${stepChapter(cur)}`)}`}
        </p>
      )}
      {!folded && view === "guide" && cur && (
        <>
          <h3 className="island-quest__title">{t(`island.${cur}.title`)}</h3>
          <p className="island-quest__text">{t(`island.${cur}.text`)}</p>
          <div className="island-quest__foot">
            {target && onShow && (
              <button
                type="button"
                data-game-button="secondary"
                className="island-quest__show"
                onClick={() => onShow(target.q, target.r)}
              >
                {t("island.show")}
              </button>
            )}
            {ackOnPanel(cur) && (
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
    </section>
  );
}
