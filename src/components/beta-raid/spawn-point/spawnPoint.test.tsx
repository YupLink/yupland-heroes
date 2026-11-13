// Окно точки спавна: строка моба — моб, сколько, «встаёт через», награда (как у
// моба / своя), погода несколькими; черновик → запрос (ошибка в награде или
// больше 30 мобов — кнопка серая).
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/server/api/beta-raid/spawn-point/spawn-point-api", () => ({}));
const { SpawnPointMobRow } = await import("./SpawnPointMobRow");
const { WeatherPick } = await import("@/components/beta-raid/WeatherPick");
const { newMobDraft, pointPayload } = await import("./spawnPointDraft");

const mobs = [
  { id: "rbt_wolf", name: "Волк", rewardConfig: null },
  { id: "rbt_bear", name: "Медведь", rewardConfig: null },
];

describe("строка моба", () => {
  it("моб, ×N, «встаёт через», награда как у моба, погода — «любая погода»", () => {
    const html = renderToStaticMarkup(
      <SpawnPointMobRow
        d={newMobDraft("rbt_wolf")}
        mobs={mobs}
        tokens={[]}
        en={false}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Волк");
    expect(html).toContain("Медведь");
    expect(html).toContain("×10");
    expect(html).toContain("встаёт через 30 мин");
    expect(html).toContain("награда как у моба");
    expect(html).toContain("своя награда");
    expect(html).toContain("любая погода");
  });

  it("погода несколькими: «дождь, туман»", () => {
    const html = renderToStaticMarkup(
      <WeatherPick value={["rain", "fog"]} onChange={() => {}} en={false} />,
    );
    expect(html).toContain("дождь, туман");
  });
});

describe("черновик → запрос", () => {
  it("строки как есть; награда «как у моба» — null", () => {
    const out = pointPayload({
      radius: 3,
      mobs: [{ ...newMobDraft("rbt_wolf"), count: 2, weathers: ["rain"] }],
    });
    expect(out).toEqual({
      radius: 3,
      mobs: [{ mob: "rbt_wolf", count: 2, weathers: ["rain"], respawnMin: 30, reward: null }],
    });
  });

  it("пусто или больше 30 мобов — нельзя", () => {
    expect(pointPayload({ radius: 3, mobs: [] })).toBeNull();
    const many = Array.from({ length: 4 }, () => ({ ...newMobDraft("rbt_wolf"), count: 10 }));
    expect(pointPayload({ radius: 3, mobs: many })).toBeNull();
  });
});
