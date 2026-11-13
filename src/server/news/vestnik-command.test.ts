import { beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({
  setChat: vi.fn(async () => {}),
  chatFor: vi.fn(async (): Promise<number | null> => -100500),
  send: vi.fn(async () => true),
}));
vi.mock("./vestnik-publish", () => ({ setChat: spy.setChat, chatFor: spy.chatFor }));
vi.mock("@/server/tgGameBot", () => ({ gameBotSend: spy.send, gamePlayButton: () => ({}) }));

const { handleVestnikCommand, isAdminTg, parseVestnik } = await import("./vestnik-command");

describe("/vestnik", () => {
  beforeEach(() => {
    spy.setChat.mockClear();
    spy.send.mockClear();
    process.env.ADMIN_TG_ACCOUNTS = "111, 222";
  });

  it("разбор команды", () => {
    expect(parseVestnik("/vestnik")).toBe("on");
    expect(parseVestnik("/vestnik@yupland_heroes_bot")).toBe("on");
    expect(parseVestnik("/vestnik stop")).toBe("stop");
    expect(parseVestnik("/vestnikx")).toBeNull();
    expect(parseVestnik("привет")).toBeNull();
  });

  it("админ по Telegram — из того же списка, что вход в админку", () => {
    expect(isAdminTg(111, "111,222")).toBe(true);
    expect(isAdminTg(333, "111,222")).toBe(false);
    expect(isAdminTg(1, undefined)).toBe(false);
  });

  it("админ в группе — чат газеты включается и выключается", async () => {
    expect(await handleVestnikCommand("/vestnik", 222, -100500, "supergroup")).toBe(true);
    expect(spy.setChat).toHaveBeenLastCalledWith("day", -100500);
    await handleVestnikCommand("/vestnik stop", 222, -100500, "group");
    expect(spy.setChat).toHaveBeenLastCalledWith("day", null);
    expect(spy.send).toHaveBeenCalledTimes(2);
  });

  it("stop из чужой группы газету не останавливает", async () => {
    expect(await handleVestnikCommand("/vestnik stop", 111, -777, "supergroup")).toBe(true);
    expect(spy.setChat).not.toHaveBeenCalled();
    expect(spy.send).not.toHaveBeenCalled();
  });

  it("не админ или личка — молча ничего", async () => {
    expect(await handleVestnikCommand("/vestnik", 999, -100500, "supergroup")).toBe(true);
    expect(await handleVestnikCommand("/vestnik", 111, 111, "private")).toBe(true);
    expect(spy.setChat).not.toHaveBeenCalled();
    expect(spy.send).not.toHaveBeenCalled();
  });
});
