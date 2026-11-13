// Окно «Ваш корабль подорвали — вас телепортировало в город»: есть непоказанные —
// одно окно с кнопкой «Понятно»; нет — ничего. Рендер на сервере (окружение node).
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-dom", async (orig) => ({
  ...(await orig<typeof import("react-dom")>()),
  createPortal: (node: ReactNode) => node,
}));
vi.mock("@/server/api/beta-raid/dynamite/ship-blast-notice", () => ({
  getShipBlastNotice: vi.fn(),
  markShipBlastSeen: vi.fn(),
}));
vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/translations");
  return { useT: () => (k: string) => dict[k]?.ru ?? k };
});

const { ShipBlastNotice, SHIP_BLAST_KEY } = await import("./ShipBlastNotice");
const g = globalThis as { document?: unknown };
g.document = { body: {} };
afterAll(() => void delete g.document);

function html(ids: string[]): string {
  const qc = new QueryClient();
  qc.setQueryData(SHIP_BLAST_KEY, { ids });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ShipBlastNotice />
    </QueryClientProvider>,
  );
}

describe("ShipBlastNotice", () => {
  it("непоказанные — одно окно с текстом и «Понятно»", () => {
    const out = html(["sbn_1", "sbn_2"]);
    expect(out).toContain("Ваш корабль подорвали — вас телепортировало в город");
    expect(out.match(/role="alertdialog"/g)).toHaveLength(1);
    expect(out).toContain(">Понятно<");
  });

  it("нечего показывать — пусто", () => {
    expect(html([])).toBe("");
  });
});
