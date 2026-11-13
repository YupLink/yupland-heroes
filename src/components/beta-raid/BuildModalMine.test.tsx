// Окно постройки: у шахты нет «Идти сюда» — шахта стена (§8.59 п. 9), окно
// открывается только вплотную, и кнопка закрывала бы окно, не сделав шага.
// У проходимых построек (табличка, коврик) кнопка на месте. Рендер на сервере.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { error: () => {}, success: () => {} }),
}));
vi.mock("@/lib/i18n", () => ({ useT: () => (key: string) => key, useLang: () => "ru" }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  getBuildingOffer: vi.fn(),
  buildNextTier: vi.fn(),
}));
vi.mock("@/server/api/beta-raid/home-castle", () => ({ getHomeCastle: vi.fn() }));
vi.mock("./BuildingExtraActions", () => ({ BuildingExtraActions: () => <i>extra</i> }));
vi.mock("./town/TownExtra", () => ({ TownExtra: () => null }));
vi.mock("./castleMode", () => ({ useCastleMode: () => null }));
vi.mock("@/lib/hooks/useResources", () => ({ RESOURCES_KEY: ["my-resources"] }));
vi.mock("@/lib/hooks/useEnergy", () => ({ ENERGY_KEY: ["my-energy"] }));

const { BuildModal } = await import("./BuildModal");

const offer = (extra: unknown) => ({
  effect: "x",
  built: true,
  extra,
  name: "Постройка",
  tier: 0,
  tierName: null,
  imageUrl: null,
  nextName: null,
  nextImageUrl: null,
  final: true,
  price: null,
  costs: null,
  requires: null,
  canBuild: false,
  blockReason: null,
});

function html(extra: unknown): string {
  const qc = new QueryClient();
  qc.setQueryData(["beta-raid-building", 4, -2], offer(extra));
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <BuildModal q={4} r={-2} onClose={() => {}} onGoTo={() => {}} />
    </QueryClientProvider>,
  );
}

describe("«Идти сюда» в окне постройки", () => {
  it("у шахты кнопки нет", () => {
    expect(html({ kind: "mine", v2: null })).not.toContain("Идти сюда");
  });
  it("у проходимой постройки — есть", () => {
    expect(html(null)).toContain("Идти сюда");
  });
});
