import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  answers: [] as unknown[],
  asked: [] as string[],
}));
vi.mock("./news-ai-store", () => ({
  readAi: vi.fn(async (k: string) =>
    m.cache.has(k) ? { body: m.cache.get(k), image: null, ageSeconds: 0 } : null,
  ),
  writeAiBody: vi.fn(async (k: string, b: unknown) => void m.cache.set(k, b)),
}));
vi.mock("@/server/ai/deepseek", async (orig) => ({
  ...(await orig<typeof import("@/server/ai/deepseek")>()),
  deepseekJson: vi.fn(async (_s: string, u: string) => {
    m.asked.push(u);
    return m.answers.shift() ?? null;
  }),
}));

const { aiUpdates, commitsByDay, parseCommits } = await import("./news-ai-updates");

describe("«Что нового» от ИИ", () => {
  beforeEach(() => {
    m.cache.clear();
    m.answers = [];
    m.asked = [];
  });

  it("заголовки изменений — по дням UTC, окно [от, до)", () => {
    const t = (iso: string) => Date.parse(iso) / 1000;
    const by = commitsByDay(
      [
        { t: t("2026-10-30T23:59:00Z"), s: "a" },
        { t: t("2026-10-31T00:01:00Z"), s: "b" },
        { t: t("2026-11-01T10:00:00Z"), s: "c" },
      ],
      "2026-10-30",
      "2026-11-01",
    );
    expect([...by]).toEqual([
      ["2026-10-30", ["a"]],
      ["2026-10-31", ["b"]],
    ]);
  });

  it("выгрузка git: «секунды<TAB>заголовок», кривые строки мимо", () => {
    expect(parseCommits("1793298989\tЖила — товар лавки\nмусор\n\n12\t\n")).toEqual([
      { t: 1793298989, s: "Жила — товар лавки" },
    ]);
  });

  it("нет выгрузки — пусто и без вопросов к ИИ", async () => {
    expect(await aiUpdates("2026-10-30", "2026-10-31", new Set())).toEqual([]);
    expect(m.asked).toHaveLength(0);
  });
});
