// Меню входа: только новичку «Начать игру»; вернувшийся игрок входит без меню;
// без ответа сервера — вход без меню, пока ответа нет — заставка держится.
import { describe, expect, it, vi } from "vitest";
import { startMenuMode } from "./startMenuMode";

const q = vi.hoisted(() => ({ opts: null as Record<string, unknown> | null }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: Record<string, unknown>) => {
    q.opts = o;
    return {};
  },
}));
vi.mock("@/server/api/game-start", () => ({ getGameStart: async () => null }));

const opt = { id: "hero_bee", name: "Fedr", race: "Пчела", image: null };
const fresh = { data: { fresh: true, options: [opt] }, isError: false };
const playing = { data: { fresh: false, options: [] }, isError: false };

describe("startMenuMode", () => {
  it("меню закрыто или не нужно — пропуск", () => {
    expect(startMenuMode(false, fresh)).toBe("skip");
  });

  it("ответ не пришёл (ошибка) — вход без меню", () => {
    expect(startMenuMode(true, { isError: true })).toBe("skip");
  });

  it("ждём ответ — pending (заставка держится)", () => {
    expect(startMenuMode(true, { isError: false })).toBe("pending");
  });

  it("новичок — меню, вернувшийся игрок — без меню, как раньше", () => {
    expect(startMenuMode(true, fresh)).toBe("new");
    expect(startMenuMode(true, playing)).toBe("skip");
  });

  it("ответ уже есть — упавший повтор запроса меню не снимает (выбор расы не пропадает)", () => {
    expect(startMenuMode(true, { ...fresh, isError: true })).toBe("new");
    expect(startMenuMode(true, { ...playing, isError: true })).toBe("skip");
  });
});

describe("useGameStartStatus", () => {
  it("решение одно на загрузку: ответ не устаревает и не перечитывается по сети/фокусу", async () => {
    const { useGameStartStatus } = await import("./useGameStart");
    useGameStartStatus(true, "w.near");
    expect(q.opts).toMatchObject({
      enabled: true,
      staleTime: Infinity,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    });
    useGameStartStatus(true, null);
    expect(q.opts?.enabled).toBe(false);
  });
});
