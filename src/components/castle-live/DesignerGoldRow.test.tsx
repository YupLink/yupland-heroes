// Строка «Получить 1 000 золота»: есть доступ — строка на двух языках, нет — пусто;
// нажатие зовёт ручку начисления.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => ({ allowed: true, taken: 0, mutationFn: null as null | (() => unknown) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { allowed: st.allowed } }),
  useMutation: (o: { mutationFn: () => unknown }) => {
    st.mutationFn = o.mutationFn;
    return { isPending: false, mutate: () => o.mutationFn() };
  },
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
}));
vi.mock("@/server/api/designer-gold", () => ({
  DESIGNER_GOLD_STEP: 1000,
  getDesignerGoldAccess: async () => ({ allowed: st.allowed }),
  takeDesignerGold: async () => {
    st.taken += 1;
    return { gold: 1000 };
  },
}));

const { DesignerGoldRow } = await import("./DesignerGoldRow");

beforeEach(() => Object.assign(st, { allowed: true, taken: 0, mutationFn: null }));

describe("строка золота Ангелины", () => {
  it("с доступом — кнопка на ru и en, нажатие начисляет", async () => {
    expect(renderToStaticMarkup(<DesignerGoldRow ru />)).toContain("Получить 1");
    expect(renderToStaticMarkup(<DesignerGoldRow ru={false} />)).toContain("Get 1,000 gold");
    await st.mutationFn?.();
    expect(st.taken).toBe(1);
  });
  it("без доступа — ничего", () => {
    st.allowed = false;
    expect(renderToStaticMarkup(<DesignerGoldRow ru />)).toBe("");
  });
});
