// Кнопки боя на карте: итог с «Атаковать снова» / «i» / «Закрыть» (добитой
// цели повтор не предлагаем), «i» на карточке «рядом» — только у цели боя.
// Оба языка.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { dict } from "@/lib/translations";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
      String(vars?.[k] ?? ""),
    ),
}));

const { BetaFightActions } = await import("./BetaFightActions");
const { BetaAdjacentObject } = await import("@/components/beta-raid/BetaRaidControls");
const { RaidFightResult } = await import("@/components/raid/RaidFightResult");

const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const noop = () => {};
const actions = (killed: boolean, busy = false, cost: number | null = 10) =>
  html(
    <BetaFightActions
      killed={killed}
      busy={busy}
      cost={cost}
      onAgain={noop}
      onInfo={noop}
      onClose={noop}
    />,
  );

describe("итог боя на карте", () => {
  it("цель жива: «Атаковать снова ⚡10», «i» и «Закрыть»", () => {
    lang.now = "ru";
    const out = actions(false);
    expect(out).toContain("Атаковать снова");
    expect(out).toContain(">10<");
    expect(out).toContain('aria-label="О цели"');
    expect(out).toContain("Закрыть");
  });

  it("цель добита: только «Закрыть»", () => {
    lang.now = "ru";
    const out = actions(true);
    expect(out).not.toContain("Атаковать снова");
    expect(out).not.toContain("О цели");
    expect(out).toContain("Закрыть");
  });

  it("удар летит: «Идёт бой…», кнопка выключена, цены нет", () => {
    lang.now = "ru";
    const out = actions(false, true);
    expect(out).toContain("Идёт бой…");
    expect(out).toContain("disabled");
    expect(out).not.toContain(">10<");
  });

  it("по-английски", () => {
    lang.now = "en";
    const out = actions(false);
    expect(out).toContain("Attack again");
    expect(out).toContain('aria-label="Target info"');
    expect(out).toContain("Close");
    lang.now = "ru";
  });

  it("свои кнопки заменяют «Ок», без них «Ок» на месте (старый рейд, охрана шахты)", () => {
    lang.now = "ru";
    const auto = { killed: false, dealt: 5, bossHpAfter: 95, bossMaxHp: 100 };
    const own = html(<RaidFightResult autoResult={auto} onClose={noop} actions={<i>свои</i>} />);
    expect(own).toContain("<i>свои</i>");
    expect(own).not.toContain(">Ок<");
    expect(html(<RaidFightResult autoResult={auto} onClose={noop} />)).toContain(">Ок<");
  });
});

describe("карточка «рядом»", () => {
  const card = (onInfo?: () => void) =>
    html(
      <BetaAdjacentObject
        name="Волк"
        imageUrl={null}
        kind="boss"
        badgeLabel="Босс"
        actionLabel="В бой"
        busy={false}
        onOpen={noop}
        onInfo={onInfo}
      />,
    );

  it("у цели боя — «i» рядом с «В бой»", () => {
    lang.now = "ru";
    expect(card(noop)).toContain('aria-label="О цели"');
    expect(card(noop)).toContain("В бой");
  });

  it("у лута «i» нет", () => {
    lang.now = "ru";
    expect(card()).not.toContain("О цели");
  });
});
