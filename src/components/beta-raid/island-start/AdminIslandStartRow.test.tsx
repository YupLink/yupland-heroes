// Строка «Старт героя»: на клетке старта — «здесь», на другой — где старт и
// «поставить» (нажатие пишет эту клетку); без права — пусто.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({
  data: { canSet: true, start: { q: 20, r: 32 } } as {
    canSet: boolean;
    start: { q: number; r: number } | null;
  },
  lang: "ru",
  sent: [] as unknown[],
  mutationFn: null as null | (() => unknown),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: st.data }),
  useMutation: (o: { mutationFn: () => unknown }) => {
    st.mutationFn = o.mutationFn;
    return { isPending: false, mutate: () => o.mutationFn() };
  },
  useQueryClient: () => ({ setQueryData: () => {} }),
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => st.lang }));
vi.mock("@/server/api/beta-raid/island/island-start", () => ({
  getIslandStart: async () => st.data,
  setIslandStart: async (a: unknown) => {
    st.sent.push(a);
    return { start: { q: 1, r: 2 } };
  },
}));

const { AdminIslandStartRow } = await import("./AdminIslandStartRow");

beforeEach(() => {
  Object.assign(st, {
    data: { canSet: true, start: { q: 20, r: 32 } },
    lang: "ru",
    sent: [],
    mutationFn: null,
  });
});

describe("строка «Старт героя»", () => {
  it("на клетке старта — «здесь»", () => {
    const html = renderToStaticMarkup(<AdminIslandStartRow q={20} r={32} />);
    expect(html).toContain("Старт героя");
    expect(html).toContain("здесь");
    expect(html).not.toContain("поставить");
  });

  it("на другой клетке — где старт и «поставить», нажатие пишет эту клетку", async () => {
    const html = renderToStaticMarkup(<AdminIslandStartRow q={18} r={30} />);
    expect(html).toContain("20 · 32");
    expect(html).toContain("поставить");
    await st.mutationFn?.();
    expect(st.sent).toEqual([{ data: { q: 18, r: 30 } }]);
  });

  it("по-английски", () => {
    st.lang = "en";
    expect(renderToStaticMarkup(<AdminIslandStartRow q={18} r={30} />)).toContain("Hero start");
  });

  it("без права или не на острове — ничего", () => {
    st.data = { canSet: false, start: null };
    expect(renderToStaticMarkup(<AdminIslandStartRow q={18} r={30} />)).toBe("");
  });
});
