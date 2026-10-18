// «Транзакции нет» — только если два РАЗНЫХ провайдера прямо сказали
// UNKNOWN_TRANSACTION и никто её не нашёл. Два узла fastnear — один провайдер.
import { afterEach, describe, expect, it, vi } from "vitest";

delete process.env.NEAR_RPC_URL;
delete process.env.NEAR_RPC_FALLBACKS;
const { txAbsentOnTwoProviders } = await import("./rpc-absent");

type Ans = "absent" | "present" | "down";
function nodes(map: Record<string, Ans>) {
  vi.stubGlobal("fetch", async (url: string) => {
    const host = new URL(url).hostname;
    const a = Object.entries(map).find(([k]) => host.includes(k))?.[1] ?? "down";
    if (a === "down") throw new Error("ECONNRESET");
    const body = a === "present" ? { result: { status: { SuccessValue: "" } } } : { error: { cause: { name: "UNKNOWN_TRANSACTION" } } };
    return { ok: true, json: async () => body } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("транзакции точно нет", () => {
  it("оба узла fastnear — это один провайдер: мало", async () => {
    nodes({ fastnear: "absent" });
    expect(await txAbsentOnTwoProviders("H", "s")).toBe(false);
  });

  it("fastnear и drpc оба «не знаю такую» — нет", async () => {
    nodes({ fastnear: "absent", drpc: "absent" });
    expect(await txAbsentOnTwoProviders("H", "s")).toBe(true);
  });

  it("хоть один нашёл — есть", async () => {
    nodes({ fastnear: "absent", drpc: "absent", "near.org": "present" });
    expect(await txAbsentOnTwoProviders("H", "s")).toBe(false);
  });
});
