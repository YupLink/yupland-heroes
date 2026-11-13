// Окно чертежа «Разместить · ⚡N»: ключ нажатия живёт до успеха — повтор после
// обрыва связи несёт тот же ключ (сервер узнает вставшую шахту, дошлёт её карте
// и второй раз энергию не возьмёт), после успеха — новый. Успех стирает чертёж
// у себя сразу, «Убрать чертёж» — тоже.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Opts = {
  mutationFn: () => Promise<unknown>;
  onSuccess: (res?: { q: number; r: number }) => void;
};
const v = vi.hoisted(() => ({
  opts: [] as Opts[],
  ops: [] as string[],
  dropped: 0,
  data: new Map<string, unknown>(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: () => Promise.resolve(),
    setQueryData: (k: readonly string[], d: unknown) => v.data.set(k.join(), d),
  }),
  useMutation: (o: Opts) => {
    v.opts.push(o);
    return { isPending: false, mutate: () => {} };
  },
}));
vi.mock("@/server/api/beta-raid/mine-place/mine-place", () => ({
  placeMineBlueprint: async ({ data }: { data: { op: string } }) => {
    v.ops.push(data.op);
    return { ok: true, q: 1, r: 2, kind: "wood" };
  },
}));
vi.mock("@/server/api/beta-raid/mine-place/mine-plan", () => ({
  removeMinePlan: async () => {
    v.dropped++;
    return { ok: true };
  },
}));
vi.mock("@/components/beta-raid/mine-place/minePlaceLive", () => ({
  refreshAfterMinePlace: () => {},
}));
vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));

const { MinePlanSheet } = await import("./MinePlanSheet");
const store = await import("./mineBuildStore");
const plan = { mapId: "m1", q: 1, r: 2, kind: "wood" as const, stackKey: "custom:k", energy: 10 };

beforeEach(() => {
  v.opts.length = 0;
  v.ops.length = 0;
  v.data.clear();
  store.setMinePlan(plan);
  renderToStaticMarkup(<MinePlanSheet plan={plan} energy={50} onClose={() => {}} />);
});

describe("окно чертежа", () => {
  it("ключ нажатия: тот же до успеха, новый после", async () => {
    const [place] = v.opts;
    await place.mutationFn();
    await place.mutationFn();
    expect(v.ops[0]).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
    expect(v.ops[1]).toBe(v.ops[0]);
    place.onSuccess({ q: 1, r: 2 });
    await place.mutationFn();
    expect(v.ops[2]).not.toBe(v.ops[0]);
  });

  it("шахта встала — чертежа нет ни в кадре, ни в кэше", () => {
    v.opts[0].onSuccess({ q: 1, r: 2 });
    expect(store.getMinePlan()).toBeNull();
    expect(v.data.get("beta-raid-mine-plan,m1")).toBeNull();
  });

  it("«Убрать чертёж» — сервер и сразу у себя", async () => {
    const drop = v.opts[1];
    await drop.mutationFn();
    drop.onSuccess();
    expect(v.dropped).toBe(1);
    expect(store.getMinePlan()).toBeNull();
  });
});
