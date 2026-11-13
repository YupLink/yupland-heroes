// Подсветка проходки острова: пока шаг текущий, кольцо стоит на самой глубокой
// видимой кнопке его пути (guidePaths) — вошёл в замок, кольцо переехало на
// постройку, открыл её — на нужную кнопку. Тур по замку и прочие подсказки не
// перебиваем: ждём, пока они закроются.
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { isAckStep, type IslandStepId } from "@/lib/raid/island/steps";
import { currentSpotlight, findVisible, showSpotlight } from "./spotlightBus";
import { castlePath, GUIDE_PATHS, RETURN_GATES, type GuideStepId } from "./guidePaths";
import { isIslandViewedStep } from "./islandViewProgress";

const POLL_MS = 700;
/** Шаги на карте без своего пути: в замке им одна подсказка — «Выход в мир». */
const MAP_ONLY = new Set<string>(["walk", "chest", "chop", "slime", "sail"]);
/** Нажал саму кнопку — пока открывается окно, ту же кнопку не подсвечиваем. */
const AFTER_TAP_MS = 3000;
/** Скрыл подсказку «Ок» — не возвращаем её сразу. */
const AFTER_HIDE_MS = 20_000;
/** Окно поверх карты или замка. */
const DIALOG = '[data-hud-modal-panel], [role="dialog"], [aria-modal="true"], section[aria-labelledby="castle-window-title"], section[aria-labelledby="quest-preview-title"]';

export function useGuideSpot(step: GuideStepId | null, onAck: (id: IslandStepId) => void, onWoodViewed?: () => void, short = false): void {
  // useT отдаёт новую функцию на каждый рендер, а слой перерисовывается каждые
  // 4 с (опрос острова). В зависимостях эффекта она снимала бы подсказку и
  // ставила заново: в зазоре нажатие проваливалось в постройку под ней, а
  // «Ок» не держал тишину. Поэтому и t, и onAck — через ref.
  const translate = useT();
  const t = useRef(translate);
  t.current = translate;
  const ack = useRef(onAck);
  ack.current = onAck;
  const woodViewed = useRef(onWoodViewed);
  woodViewed.current = onWoodViewed;
  useEffect(() => {
    const path = (step ? GUIDE_PATHS[short && (step === "chest" || step === "axe") ? (step === "chest" ? "short_chest" : "short_axe") : step] : undefined)
      ?? (step && MAP_ONLY.has(step) ? [] : undefined);
    if (!step || !path) return;
    const recordedStep: IslandStepId | null = ["backpack", "wood_backpack", "short_chest", "short_axe", "chest_collect"].includes(step) ? null : step as IslandStepId;
    const automaticView = short && isIslandViewedStep(step);
    const mapStep = !castlePath(path);
    let backpackScrolled: HTMLElement | null = null;
    const hush = new Map<string, number>();
    const quiet = (sel: string, ms: number) => hush.set(sel, Date.now() + ms);
    const id = window.setInterval(() => {
      if (step === "chest_backpack") {
        const target = document.querySelector<HTMLElement>("[data-stack-key='custom:cst_0chsk0wpqt2b']")
          ?? document.querySelector<HTMLElement>("[data-backpack-header] ~ .hero-items-more")
          ?? document.querySelector<HTMLElement>("[data-backpack-header]");
        if (target && target !== backpackScrolled) { target.scrollIntoView({ block: "center", behavior: "smooth" }); backpackScrolled = target; }
      }
      // Самое глубокое видимое звено; сначала дёшево — есть ли в документе.
      // Открыто окно (итог боя, приветствие) — ждём его закрытия, если кнопка
      // не в нём самом: кольцо поверх чужого окна путает (16.10).
      if (findVisible("[data-sonner-toast]")) {
        if (currentSpotlight()?.guide) showSpotlight(null);
        return;
      }
      const dialog = document.querySelector(DIALOG) ? findVisible(DIALOG) : null;
      const expandedPanel = findVisible(".island-quest:not(.island-quest--folded)");
      let at = -1;
      for (let i = path.length - 1; i >= 0 && at < 0; i--) {
        const el = document.querySelector(path[i].sel) ? findVisible(path[i].sel) : null;
        if (el && (!dialog || el.closest(DIALOG)) && (!expandedPanel || !!el.closest(".island-quest") || !!dialog)) at = i;
      }
      const cur = currentSpotlight();
      const out = at < 0 && mapStep && !dialog && findVisible(RETURN_GATES.sel) ? RETURN_GATES : null;
      if (at < 0 && !out) {
        if (cur?.guide) showSpotlight(null);
        return;
      }
      const hop = out ?? path[at];
      if (cur && (!cur.guide || cur.selector === hop.sel)) return;
      if ((hush.get(hop.sel) ?? 0) > Date.now()) return;
      const last = !out && at === path.length - 1;
      // «Замок» засчитывает конец тура, а не кнопка у входа.
      const counts = !automaticView && last && !!recordedStep && isAckStep(recordedStep) && step !== "x_castle" && step !== "return_island" && step !== "achievements";
      showSpotlight({
        selector: hop.sel,
        text: t.current(short && hop.tip === "island.hero.text" ? "island.short_hero.text" : hop.tip),
        button: counts ? t.current("island.got_it") : t.current("island.ok"),
        noButton: !counts && !(last && step === "wood_backpack"),
        guide: true,
        onTap: () => {
          quiet(hop.sel, AFTER_TAP_MS);
          if (!automaticView && last && (step === "hero" || step === "hero_level" || step === "hero_sets")) ack.current(step);
        },
        onNext: () => {
          if (counts && recordedStep) {
            // Ack is async; do not reopen the same hint while the server records it.
            quiet(hop.sel, AFTER_HIDE_MS);
            ack.current(recordedStep);
          }
          else if (last && step === "wood_backpack") woodViewed.current?.();
          else quiet(hop.sel, AFTER_HIDE_MS);
        },
      });
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      if (currentSpotlight()?.guide) showSpotlight(null);
    };
  }, [step, short]);
}

