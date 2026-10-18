import { SUPER_ATTEMPTS, SUPER_PRIZE } from "@/lib/slot/bonus";
import {
  RISK_MAX_ROUNDS,
  cardLabel,
  cardRed,
  type Card,
} from "@/lib/slot/risk";
import { BONUS_MIN, SYMBOLS } from "@/lib/slot/symbols";

type Lang = "ru" | "en";
type RuleState = { lines: number; bet: number };
type RuleIndex = 0 | 1 | 2 | 3;
const ASSETS = "/slot/cabinet/assets/";
const SYMBOL_NAMES: Record<Lang, Record<string, string>> = {
  ru: {
    bonus: "Бонус — Юпик",
    wild: "Золотая рыба",
    logo: "Корона Big Win",
    seven: "Nice Win",
    butterfly: "Юпик в проруби",
    snail: "Мешок желудей",
    bar3: "Три BAR",
    bar2: "Два BAR",
    bar1: "Один BAR",
  },
  en: {
    bonus: "Bonus — Yupik",
    wild: "Golden fish",
    logo: "Big Win crown",
    seven: "Nice Win",
    butterfly: "Yupik in an ice hole",
    snail: "Bag of acorns",
    bar3: "Three BARs",
    bar2: "Two BARs",
    bar1: "One BAR",
  },
};
const UI = {
  ru: {
    title: "Правила",
    close: "Закрыть правила",
    tabs: "Разделы правил",
    names: ["Выплаты", "Бонус", "Пещеры", "Карты"],
    button: "Правила",
  },
  en: {
    title: "Rules",
    close: "Close rules",
    tabs: "Rule sections",
    names: ["Payouts", "Bonus", "Caves", "Cards"],
    button: "Rules",
  },
} as const;

function tutorialKey(
  kind: "stake" | "spin" | "max" | "double",
  label: string,
): string {
  const art = kind === "spin" ? "spin" : kind === "max" ? "max" : "stake";
  return `<span class="tutorial-key tutorial-key-${kind}" style="--tutorial-key-art:url('${ASSETS}button-${art}-reference-clean-2026-10-14.webp')"><span>${label}</span></span>`;
}
function tutorialFind(kind: string): string {
  return `<span class="find-art find-${kind} tutorial-find"></span>`;
}
function tutorialCard(card?: Card): string {
  let face = "";
  if (card) {
    const label = cardLabel(card);
    const rank = label.slice(0, -1);
    const suit = label.slice(-1);
    const corner = `<span>${rank}</span><small>${suit}</small>`;
    face = `<span class="card-corner">${corner}</span><span class="card-pip">${suit}</span><span class="card-corner card-corner-bottom">${corner}</span>`;
  }
  return `<span class="playing-card tutorial-card${card ? " is-revealed" : ""}"><span class="card-turn" aria-hidden="true"><span class="card-side card-back">?</span><span class="card-side card-face${card && cardRed(card) ? " is-red" : ""}">${face}</span></span></span>`;
}
function ruleStep(
  visual: string,
  title: string,
  copy: string,
  wide = false,
): string {
  return `<section class="rule-step${wide ? " rule-wide" : ""}"><div aria-hidden="true">${visual}</div><div class="rule-step-copy"><h3>${title}</h3><p>${copy}</p></div></section>`;
}

function renderRules(index: RuleIndex, state: RuleState, lang: Lang): string {
  const lines = state.lines;
  const bet = state.bet;
  const fullStake = lines * bet;
  const number = (value: number) =>
    value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
  const symbolNames = SYMBOL_NAMES[lang];
  if (index === 0) {
    const payouts = [...SYMBOLS]
      .reverse()
      .filter((symbol) => symbol.pays)
      .map((symbol) => {
        const name = symbolNames[symbol.id];
        const pays = symbol.pays!;
        return `<article class="pay-pair" aria-label="${name}"><img src="${ASSETS}slot-live/${symbol.id}.webp" alt="${name}"><dl>${pays.map((pay, i) => `<div><dt><span aria-hidden="true">${i + 3} ×</span><span class="sr-only">${lang === "ru" ? `${i + 3} ${i === 2 ? "символов" : "символа"} подряд` : `${i + 3} matching symbols in a row`}</span></dt><dd>${number(pay * bet)}</dd></div>`).join("")}</dl></article>`;
      })
      .join("");
    const table =
      lang === "ru"
        ? `<p class="rule-context pay-context">Ставка <strong>${number(bet)}</strong> на линию</p><div class="pay-pairs">${payouts}</div>`
        : `<p class="rule-context pay-context">Bet per line: <strong>${number(bet)}</strong></p><div class="pay-pairs">${payouts}</div>`;
    const trigger = `<div class="pay-bonus-line"><img src="${ASSETS}slot-live/bonus.webp" alt="${symbolNames.bonus}"><p><strong>${lang === "ru" ? `${BONUS_MIN}+ Юпика → Бонусная игра` : `${BONUS_MIN}+ Yupiks → Bonus game`}</strong></p></div>`;
    const lineRow = `<div class="tutorial-line-row">${[1, 3, 5, 7, 9].map((n) => `<span class="tutorial-line${n === lines ? " is-selected" : ""}"><b>${n}</b></span>`).join("")}</div><div class="rule-visual">${tutorialKey("stake", lang === "ru" ? `Ставка<small>${bet}</small>` : `Bet<small>${bet}</small>`)}${tutorialKey("spin", lang === "ru" ? "Крутить" : "Spin")}</div>`;
    if (lang === "ru")
      return `<section class="rule-section">${table}${trigger}<div class="pay-notes"><p>Комбинации считаются слева направо и справа налево.</p><p>Золотая рыба заменяет любой символ, кроме короны и Бонуса.</p></div></section>${ruleStep(lineRow, "Линии → ставка → вращение", `Выбери 1, 3, 5, 7 или 9 линий и ставку на линию. Полная стоимость — в поле «За спин»: сейчас <strong>${number(fullStake)}</strong>. Нажми «Крутить» и смотри итог в поле «Выигрыш».`, true)}`;
    return `<section class="rule-section">${table}${trigger}<div class="pay-notes"><p>Combinations count from left to right and right to left.</p><p>The Golden fish substitutes for any symbol except the crown and Bonus.</p></div></section>${ruleStep(lineRow, "Lines → bet → spin", `Choose 1, 3, 5, 7, or 9 lines and a bet per line. The total cost appears under “Per spin”: currently <strong>${number(fullStake)}</strong>. Press “Spin” and check the “Win” field.`, true)}`;
  }
  if (index === 1) {
    const trigger = `<div class="tutorial-trigger"><img class="tutorial-symbol" src="${ASSETS}slot-live/bonus.webp" alt=""><span>×${BONUS_MIN}+</span></div>`;
    const rows = Array.from(
      { length: 4 },
      (_, row) =>
        `<div class="tutorial-mound-row${row === 3 ? " is-nearest" : ""}">${'<span class="tutorial-mound"></span>'.repeat(5)}</div>`,
    ).join("");
    const field = `<div class="tutorial-dig"><span class="tutorial-up"></span>${rows}<span class="tutorial-start">${lang === "ru" ? "Начни с ближнего ряда" : "Start with the nearest row"}</span></div>`;
    const prizes =
      lang === "ru"
        ? [
            ["bag", "Мешочек", "×1–10"],
            ["chest", "Маленький сундук", "×15–50"],
            ["magic", "Магический сундук", "×75–250"],
            ["trap", "Капкан", "Конец раскопок"],
          ]
        : [
            ["bag", "Pouch", "×1–10"],
            ["chest", "Small chest", "×15–50"],
            ["magic", "Magic chest", "×75–250"],
            ["trap", "Trap", "Digging ends"],
          ];
    const prizeGrid = `<div class="rule-prizes">${prizes.map(([kind, name, value]) => `<div class="rule-prize"><span aria-hidden="true">${tutorialFind(kind)}</span><h4>${name}</h4><strong>${value}</strong>${kind === "trap" ? `<small>${lang === "ru" ? "Найденное остаётся" : "Keep what you found"}</small>` : ""}</div>`).join("")}</div>`;
    if (lang === "ru")
      return `<p class="rule-context">Награды — от полной ставки за спин: <strong>${number(fullStake)}</strong></p>${ruleStep(trigger, "Три Юпика открывают бонус", "Собери 3 или больше бонусных символов на барабанах — начнутся раскопки.")}${ruleStep(field, "Выбирай кучки снизу вверх", "Четыре ряда по пять кучек. В каждом выбери <strong>одну подсвеченную кучку</strong>; Юпик подойдёт и раскопает её.", true)}<section class="rule-section"><h3>Что может найти Юпик</h3>${prizeGrid}<p>Суммы находок <strong>складываются</strong>. Капкан завершает раскопки, но не отнимает найденное.</p><p>Прошёл все четыре ряда — открываются <strong>пещеры</strong>.</p></section>`;
    return `<p class="rule-context">Rewards use the full bet per spin: <strong>${number(fullStake)}</strong></p>${ruleStep(trigger, "Three Yupiks start the bonus", "Get 3 or more Bonus symbols on the reels to start digging.")}${ruleStep(field, "Choose mounds from bottom to top", "There are four rows of five mounds. Choose <strong>one highlighted mound</strong> in each row; Yupik walks over and digs it up.", true)}<section class="rule-section"><h3>What Yupik can find</h3>${prizeGrid}<p>Found amounts <strong>add together</strong>. A trap ends digging, but you keep what you found.</p><p>Complete all four rows to open the <strong>caves</strong>.</p></section>`;
  }
  if (index === 2) {
    const caves = `<div class="tutorial-caves"><span>${lang === "ru" ? "Пещера 1" : "Cave 1"}</span><span>${lang === "ru" ? "Пещера 2" : "Cave 2"}</span></div>`;
    const chest = `<div class="rule-visual">${tutorialFind("magic")}</div>`;
    const bear =
      '<div class="rule-visual"><span class="find-art tutorial-find tutorial-bear"></span></div>';
    const progress = `<div class="tutorial-progress" aria-hidden="true">${"<span></span>".repeat(SUPER_ATTEMPTS)}</div>`;
    if (lang === "ru")
      return `<p class="rule-context">Супер-бонус после четырёх рядов раскопок</p>${ruleStep(caves, "Отправь Юпика в одну из пещер", "Выбери левый или правый вход. Юпик уйдёт внутрь, а затем из этой пещеры появится сундук или медведь.", true)}${ruleStep(chest, "Сундук — ещё один клад", `Добавляет <strong>×${SUPER_PRIZE}</strong> ставки за спин: сейчас <strong>+${number(SUPER_PRIZE * fullStake)}</strong>. После сундука можно выбирать снова.`)}<section class="rule-section">${progress}<p class="tutorial-total"><span>До ${SUPER_ATTEMPTS} кладов</span><strong>+${number(SUPER_PRIZE * SUPER_ATTEMPTS * fullStake)}</strong></p><p>Максимум — ${SUPER_ATTEMPTS} удачных выборов, то есть ${SUPER_PRIZE * SUPER_ATTEMPTS} ставок за спин.</p></section>${ruleStep(bear, "Медведь завершает бонус", "Все уже найденные сокровища <strong>остаются у тебя</strong>. Они складываются внизу экрана.")}`;
    return `<p class="rule-context">Super bonus after four rows of digging</p>${ruleStep(caves, "Send Yupik into a cave", "Choose the left or right entrance. Yupik goes inside, then a chest or a bear comes out of that cave.", true)}${ruleStep(chest, "A chest adds another treasure", `Adds <strong>×${SUPER_PRIZE}</strong> the bet per spin: now <strong>+${number(SUPER_PRIZE * fullStake)}</strong>. After a chest, you can choose again.`)}<section class="rule-section">${progress}<p class="tutorial-total"><span>Up to ${SUPER_ATTEMPTS} treasures</span><strong>+${number(SUPER_PRIZE * SUPER_ATTEMPTS * fullStake)}</strong></p><p>At most ${SUPER_ATTEMPTS} successful choices, equal to ${SUPER_PRIZE * SUPER_ATTEMPTS} bets per spin.</p></section>${ruleStep(bear, "The bear ends the bonus", "You <strong>keep every treasure already found</strong>. They appear together at the bottom of the screen.")}`;
  }
  const entry = `<div class="rule-visual">${tutorialKey("double", lang === "ru" ? "Удвоить" : "Double")}</div>`;
  const table = `<div class="tutorial-risk"><div class="tutorial-dealer"><span class="tutorial-yupik"></span><div><div class="tutorial-card-label">${lang === "ru" ? "Карта Юпика" : "Yupik's card"}</div>${tutorialCard({ rank: 8, suit: 0 })}</div></div><div class="tutorial-hand">${Array.from({ length: 4 }, () => tutorialCard()).join("")}</div></div>`;
  const outcomes =
    lang === "ru"
      ? '<div class="tutorial-outcomes"><div>Твоя старше<strong>×2</strong><small>Выигрыш удвоен</small></div><div>Карты равны<strong>=</strong><small>Сумма остаётся<br>Выбирай снова</small></div><div class="is-loss">Твоя младше<strong>0</strong><small>Выигрыш потерян</small></div></div>'
      : '<div class="tutorial-outcomes"><div>Yours is higher<strong>×2</strong><small>Win doubled</small></div><div>Cards tie<strong>=</strong><small>Amount stays<br>Choose again</small></div><div class="is-loss">Yours is lower<strong>0</strong><small>Win lost</small></div></div>';
  if (lang === "ru")
    return `${ruleStep(entry, "После выигрыша — к картам", "Нажми «Удвоить», чтобы сыграть с Юпиком. Если хочешь сохранить выигрыш, выбери «Забрать» на красной кнопке.")}${ruleStep(table, "Вытяни карту старше Юпика", "Юпик открывает свою карту <strong>первым</strong>. Затем выбери одну из четырёх закрытых карт. Твоя карта старше — <strong>выигрыш ×2</strong>.", true)}<section class="rule-section">${outcomes}<p>Туз — самая старшая карта. Можно удвоить выигрыш до <strong>${RISK_MAX_ROUNDS} раз</strong>.</p><p>После удачного выбора можно забрать выигрыш или удвоить ещё. При выходе сохраняется оставшаяся сумма.</p></section>`;
  return `${ruleStep(entry, "After a win — play cards", "Press “Double” to play against Yupik. To keep your win, press “Collect” on the red button.")}${ruleStep(table, "Draw a card higher than Yupik’s", "Yupik reveals his card <strong>first</strong>. Then choose one of four face-down cards. If yours is higher, <strong>your win doubles</strong>.", true)}<section class="rule-section">${outcomes}<p>Ace is the highest card. You can double your win up to <strong>${RISK_MAX_ROUNDS} times</strong>.</p><p>After a successful choice, collect your win or double again. When you leave, you keep the remaining amount.</p></section>`;
}

/** Binds the approved four-tab native rules dialog. Returns complete event cleanup. */
export function setupRules(
  root: HTMLElement,
  getState: () => RuleState,
  lang: Lang,
  onOpen?: () => void,
): () => void {
  const button = root.querySelector<HTMLButtonElement>("#rules-button");
  const modal = root.querySelector<HTMLDialogElement>("#rules-modal");
  const closeButton = root.querySelector<HTMLButtonElement>("#rules-close");
  const panel = root.querySelector<HTMLElement>("#rule-copy");
  const tabs = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-rule]"),
  );
  if (!button || !modal || !closeButton || !panel || tabs.length !== 4)
    throw new Error("Casino rules markup is incomplete");
  const title = modal.querySelector<HTMLElement>("#rules-title");
  const tablist = modal.querySelector<HTMLElement>('[role="tablist"]');
  if (title) title.textContent = UI[lang].title;
  button.setAttribute("aria-label", UI[lang].button);
  closeButton.setAttribute("aria-label", UI[lang].close);
  if (tablist) tablist.setAttribute("aria-label", UI[lang].tabs);
  tabs.forEach((tab, index) => {
    tab.textContent = UI[lang].names[index];
  });
  let current: RuleIndex = 0;
  let destroyed = false;
  function showTab(index: RuleIndex, focus = false): void {
    current = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
    });
    panel!.innerHTML = renderRules(index, getState(), lang);
    panel!.setAttribute(
      "aria-labelledby",
      tabs[index].id || `rule-tab-${index}`,
    );
    panel!.scrollTop = 0;
    if (focus) tabs[index].focus({ preventScroll: true });
  }
  function close(): void {
    if (modal!.open) modal!.close();
    modal!.hidden = true;
    document.body.classList.remove("rules-open");
    if (!destroyed && button!.isConnected)
      button!.focus({ preventScroll: true });
  }
  function open(): void {
    if (destroyed || modal!.open || !modal!.hidden) return;
    onOpen?.();
    modal!.hidden = false;
    showTab(0);
    modal!.showModal();
    document.body.classList.add("rules-open");
    closeButton!.focus({ preventScroll: true });
  }
  function cancel(event: Event): void {
    event.preventDefault();
    close();
  }
  function nativeClose(): void {
    modal!.hidden = true;
    document.body.classList.remove("rules-open");
    if (!destroyed && button!.isConnected)
      button!.focus({ preventScroll: true });
  }
  const tabHandlers = tabs.map((tab, index) => {
    const click = () => showTab(index as RuleIndex);
    const keydown = (event: KeyboardEvent) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % 4;
      else if (event.key === "ArrowLeft") next = (index + 3) % 4;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 3;
      else return;
      event.preventDefault();
      showTab(next as RuleIndex, true);
    };
    tab.addEventListener("click", click);
    tab.addEventListener("keydown", keydown);
    return { tab, click, keydown };
  });
  button.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  modal.addEventListener("cancel", cancel);
  modal.addEventListener("close", nativeClose);
  return () => {
    destroyed = true;
    button.removeEventListener("click", open);
    closeButton.removeEventListener("click", close);
    modal.removeEventListener("cancel", cancel);
    modal.removeEventListener("close", nativeClose);
    tabHandlers.forEach(({ tab, click, keydown }) => {
      tab.removeEventListener("click", click);
      tab.removeEventListener("keydown", keydown);
    });
    if (modal.open) modal.close();
    modal.hidden = true;
    document.body.classList.remove("rules-open");
  };
}
