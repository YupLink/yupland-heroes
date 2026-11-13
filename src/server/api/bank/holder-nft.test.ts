// Гейты ввода NFT холдеров (открыт игрокам 20.10.2026): без кошелька — отказ; игрок
// видит и вводит свои NFT; чужой перевод, не холдерская NFT и NFT с чужим вкладом —
// отказ без нового вклада; повтор — тот же вклад; NFT ещё не на складе — «в пути».
// Обход склада: игроку — переводы с открытия ввода, админу — любые.
// Цепь, Sendler, база и вход подменены памятью.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Tok = { owner: string; title: string };
type Cand = { contract: string; tokenId: string; txHash: string; wallet: string; title: string; atMs: number | null };

const st = vi.hoisted(() => ({
  wallet: "p.near" as string | null,
  admins: new Set<string>(),
  acc: "acc_P" as string | null,
  chain: {} as Record<string, Tok>,
  owned: [] as Array<{ token_id: string; title: string; media: string | null }>,
  staked: [] as Array<{ nft_token: string }>,
  stakeOwner: "acc_P",
  applied: true,
  proof: {
    confirmed: new Set<string>(),
    pending: [] as string[],
    rejected: new Map<string, string>(),
  },
  proofArgs: [] as Array<Record<string, unknown>>,
  scan: [] as Cand[],
  rpc: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    type Fn = (ctx: { data: unknown }) => unknown;
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => (a?: { data?: unknown }) =>
      fn({ data: v ? v(a?.data) : a?.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("../../auth", () => ({
  requireWallet: () => {
    if (!st.wallet) throw new Error("Кошелёк не подключён");
    return st.wallet;
  },
  requireAdmin: () => {
    throw new Error("Доступ запрещён: требуется admin-кошелёк");
  },
  isAdminWalletLinked: async (w: string) => st.admins.has(w),
  isAdminWallet: (w: string) => st.admins.has(w),
}));
// Построен ли банк — для подсказки в окне ввода (getHolderInputInfo).
vi.mock("./bank-access", () => ({ bankBuiltFor: async () => true }));
vi.mock("../../rateGate", () => ({ moneyGate: async () => {} }));
vi.mock("../chips-mint-helpers", () => ({
  STORE_NFT_CONTRACT: "shop.near",
  CHIP_MINT_RECIPIENT: "store.near",
}));
vi.mock("../currency/move", () => ({ accAccountId: async () => st.acc }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) =>
    /SELECT nft_token/.test(sql) ? st.staked : /SELECT account_id/.test(sql) ? [{ account_id: st.stakeOwner }] : [],
}));
vi.mock("../../db/pg", () => ({
  sb: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      st.rpc.push({ name, args });
      return { error: null, data: [{ stake_id: "stk_1", applied: st.applied }] };
    },
  },
}));
vi.mock("../../rpc", () => ({
  nearRpc: async (_m: string, p: { args_base64: string }) => {
    const { token_id } = JSON.parse(Buffer.from(p.args_base64, "base64").toString()) as { token_id: string };
    const t = st.chain[token_id];
    const json = t ? { owner_id: t.owner, metadata: { title: t.title } } : null;
    return { result: { result: [...Buffer.from(JSON.stringify(json))] } };
  },
}));
vi.mock("../../sendler", () => ({ fetchSendlerNftsByOwner: async () => st.owned }));
vi.mock("../nft-input-proof", () => ({
  proveNftTransfer: async (a: Record<string, unknown>) => {
    st.proofArgs.push(a);
    return st.proof;
  },
}));
vi.mock("../nft-input-scan", () => ({ scanStoreIncoming: async () => st.scan }));

const { listHolderNfts, getHolderInputInfo, stakeHolderNfts, catchUpHolderNfts, HOLDER_INPUT_OPEN_MS } =
  await import("./holder-nft");

const HOLDER = "Yupik holder (10 million darai)";
const tx = "tx-hash-aaaaaaaaaaaaaaaaaaaa";
const stake = (tokenIds: string[]) => stakeHolderNfts({ data: { tokenIds, txHash: tx } });
const cand = (tokenId: string, wallet: string, atMs: number | null): Cand => ({
  contract: "shop.near",
  tokenId,
  txHash: tx,
  wallet,
  title: HOLDER,
  atMs,
});

beforeEach(() => {
  st.wallet = "p.near";
  st.admins = new Set();
  st.acc = "acc_P";
  st.chain = { "1": { owner: "store.near", title: HOLDER } };
  st.owned = [];
  st.staked = [];
  st.stakeOwner = "acc_P";
  st.applied = true;
  st.proof = { confirmed: new Set(["1"]), pending: [], rejected: new Map() };
  st.proofArgs = [];
  st.scan = [];
  st.rpc = [];
});

describe("ввод NFT холдеров: гейты", () => {
  it("без кошелька — отказ во всех ручках, вклад не заводится", async () => {
    st.wallet = null;
    await expect(listHolderNfts()).rejects.toThrow("Кошелёк не подключён");
    await expect(getHolderInputInfo()).rejects.toThrow("Кошелёк не подключён");
    await expect(stake(["1"])).rejects.toThrow("Кошелёк не подключён");
    expect(st.rpc).toHaveLength(0);
  });

  it("игрок (не админ) видит свои NFT холдеров, без чужих названий и уже введённых", async () => {
    st.owned = [
      { token_id: "1", title: HOLDER, media: null },
      { token_id: "2", title: "Yupik holder (500 million darai)", media: null },
      { token_id: "3", title: "Golden chip", media: null },
    ];
    st.staked = [{ nft_token: "2" }];
    const items = await listHolderNfts();
    expect(items.map((i) => i.tokenId)).toEqual(["1"]);
    expect(items[0]).toMatchObject({ darai: 10e6, unlockDays: 30 });
    await expect(getHolderInputInfo()).resolves.toEqual({ receiverId: "store.near", contract: "shop.near", bankBuilt: true });
  });

  it("игрок вводит NFT: перевод проверяется от его кошелька на склад, вклад — на его аккаунт", async () => {
    await expect(stake(["1"])).resolves.toEqual({ staked: ["1"], pending: [], rejected: [] });
    expect(st.proofArgs[0]).toMatchObject({ wallet: "p.near", receiverId: "store.near", contract: "shop.near" });
    expect(st.rpc).toHaveLength(1);
    expect(st.rpc[0]).toMatchObject({
      name: "bank_stake_holder",
      args: { p_account: "acc_P", p_token: "1", p_amount: 10e6, p_unlock_days: 30, p_op: "hold:shop.near:1" },
    });
  });

  it("чужой перевод (прислал не ты) — отказ Sendler, вклад не заводится", async () => {
    st.proof = { confirmed: new Set(), pending: [], rejected: new Map([["1", "прислал не ты (x.near)"]]) };
    const r = await stake(["1"]);
    expect(r.staked).toEqual([]);
    expect(r.rejected).toEqual([{ tokenId: "1", reason: "прислал не ты (x.near)" }]);
    expect(st.rpc).toHaveLength(0);
  });

  it("не NFT холдера — отказ, вклад не заводится", async () => {
    st.chain["1"] = { owner: "store.near", title: "Golden chip" };
    const r = await stake(["1"]);
    expect(r.rejected).toEqual([{ tokenId: "1", reason: "это не NFT холдера" }]);
    expect(st.rpc).toHaveLength(0);
  });

  it("повтор своей NFT — тот же вклад, «в стейкинге»", async () => {
    st.applied = false;
    await expect(stake(["1"])).resolves.toMatchObject({ staked: ["1"], rejected: [] });
  });

  it("NFT, по которой вклад уже у другого аккаунта, — отказ", async () => {
    st.applied = false;
    st.stakeOwner = "acc_OTHER";
    const r = await stake(["1"]);
    expect(r.staked).toEqual([]);
    expect(r.rejected).toEqual([{ tokenId: "1", reason: "по этой NFT вклад уже заведён" }]);
  });

  it("цепь ещё не показала NFT на складе — «в пути», не отказ", async () => {
    st.chain["1"] = { owner: "p.near", title: HOLDER };
    await expect(stake(["1"])).resolves.toEqual({ staked: [], pending: ["1"], rejected: [] });
    expect(st.rpc).toHaveLength(0);
  });

  it("нет счёта аккаунта — отказ", async () => {
    st.acc = null;
    const r = await stake(["1"]);
    expect(r.rejected).toEqual([{ tokenId: "1", reason: "не найден счёт аккаунта" }]);
    expect(st.rpc).toHaveLength(0);
  });
});

describe("обход склада catchUpHolderNfts", () => {
  it("игроку — переводы с открытия ввода; старый перевод игрока — нет; админу — любой", async () => {
    st.chain = {
      "1": { owner: "store.near", title: HOLDER },
      "2": { owner: "store.near", title: HOLDER },
      "3": { owner: "store.near", title: HOLDER },
    };
    st.admins = new Set(["admin.near"]);
    st.scan = [
      cand("1", "p.near", HOLDER_INPUT_OPEN_MS + 60_000),
      cand("2", "old.near", HOLDER_INPUT_OPEN_MS - 60_000),
      cand("3", "admin.near", HOLDER_INPUT_OPEN_MS - 60_000),
    ];
    await expect(catchUpHolderNfts()).resolves.toBe(2);
    expect(st.rpc.map((r) => r.args.p_token)).toEqual(["1", "3"]);
  });

  it("уже введённую NFT обход не трогает", async () => {
    st.scan = [cand("1", "p.near", HOLDER_INPUT_OPEN_MS + 60_000)];
    st.staked = [{ nft_token: "1" }];
    await expect(catchUpHolderNfts()).resolves.toBe(0);
    expect(st.rpc).toHaveLength(0);
  });
});
