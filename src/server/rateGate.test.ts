// Гард частоты: счёт в базе, при её молчании — в памяти процесса.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let dbCount: number | null = 1;
let dbFail = false;

vi.mock("./db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.startsWith("CREATE TABLE") || sql.startsWith("DELETE")) return null;
    if (dbFail) throw new Error("db down");
    return dbCount === null ? [] : [{ n: dbCount }];
  }),
}));

const { rateGate, actionGate } = await import("./rateGate");

beforeEach(() => {
  calls.length = 0;
  dbCount = 1;
  dbFail = false;
});

describe("rateGate", () => {
  it("в норме — пропускает, одним INSERT с окном в миллисекундах", async () => {
    await expect(rateGate("k:1", { limit: 3, windowMs: 5000 })).resolves.toBeUndefined();
    const sql = calls.find((c) => c.includes("INSERT INTO yuplink.rate_hits"));
    expect(sql).toContain("'k:1'");
    expect(sql).toContain("5000 * interval '1 millisecond'");
  });

  it("сверх лимита — бросает с сообщением", async () => {
    dbCount = 4;
    await expect(rateGate("k:2", { limit: 3, message: "стоп" })).rejects.toThrow("стоп");
  });

  it("база молчит — считает в памяти и всё равно ограничивает", async () => {
    dbFail = true;
    await actionGate("x", "w");
    for (let i = 0; i < 29; i++) await actionGate("x", "w");
    await expect(actionGate("x", "w")).rejects.toThrow("Слишком часто");
    // Другой игрок — свой счётчик.
    await expect(actionGate("x", "other")).resolves.toBeUndefined();
  });

  it("пустой ответ базы — тоже запасной путь, без исключений", async () => {
    dbCount = null;
    await expect(rateGate("k:3", { limit: 1 })).resolves.toBeUndefined();
    await expect(rateGate("k:3", { limit: 1 })).rejects.toThrow();
  });
});
