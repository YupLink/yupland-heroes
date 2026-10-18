// «Откуда числа»: графа «Очки» появляется, только когда очки вложены, и строка
// сходится с итогом; новые строки словаря — на обоих языках и без дублей.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations";
import { dict as fieldDict } from "@/lib/translations/braid-field";
import { dict as skillDict } from "@/lib/translations/braid-hero-skill";
import type { HeroStats } from "@/lib/heroStats";

const lang = vi.hoisted(() => ({ now: "ru" as "ru" | "en" }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => lang.now,
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[lang.now] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) =>
      String(vars?.[k] ?? ""),
    ),
}));

const { HeroStatBreakdown } = await import("./HeroStatBreakdown");

const st = (p: Partial<HeroStats> = {}): HeroStats => ({
  atk: 0,
  arm: 0,
  int: 0,
  spd: 0,
  hp: 0,
  luck: 0,
  ...p,
});

const html = (skill?: HeroStats | null) =>
  renderToStaticMarkup(
    <HeroStatBreakdown
      base={st({ arm: 30 })}
      skill={skill}
      gear={st({ arm: 3 })}
      stats={st({ arm: 30 + 3 + (skill?.arm ?? 0) })}
    />,
  );

describe("HeroStatBreakdown — графа очков", () => {
  it("очки вложены — колонка «Очки» и +4 в строке брони, итог сходится", () => {
    lang.now = "ru";
    const out = html(st({ arm: 4 }));
    expect(out).toContain(">Очки<");
    expect(out).toContain(">+4<");
    expect(out).toContain(">37<");
    expect(out).toContain("grid-cols-[1fr_auto_auto_auto_auto]");
  });

  it("по-английски — Points", () => {
    lang.now = "en";
    expect(html(st({ hp: 2 }))).toContain(">Points<");
    lang.now = "ru";
  });

  it("очков нет или старый кэш без поля — колонки нет", () => {
    for (const skill of [st(), null, undefined]) {
      const out = html(skill);
      expect(out).not.toContain(">Очки<");
      expect(out).toContain("grid-cols-[1fr_auto_auto_auto]");
      expect(out).not.toContain("grid-cols-[1fr_auto_auto_auto_auto]");
    }
  });
});

describe("словарь очков и прокачки", () => {
  it("новые ключи на обоих языках", () => {
    for (const k of ["braid.hero_stats_skill", "hero.level_up_points_toast", "hero.level_changed"]) {
      expect(dict[k]?.ru, k).toBeTruthy();
      expect(dict[k]?.en, k).toBeTruthy();
    }
    expect(dict["hero.level_up_points_toast"].ru).toContain("{k}");
  });

  it("ключ живёт в одном файле: braid-field не дублирует braid-hero-skill", () => {
    const dup = Object.keys(fieldDict).filter((k) => k in skillDict);
    expect(dup).toEqual([]);
  });
});
