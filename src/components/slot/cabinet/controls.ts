import type { SlotState } from "@/lib/slot/state";
import type { UiAction } from "@/lib/slot/useSlotGame";
import type { Act } from "./shared";
import { num, text } from "./shared";
export type CabinetApi = {
  state: SlotState;
  gold: number;
  displayWin?: number;
  acting: boolean;
  loading: boolean;
  error: string | null;
  act: Act;
  dispatch: (a: UiAction) => void;
  spin: () => Promise<void>;
  close: () => void;
  ru: boolean;
};
type Cap = [string, number, number, number, number, string];
const caps: Cap[] = [
  [
    "stake-button",
    100,
    487,
    166,
    112,
    "17% 0,94% 0,99% 5%,100% 14%,93% 88%,88% 98%,7% 100%,1% 94%,0 84%,10% 10%",
  ],
  [
    "max-button",
    314,
    487,
    162,
    112,
    "11% 0,90% 0,96% 4%,99% 13%,97% 90%,92% 99%,4% 100%,0 94%,1% 83%,5% 14%",
  ],
  [
    "spin-button",
    709,
    468,
    228,
    132,
    "8% 0,85% 0,90% 3%,93% 12%,100% 87%,98% 96%,94% 100%,5% 100%,1% 96%,0 12%,2% 4%",
  ],
  // «Авто» — в нарисованном гнезде между «Макс» и «Крутить».
  [
    "auto-button",
    519,
    487,
    152,
    112,
    "11% 0,90% 0,96% 4%,99% 13%,97% 90%,92% 99%,4% 100%,0 94%,1% 83%,5% 14%",
  ],
];
/** Колпачок без гнезда в картинке: стоит в ряду линий, рамку и крой задаёт CSS (.line-rules). */
const looseCaps = ["rules-button"];
export function setupControls(root: HTMLElement, get: () => CabinetApi) {
  const q = <T extends HTMLElement = HTMLElement>(s: string) =>
    root.querySelector<T>(s)!;
  const abort = new AbortController(),
    signal = abort.signal;
  const on = (s: string, fn: () => void) =>
    q(s).addEventListener("click", fn, { signal });
  const fit = () =>
    root
      .querySelectorAll<HTMLElement>(".score strong,#stake-value")
      .forEach((node) => {
        node.style.removeProperty("font-size");
        const width =
          node.id === "stake-value"
            ? node.parentElement!.clientWidth
            : node.clientWidth;
        if (width && node.scrollWidth > width)
          node.style.fontSize =
            (parseFloat(getComputedStyle(node).fontSize) * width) /
              node.scrollWidth +
            "px";
      });
  for (const id of [...caps.map(([id]) => id), ...looseCaps]) {
    const b = q("#" + id);
    b.classList.add("physical-key");
    const s = document.createElement("span");
    s.className = "key-surface";
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = '<span class="key-well"></span><span class="key-cap"></span>';
    b.prepend(s);
  }
  const layout = () => {
    const deck = q(".integrated-deck-art").getBoundingClientRect(),
      scale = deck.width / 1024,
      originY = deck.top - deck.width * 0.4297;
    caps.forEach(([id, x, y, w, h, contour]) => {
      const button = q("#" + id),
        box = button.getBoundingClientRect(),
        label = q("#" + id + " .button-label").getBoundingClientRect(),
        surface = q("#" + id + " .key-surface");
      Object.assign(surface.style, {
        left: deck.left + x * scale - box.left + "px",
        top: originY + y * scale - box.top + "px",
        width: w * scale + "px",
        height: h * scale + "px",
      });
      surface.style.setProperty("--key-contour", `polygon(${contour})`);
      surface.style.setProperty("--key-crop-x", -x / 10.24 + "cqw");
      surface.style.setProperty("--key-crop-y", -y / 10.24 + "cqw");
      button.style.setProperty(
        "--key-label-travel",
        Math.max(
          0,
          (originY + (y + h) * scale - (label.top + label.height / 2)) * 0.12,
        ) + "px",
      );
    });
    fit();
  };
  root.querySelectorAll<HTMLElement>(".action-row .arcade").forEach((b, i) =>
    Object.assign(b.style, {
      // Ставка, Макс, Авто, Крутить
      left: [6.3, 28.6, 49.6, 69.5][i] + "%",
      width: [18, 18, 16.5, 25][i] + "%",
      top: "0",
      height: "100%",
      bottom: "auto",
    }),
  );
  const observer = new ResizeObserver(layout);
  observer.observe(q(".cabinet-stage"));
  layout();
  void document.fonts.ready.then(() => {
    if (!signal.aborted) layout();
  });
  root
    .querySelectorAll<HTMLButtonElement>("[data-line]")
    .forEach((b) =>
      b.addEventListener(
        "click",
        () =>
          get().dispatch({ type: "set-lines", lines: Number(b.dataset.line) }),
        { signal },
      ),
    );
  on("#stake-button", () => {
    const a = get();
    if (a.state.phase === "won" && a.state.lastWin > 0) {
      if (a.state.auto) a.dispatch({ type: "toggle-auto" });
      void a.act({ type: "risk-start" });
    } else a.dispatch({ type: "next-bet" });
  });
  // Нажатие видно и на коротком тапе: на телефоне :active почти не успевает
  // показаться, поэтому нажатый вид (.is-down) держится не меньше 140 мс.
  root.querySelectorAll<HTMLButtonElement>(".arcade").forEach((b) => {
    let since = 0,
      timer = 0;
    const up = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => b.classList.remove("is-down"),
        Math.max(0, 140 - (performance.now() - since)),
      );
    };
    b.addEventListener(
      "pointerdown",
      () => {
        if (b.disabled) return;
        window.clearTimeout(timer);
        since = performance.now();
        b.classList.add("is-down");
      },
      { signal },
    );
    for (const type of ["pointerup", "pointercancel", "pointerleave"])
      b.addEventListener(type, up, { signal });
  });
  on("#max-button", () => get().dispatch({ type: "max-bet" }));
  on("#auto-button", () => get().dispatch({ type: "toggle-auto" }));
  on("#spin-button", () => {
    const a = get();
    if (a.state.auto) {
      a.dispatch({ type: "toggle-auto" });
      return;
    }
    if (a.state.phase === "won" && a.state.lastWin > 0)
      void a.act({ type: "collect" });
    else void a.spin();
  });
  on("#map", () => {
    const a = get();
    if (a.state.auto) a.dispatch({ type: "toggle-auto" });
    a.close();
  });
  const pause = () => root.classList.toggle("is-background", document.hidden);
  document.addEventListener("visibilitychange", pause, { signal });
  pause();
  const render = () => {
    const a = get(),
      { state: s, ru } = a,
      won = s.phase === "won" && s.lastWin > 0,
      spinning = s.phase === "spinning";
    const blocked =
      a.acting ||
      a.loading ||
      !!a.error ||
      spinning ||
      !["idle", "won"].includes(s.phase);
    const values: Record<string, number> = {
      credit: a.gold,
      "total-bet": s.lines * s.bet,
      win: a.displayWin ?? (s.phase === "risk" ? s.pending : s.lastWin),
      "stake-value": s.bet,
    };
    Object.entries(values).forEach(([id, value]) => {
      q("#" + id).textContent = num(value, ru);
      q("#" + id).title = num(value, ru);
    });
    q("#stake-caption").textContent = text(
      ru,
      won ? "Удвоить" : "Ставка",
      won ? "Double" : "Bet",
    );
    q("#stake-value").hidden = won;
    q("#stake-button").classList.toggle("risk-ready", won);
    q("#spin-button .button-label").textContent = text(
      ru,
      s.auto
        ? "Стоп"
        : won
          ? "Забрать"
          : a.gold < s.lines * s.bet
            ? "Мало золота"
            : "Крутить",
      s.auto
        ? "Stop"
        : won
          ? "Collect"
          : a.gold < s.lines * s.bet
            ? "Not enough gold"
            : "Spin",
    );
    q("#max-button .button-label").textContent = text(ru, "Макс", "Max");
    q("#auto-button .button-label").textContent = text(
      ru,
      s.auto ? "Стоп" : "Авто",
      s.auto ? "Stop" : "Auto",
    );
    q("#auto-button").setAttribute("aria-pressed", String(s.auto));
    root.querySelectorAll<HTMLButtonElement>(".arcade").forEach((b) => {
      b.disabled = blocked;
      b.setAttribute("aria-label", b.textContent?.trim() ?? "");
    });
    q<HTMLButtonElement>("#spin-button").disabled =
      blocked || (!won && !s.auto && a.gold < s.lines * s.bet);
    q<HTMLButtonElement>("#auto-button").disabled =
      a.loading || !!a.error || (!s.auto && blocked);
    q<HTMLButtonElement>("#map").disabled = a.acting || spinning;
    root
      .querySelectorAll<HTMLElement>("[data-line]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.line) === s.lines),
        ),
      );
    q("#map").textContent = text(ru, "← Выйти", "← Exit");
    q(".line-caption").textContent = text(
      ru,
      "Выбери количество линий",
      "Choose the number of lines",
    );
    q("#rules-button .button-label").textContent = text(ru, "Правила", "Rules");
    q("#rules-button").setAttribute("aria-label", text(ru, "Правила", "Rules"));
    q(".machine").setAttribute(
      "aria-label",
      text(ru, "Игровой автомат Раскопки", "Excavation slot machine"),
    );
    q(".title").textContent = text(ru, "Раскопки", "Excavation");
    q(".score").setAttribute("aria-label", text(ru, "Счёт", "Score"));
    root
      .querySelectorAll<HTMLElement>(".score small")
      .forEach(
        (n, i) =>
          (n.textContent = (
            ru
              ? ["Кредит", "За спин", "Выигрыш"]
              : ["Credit", "Spin bet", "Winnings"]
          )[i]),
      );
    root.classList.toggle("is-spinning", spinning);
    fit();
  };
  return {
    render,
    dispose: () => {
      abort.abort();
      observer.disconnect();
      root.querySelectorAll(".key-surface").forEach((n) => n.remove());
    },
  };
}
