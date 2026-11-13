// Строка «Демо-остров»: с правом — вход (ru/en), на острове — «уйти»; без права —
// пусто. После перехода — карта на клетке героя (requestCenter).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({
  data: { allowed: true, onDemo: false } as { allowed: boolean; onDemo: boolean } | undefined,
  enter: 0,
  leave: 0,
  centered: [] as Array<{ q: number; r: number }>,
  run: null as null | (() => Promise<void>),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: st.data }),
  useMutation: (o: { mutationFn: () => Promise<unknown>; onSuccess: (v: unknown) => void }) => {
    st.run = async () => o.onSuccess(await o.mutationFn());
    return { isPending: false, mutate: () => void st.run?.() };
  },
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
vi.mock("@/components/beta-raid/island/useIsland", () => ({ useIslandRefresh: () => () => {} }));
vi.mock("@/components/beta-raid/centerMapBus", () => ({
  requestCenter: (c: { q: number; r: number }) => void st.centered.push({ q: c.q, r: c.r }),
}));
vi.mock("@/server/api/beta-raid/island/demo-island-api", () => ({
  getDemoIslandAccess: async () => st.data,
  demoIslandEnter: async () => (st.enter++, { map: "isle_demo", at: { q: 5, r: 6 } }),
  demoIslandLeave: async () => (st.leave++, { moved: { map: "isle_barna", at: { q: 20, r: 32 } } }),
}));

const { DemoIslandRow } = await import("./DemoIslandRow");

beforeEach(() =>
  Object.assign(st, { data: { allowed: true, onDemo: false }, enter: 0, leave: 0, centered: [], run: null }),
);

describe("строка демо-острова", () => {
  it("с правом — «Демо-остров» на ru и en, нажатие ведёт на остров и к герою", async () => {
    expect(renderToStaticMarkup(<DemoIslandRow ru />)).toContain("Демо-остров");
    expect(renderToStaticMarkup(<DemoIslandRow ru={false} />)).toContain("Demo island");
    await st.run?.();
    expect(st.enter).toBe(1);
    expect(st.centered).toEqual([{ q: 5, r: 6 }]);
  });

  it("на демо-острове — «Уйти с демо-острова», нажатие возвращает назад", async () => {
    st.data = { allowed: true, onDemo: true };
    expect(renderToStaticMarkup(<DemoIslandRow ru />)).toContain("Уйти с демо-острова");
    expect(renderToStaticMarkup(<DemoIslandRow ru={false} />)).toContain("Leave demo island");
    await st.run?.();
    expect(st.leave).toBe(1);
    expect(st.centered).toEqual([{ q: 20, r: 32 }]);
  });

  it("без права — ничего", () => {
    st.data = { allowed: false, onDemo: false };
    expect(renderToStaticMarkup(<DemoIslandRow ru />)).toBe("");
    st.data = undefined;
    expect(renderToStaticMarkup(<DemoIslandRow ru />)).toBe("");
  });
});
