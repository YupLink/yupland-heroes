// Основной инструмент героя (§8.24) для тестов мешочков — поверх фейка базы
// (bag.fake.ts): записанный ключ по герою и чтение, как main-tool-read.
// В тесте: vi.mock("../main-tool/main-tool-read", async () =>
//   (await import("./bag.fake-tool")).toolMainRead).
import { db, packOf } from "@/server/api/beta-raid/loot-bag/bag.fake";

export const mainTools = new Map<string, string | null>();
export const toolMainRead = {
  loadToolState: async (heroId: string) => {
    const key = mainTools.get(heroId) ?? null;
    const shovelOf = (k: string) => db.catalog.get(k.slice(k.indexOf(":") + 1))?.shovel === true;
    const stacks = [...packOf(heroId)]
      .filter(([, st]) => st.count >= 1)
      .map(([stackKey, st]) => {
        const cat = db.catalog.get(stackKey.slice(stackKey.indexOf(":") + 1));
        return {
          stackKey,
          count: st.count,
          shovel: cat?.shovel === true,
          durability: 100 - st.wear,
          name: cat?.name ?? stackKey,
          toolWear: cat?.wear ?? null,
        };
      });
    return { stored: { key, shovel: !!key && shovelOf(key) }, stacks };
  },
};
