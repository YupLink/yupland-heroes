// Обёртка информационных тостов игры: по умолчанию они ВЫКЛЮЧЕНЫ и молчат,
// включённые — сквозные по тапам, но с крестиком. Ошибки и ответы на действия
// игрока идут обычным toast.* и не глушатся никогда.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { gameInfoToast } from "./gameInfoToast";
import { setGameNotify } from "@/lib/hooks/useGameNotify";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn() }),
}));

const PASS_THROUGH = {
  closeButton: true,
  className: "pointer-events-none [&_button]:pointer-events-auto",
};

beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const showAllInfo = () => {
  gameInfoToast("Сундук: осталось 40%");
  gameInfoToast.success("Сундук: 5 DARAI — забери в «Добыче»");
  gameInfoToast.warning("Фишка оглушена — отдых 3 мин");
};

describe("gameInfoToast", () => {
  it("по умолчанию молчит: включать уведомления игрок должен сам", () => {
    showAllInfo();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("включено в настройках — показывает HP цели, награду, оглушение", () => {
    setGameNotify(true);
    showAllInfo();
    expect(toast).toHaveBeenCalledWith("Сундук: осталось 40%", PASS_THROUGH);
    expect(toast.success).toHaveBeenCalledWith("Сундук: 5 DARAI — забери в «Добыче»", PASS_THROUGH);
    expect(toast.warning).toHaveBeenCalledWith("Фишка оглушена — отдых 3 мин", PASS_THROUGH);
  });

  it("выключено в настройках — информационные тосты молчат", () => {
    setGameNotify(true);
    setGameNotify(false);
    showAllInfo();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("выключено — ответ на действие рядом с заглушённой сводкой всё равно доходит", () => {
    setGameNotify(false);
    gameInfoToast.success("Сундук: 5 DARAI — забери в «Добыче»");
    toast.success("Куплено");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Куплено");
    // Ошибку через обёртку не отправить вовсе — глушить её нечем.
    expect("error" in gameInfoToast).toBe(false);
  });

  it("включили обратно — снова показывает", () => {
    setGameNotify(false);
    setGameNotify(true);
    gameInfoToast("Цель убежала на две клетки");
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("свои опции вызова сохраняются, но сквозным и с крестиком тост остаётся", () => {
    setGameNotify(true);
    gameInfoToast("Сундук: осталось 20%", {
      id: "raid-hp-left",
      className: "font-bold",
      closeButton: false,
    });
    expect(toast).toHaveBeenCalledWith("Сундук: осталось 20%", {
      id: "raid-hp-left",
      closeButton: true,
      className: "font-bold pointer-events-none [&_button]:pointer-events-auto",
    });
  });
});
