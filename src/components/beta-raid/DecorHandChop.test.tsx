// «Срубить руками» (§8.56): цена 10 энергии и 30 сытости на кнопке; мало
// сытости или энергии — неактивна с причиной; чисел нет — активна.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations/braid-decor";

const ui = vi.hoisted(() => ({
  lang: "ru" as "ru" | "en",
  energy: 50 as number | undefined,
  satiety: 100 as number | null,
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    (dict[key]?.[ui.lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? "")),
}));
vi.mock("@/lib/hooks/useEnergy", () => ({
  useEnergy: () => ({ data: ui.energy === undefined ? undefined : { energy: ui.energy } }),
}));
vi.mock("./SatietyBar", () => ({
  useSatiety: () =>
    ui.satiety === null ? null : { now: ui.satiety, max: 1000, hungry: ui.satiety <= 0 },
}));

const { DecorHandChop } = await import("./DecorHandChop");
const html = (busy = false) =>
  renderToStaticMarkup(<DecorHandChop busy={busy} onChop={() => {}} />);

beforeEach(() => Object.assign(ui, { lang: "ru", energy: 50, satiety: 100 }));

describe("DecorHandChop", () => {
  it("хватает всего — активна, цена −10 и −30", () => {
    const out = html();
    expect(out).toContain("Срубить руками");
    expect(out).toContain("−10</span>");
    expect(out).toContain("−30</span>");
    expect(out).not.toContain(`disabled=""`);
  });

  it("сытости меньше 30 — неактивна, «Мало сытости — нужно 30»", () => {
    ui.satiety = 29;
    const out = html();
    expect(out).toContain(`disabled=""`);
    expect(out).toContain("Мало сытости — нужно 30");
  });

  it("энергии меньше 10 — неактивна, «Not enough energy — need 10»", () => {
    Object.assign(ui, { lang: "en", energy: 9 });
    const out = html();
    expect(out).toContain(`disabled=""`);
    expect(out).toContain("Not enough energy — need 10");
    expect(out).toContain("Chop by hand");
  });

  it("героя и баланса нет — решает сервер, кнопка активна", () => {
    Object.assign(ui, { energy: undefined, satiety: null });
    expect(html()).not.toContain(`disabled=""`);
  });

  it("ru и en заведены для всех ключей рубки руками", () => {
    for (const k of [
      "braid.decor_hand",
      "braid.decor_hand_hungry",
      "braid.decor_hand_no",
      "braid.decor_hand_low_satiety",
      "braid.decor_hand_low_energy",
    ]) {
      expect(dict[k]?.ru).toBeTruthy();
      expect(dict[k]?.en).toBeTruthy();
    }
  });
});
