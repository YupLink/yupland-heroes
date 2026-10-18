// Подсветка проходки острова: пока шаг текущий, кольцо стоит на самой глубокой
// видимой кнопке его пути (guidePaths) — вошёл в замок, кольцо переехало на
// постройку, открыл её — на нужную кнопку. Тур по замку и прочие подсказки не
// перебиваем: ждём, пока они закроются.
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { isAckStep, type IslandStepId } from "@/lib/raid/island/steps";
import { currentSpotlight, findVisible, showSpotlight } from "./spotlightBus";
import { GUIDE_PATHS } from "./guidePaths";

const POLL_MS = 700;
/** Нажал саму кнопку — пока открывается окно, ту же кнопку не подсвечиваем. */
const AFTER_TAP_MS = 3000;
/** Скрыл подсказку «Ок» — не возвращаем её сразу. */
const AFTER_HIDE_MS = 20_000;
/** Окно поверх карты или замка. */
const DIALOG = '[role="dialog"], [aria-modal="true"]';

export function useGuideSpot(step: IslandStepId | null, onAck: (id: IslandStepId) => void): void {
  // useT отдаёт новую функцию на каждый рендер, а слой перерисовывается каждые
  // 4 с (опрос острова). В зависимостях эффекта она снимала бы подсказку и
  // ставила заново: в зазоре нажатие проваливалось в постройку под ней, а
  // «Ок» не держал тишину. Поэтому и t, и onAck — через ref.
  const translate = useT();
  const t = useRef(translate);
  t.current = translate;
  const ack = useRef(onAck);
  ack.current = onAck;
  useEffect(() => {
    const path = step ? GUIDE_PATHS[step] : undefined;
    if (!step || !path) return;
    const hush = new Map<string, number>();
    const quiet = (sel: string, ms: number) => hush.set(sel, Date.now() + ms);
    const id = window.setInterval(() => {
      // Самое глубокое видимое звено; сначала дёшево — есть ли в документе.
      // Открыто окно (итог боя, приветствие) — ждём его закрытия, если кнопка
      // не в нём самом: кольцо поверх чужого окна путает (16.10).
      const dialog = document.querySelector(DIALOG) ? findVisible(DIALOG) : null;
      let at = -1;
      for (let i = path.length - 1; i >= 0 && at < 0; i--) {
        const el = document.querySelector(path[i].sel) ? findVisible(path[i].sel) : null;
        if (el && (!dialog || el.closest(DIALOG))) at = i;
      }
      const cur = currentSpotlight();
      if (at < 0) {
        if (cur?.guide) showSpotlight(null);
        return;
      }
      const hop = path[at];
      if (cur && (!cur.guide || cur.selector === hop.sel)) return;
      if ((hush.get(hop.sel) ?? 0) > Date.now()) return;
      const last = at === path.length - 1;
      // «Замок» засчитывает конец тура, а не кнопка у входа.
      const counts = last && isAckStep(step) && step !== "x_castle";
      showSpotlight({
        selector: hop.sel,
        text: t.current(hop.tip),
        button: counts ? t.current("island.got_it") : t.current("island.ok"),
        guide: true,
        onTap: () => quiet(hop.sel, AFTER_TAP_MS),
        onNext: () => (counts ? ack.current(step) : quiet(hop.sel, AFTER_HIDE_MS)),
      });
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      if (currentSpotlight()?.guide) showSpotlight(null);
    };
  }, [step]);
}
