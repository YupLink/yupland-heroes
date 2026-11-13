// Тексты дуэли на двух языках (русский по умолчанию) и запись хода словами.
import type { Lang } from "@/lib/store";
import type { LogEntry, Side, SpellId } from "@/lib/duel/types";
import { DEFEND_CUT, SPELLS } from "@/lib/duel/rules";

export type DuelText = ReturnType<typeof duelText>;

/** 1 500 → 1,5K; 2 000 000 → 2M — подписи жизней на поле. */
export function short(n: number): string {
  const a = Math.abs(n);
  const f = (v: number, s: string) => `${Number(v.toFixed(v < 10 ? 1 : 0))}${s}`;
  if (a >= 1e9) return f(n / 1e9, "B");
  if (a >= 1e6) return f(n / 1e6, "M");
  if (a >= 1e4) return f(n / 1e3, "K");
  return String(Math.round(n));
}

/** Коротко для выбора бойцов (владелец 09.11: «сокращай — 1к/1млн»): 50к, 1,5млн, 2млрд. */
export function abbr(n: number, ru: boolean): string {
  const a = Math.abs(n);
  const f = (v: number) => {
    const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
    return ru ? String(r).replace(".", ",") : String(r);
  };
  if (a >= 1e9) return f(n / 1e9) + (ru ? "млрд" : "B");
  if (a >= 1e6) return f(n / 1e6) + (ru ? "млн" : "M");
  if (a >= 1e3) return f(n / 1e3) + (ru ? "к" : "k");
  return String(Math.round(n));
}

export function duelText(lang: Lang) {
  const ru = lang !== "en";
  const p = (r: string, e: string) => (ru ? r : e);
  const spell: Record<SpellId, string> = {
    atk: p("Атака", "Attack"),
    def: p("Защита", "Shield"),
  };
  const sideName = (s: Side) => (s === "a" ? p("Вы", "You") : p("Противник", "Enemy"));
  return {
    title: p("Дуэль героев", "Hero duel"),
    you: sideName("a"),
    enemy: sideName("b"),
    sideName,
    noHero: p("У вас нет героя — дуэли не с кем", "You have no hero to duel with"),
    round: (n: number) => (ru ? `Раунд ${n}` : `Round ${n}`),
    turnOf: (name: string) => (ru ? `Ход: ${name}` : `Turn: ${name}`),
    energy: p("Энергия", "Energy"),
    // Стойка «Оборона» — не путать с заклинанием «Защита» (владелец 09.11: «непонятно»).
    defend: p("Оборона", "Guard"),
    defendHint: ru
      ? `−${DEFEND_CUT} % урона до своего хода`
      : `−${DEFEND_CUT}% damage until next turn`,
    spellHint: {
      atk: ru
        ? `+${SPELLS.atk.pct} % к удару · ${SPELLS.atk.rounds} хода`
        : `+${SPELLS.atk.pct}% hit · ${SPELLS.atk.rounds} turns`,
      def: ru
        ? `−${SPELLS.def.pct} % урона · ${SPELLS.def.rounds} хода`
        : `−${SPELLS.def.pct}% damage · ${SPELLS.def.rounds} turns`,
    } as Record<SpellId, string>,
    spells: p("Заклинания героя", "Hero spells"),
    food: p("Еда героя", "Hero food"),
    pickAlly: p("Нажмите своего бойца — на него заклинание", "Tap your fighter to cast on"),
    heroOnly: p("Только в ход героя", "Hero's turn only"),
    steps: (n: number) => (ru ? `ход ${n} кл.` : `moves ${n}`),
    melee: p("бьёт вплотную", "melee"),
    ranged: (n: number) => (ru ? `стреляет на ${n} кл.` : `shoots ${n}`),
    deployTitle: p("Расстановка", "Deployment"),
    deployHint: p(
      "Выберите до 4 бойцов ниже, на поле — переставьте",
      "Pick up to 4 fighters below, then arrange them on the field",
    ),
    toBattle: p("В бой", "Fight"),
    roster: p("Ваши бойцы", "Your fighters"),
    abbr: (n: number) => abbr(n, ru),
    picked: (n: number, max: number) => (ru ? `выбрано ${n} из ${max}` : `${n} of ${max} picked`),
    flee: p("Сбежать", "Flee"),
    offerDraw: p("Предложить ничью", "Offer a draw"),
    offerWin: p("Предложить сдаться", "Offer surrender"),
    draw: p("Ничья", "Draw"),
    drawStay: p(
      "ничья — потраченное не вернётся, все остаются на своих клетках",
      "draw — nothing spent is returned, everyone stays on their cells",
    ),
    concededStay: p(
      "сдался — остаётся на своей клетке, живые мобы — с теми жизнями, что остались",
      "surrendered — stays on the cell, surviving mobs keep their remaining health",
    ),
    inMoves: (n: number) => {
      if (!ru) return `in ${n} moves`;
      const m10 = n % 10;
      const m100 = n % 100;
      const w =
        m10 === 1 && m100 !== 11
          ? "ход"
          : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)
            ? "хода"
            : "ходов";
      return `через ${n} ${w}`;
    },
    enemyConceded: p("противник сдался", "the enemy surrendered"),
    spell,
    win: (s: Side) => (ru ? `Победа: ${sideName(s)}` : `Winner: ${sideName(s)}`),
    again: p("Ещё бой", "Again"),
    spent: p("В настоящем бою спишется", "A real duel would take"),
    spentEnergy: (n: number) => (ru ? `энергия −${n}` : `energy −${n}`),
    spentFood: (list: string[]) =>
      ru ? `съедено: ${list.join(", ")}` : `eaten: ${list.join(", ")}`,
    lostMobs: (list: string[]) =>
      ru ? `погибли мобы: ${list.join(", ")}` : `mobs lost: ${list.join(", ")}`,
    heroHome: p("герой — домой голодным (сытость 0)", "hero goes home hungry (satiety 0)"),
    heroHungry: p("герой пал — сытость 0, остаётся на месте", "hero fell — satiety 0, stays"),
    heroFled: p("сбежал — сытость сохранена, домой", "fled — satiety kept, goes home"),
    log(e: LogEntry): string {
      switch (e.k) {
        case "hit": {
          const verb = e.shot ? p("стреляет в", "shoots") : p("бьёт", "hits");
          return `${e.a} ${verb} ${e.b}: −${short(e.dmg)}${e.killed ? p(" — повержен", " — down") : ""}`;
        }
        case "spell":
          return `${e.a}: ${spell[e.spell] ?? e.spell} → ${e.b} (${e.value} %)`;
        case "eat":
          return ru
            ? `${e.a} ест «${e.food}»: +${short(e.value)}`
            : `${e.a} eats ${e.food}: +${short(e.value)}`;
        case "defend":
          return ru ? `${e.a} в защите` : `${e.a} defends`;
        case "move":
          return ru ? `${e.a} идёт` : `${e.a} moves`;
        case "flee":
          return ru ? `Сбежал: ${sideName(e.side)}` : `Fled: ${sideName(e.side)}`;
        case "offer": {
          const other = sideName(e.side === "a" ? "b" : "a");
          if (e.what === "draw") {
            return e.ok
              ? p(`${other}: согласен на ничью`, `${other}: agrees to a draw`)
              : p(`${other}: от ничьей отказался`, `${other}: refuses a draw`);
          }
          return e.ok
            ? p(`${other}: сдаётся`, `${other}: surrenders`)
            : p(`${other}: не сдаётся`, `${other}: won't surrender`);
        }
        case "round":
          return ru ? `— раунд ${e.n} —` : `— round ${e.n} —`;
      }
    },
  };
}
