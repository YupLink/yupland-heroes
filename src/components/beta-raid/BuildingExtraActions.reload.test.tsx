// Последний блок окна постройки — только вышка. Вид, которого клиент не знает,
// больше не попадает в «Осмотреть округу на undefined клеток». Рендер на сервере.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, useLang: () => "ru" }));
vi.mock("@/server/api/beta-raid/tower-reveal", () => ({ revealFromTower: vi.fn() }));
vi.mock("./CasinoAction", () => ({ CasinoAction: () => <i>casino</i> }));

const { BuildingExtraActions } = await import("./BuildingExtraActions");
type Extra = Parameters<typeof BuildingExtraActions>[0]["extra"];

function html(extra: unknown): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <BuildingExtraActions q={1} r={2} extra={extra as Extra} onDone={() => {}} />
    </QueryClientProvider>,
  );
}

describe("блок постройки по виду", () => {
  it("незнакомый вид — пусто, без «undefined»", () => {
    expect(html({ kind: "brand_new" })).toBe("");
  });

  it("вышка — «Осмотреть округу»", () => {
    const out = html({
      kind: "watchtower",
      energy: 5,
      radius: 3,
      used: false,
      can: true,
      reasonKey: null,
    });
    expect(out).toContain("braid.scout_for");
    expect(out).toContain("braid.reveal_terrain");
  });

  it("знакомый вид — свой блок", () => {
    expect(html({ kind: "casino" })).toBe("<i>casino</i>");
  });
});
