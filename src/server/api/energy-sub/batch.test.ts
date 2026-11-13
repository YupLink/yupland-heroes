// Пачки корзин подписки: сумма берётся из корзины в том же запросе, шаги идут
// по порядку и не повторяются, шаг с неизвестным исходом не переотправляется.
// Разбор вставшего шага — batch-resolve.test.ts. Сеть, база и Ref подменены.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ev: string[] = [];
const st = {
  batch: null as null | { id: string; bucket: string; amount: number; steps: unknown[] },
  received: 1_000_000.123456789,
  openId: null as string | null,
  bal: { sub_usd_map: 0, sub_usd: 0, sub_burn: 0, sub_dev: 0, sub_stars: 0, auc_darai: 0, auc_usd: 0 },
  swapFails: false,
  dist: {
    rules: {
      sub_usd: { mode: "auto" as "auto" | "manual", threshold: 100 },
      sub_darai: { mode: "auto" as "auto" | "manual", threshold: 1_000_000_000 },
      darai_free: { mode: "manual" as "auto" | "manual", threshold: 100_000_000 },
      auc_darai: { mode: "auto" as "auto" | "manual", threshold: 1_000_000_000 },
      auc_usd: { mode: "auto" as "auto" | "manual", threshold: 100 },
    },
    devWallets: [
      { wallet: "owner.tg", share: 0.5 },
      { wallet: "partner.tg", share: 0.5 },
    ],
  },
  active: 0,
  maxActive: 0,
};

vi.mock("../../db/mcpClient", () => ({
  mcpExec: vi.fn(async (sql: string) => {
    const flat = sql.replace(/\s+/g, " ").trim();
    const step = /steps \|\| '(.+)'::jsonb/.exec(flat);
    if (step) {
      const s = JSON.parse(step[1].replace(/''/g, "'"))[0];
      ev.push(`step:${s.name}:${s.state}${s.received ? `:${s.received}` : ""}${s.tx ? `:${s.hash}/${s.nonce}/${s.tx}` : ""}`);
      return flat.includes("RETURNING id") ? [{ id: "x" }] : null;
    }
    if (flat.startsWith("WITH b AS ( UPDATE yuplink.money_batch SET status = 'closed'")) {
      // как в базе: откатывается только пачка без шагов
      const untouched = (st.batch?.steps ?? []).length === 0;
      if (untouched) ev.push("revert");
      return [{ _row: { n: untouched ? 1 : 0 } }];
    }
    const status = /SET status = '(\w+)'/.exec(flat);
    if (status) {
      ev.push(`status:${status[1]}`);
      return null;
    }
    if (flat.startsWith("SELECT id, bucket, amount, steps")) return st.batch ? [st.batch] : [];
    const pool = /'sub_burn', 'Darai', ([\d.]+), 'income', '([^']+)'/.exec(flat);
    if (pool) {
      ev.push(`burnpool:${Number(pool[1])}:${pool[2]}`);
      return null;
    }
    if (flat.startsWith("WITH bal AS")) {
      ev.push(`open:${/WHERE bucket = '(\w+)'/.exec(flat)?.[1]}`);
      return [{ _row: { id: st.openId } }];
    }
    return null;
  }),
}));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${String(v).replace(/'/g, "''")}'` }));
vi.mock("./buckets", () => ({ bucketBalances: async () => st.bal }));
vi.mock("../autodist/rules", () => ({
  loadDist: async () => {
    st.active++;
    st.maxActive = Math.max(st.maxActive, st.active);
    await new Promise((r) => setTimeout(r, 5));
    st.active--;
    return st.dist;
  },
}));
vi.mock("../ref-swap-core", async (orig) => ({
  ...(await orig<typeof import("../ref-swap-core")>()),
  swapUsdtToDaraiCore: async (
    usdt: number,
    beforeSign?: (hash: string, m: { nonce: string; signedTx: string }) => Promise<void>,
  ) => {
    if (st.swapFails) throw new Error("Ref недоступен");
    await beforeSign?.("HASH_S", { nonce: "7", signedTx: "TX_S" });
    ev.push(`swap:${usdt}`);
    return { hash: "HASH_S", received: st.received };
  },
}));
vi.mock("../darai-pools-move", () => ({
  insertPoolMove: async (o: { amount: number; ref: string }) => {
    ev.push(`pool:${o.amount}:${o.ref}`);
    return { inserted: true };
  },
}));
vi.mock("../../near", () => ({
  getOperatingBalanceRaw: async () => "1" + "0".repeat(40),
  humanToRaw: () => 1n,
  invalidateBalanceCache: () => {},
  BATCH_CHUNK_PAIRS: 10,
  ftTransferBatched: async (o: {
    ftContract: string;
    items: Array<{ receiverId: string; amountHuman: number }>;
    onSigned?: (hash: string, m: { nonce: string; signedTx: string }) => Promise<void>;
  }) => {
    await o.onSigned?.("HASH_T", { nonce: "8", signedTx: "TX_T" });
    ev.push(`batch:${o.ftContract}:${o.items.map((i) => `${i.receiverId}=${i.amountHuman}`).join(",")}`);
    return { txHashes: ["HASH_D"], paid: [], failed: [] };
  },
}));
vi.mock("../../tg", () => ({ sendTgMessageToAdmins: async () => {} }));

const { openBatchSql, runBatch, runDueBatches } = await import("./batch");
const { devItems } = await import("./batch-steps");

beforeEach(() => {
  ev.length = 0;
  process.env.NEAR_SIGNER_ACCOUNT_ID = "darai_gdrop.near";
  st.batch = null;
  st.openId = null;
  st.received = 1_000_000.123456789;
  st.bal = { sub_usd_map: 0, sub_usd: 0, sub_burn: 0, sub_dev: 0, sub_stars: 0, auc_darai: 0, auc_usd: 0 };
  st.swapFails = false;
  st.dist.rules.sub_usd.mode = "auto";
  st.dist.rules.sub_darai.mode = "auto";
});

describe("открытие пачки", () => {
  it("сумма — из корзины в самом запросе, с потолком обмена и округлением вниз", () => {
    const usd = openBatchSql("usd", "mb_1", "auto").replace(/\s+/g, " ");
    expect(usd).toContain("sum(amount), 0) AS v FROM yuplink.money_bucket_move WHERE bucket = 'sub_usd'");
    // обмен из корзины $ — 20 из 70: потолок 500 USDT обмена = 1750 в корзине
    expect(usd).toContain("trunc(LEAST(bal.v, 1750.00000000), 6)");
    expect(usd).toContain(">= 3.50000000");
    expect(usd).toContain("bucket IN ('sub_usd', 'sub_usd_map', 'bank_usd') AND status = 'running'");
    const map = openBatchSql("usd_map", "mb_m", "auto").replace(/\s+/g, " ");
    expect(map).toContain("WHERE bucket = 'sub_usd_map'");
    expect(map).toContain("trunc(LEAST(bal.v, 500.00000000), 6)");
    const burn = openBatchSql("burn", "mb_2", "auto").replace(/\s+/g, " ");
    expect(burn).toContain("trunc(bal.v, 8)");
    expect(burn).toContain("ON CONFLICT DO NOTHING");
    expect(burn).toContain("-b.amount, 'batch', 'batch:' || b.id");
  });
});

describe("доли разработчиков", () => {
  it("сумма долей ровно равна переводу", () => {
    const items = devItems(
      [
        { wallet: "a", share: 0.5 },
        { wallet: "b", share: 0.5 },
      ],
      33.333333,
    );
    expect(items[0].amountHuman).toBe(16.666666);
    expect(items[1].amountHuman).toBe(16.666667);
  });

  it("кошелёк не задан (пустой env команды) — перевод не собирается", () => {
    const wallets = [
      { wallet: "a", share: 0.5 },
      { wallet: "", share: 0.5 },
    ];
    expect(() => devItems(wallets, 10)).toThrow(/не задан/);
    expect(() => devItems([], 10)).toThrow(/не задан/);
  });
});

describe("пачка $", () => {
  it("«$ → карта»: весь обмен — в пул карты, ни дупла, ни разработчиков", async () => {
    st.batch = { id: "mb_m", bucket: "sub_usd_map", amount: 13.5, steps: [] };
    await runBatch("mb_m");
    expect(ev).toEqual([
      "step:swap:sending:HASH_S/7/TX_S",
      "swap:13.5",
      `step:swap:done:${st.received}`,
      `pool:${st.received}:batch:mb_m:map`,
      "step:map:done",
      "status:done",
    ]);
  });

  it("корзина $: обмен 20 из 70 — в пул сжигания (без перевода), 50 из 70 — разработчикам в USDT", async () => {
    st.batch = { id: "mb_1", bucket: "sub_usd", amount: 70, steps: [] };
    await runBatch("mb_1");
    // «sending» каждого шага — уже с хэшем, nonce и подписанными байтами.
    expect(ev).toEqual([
      "step:swap:sending:HASH_S/7/TX_S",
      "swap:20",
      `step:swap:done:${st.received}`,
      "burnpool:1000000.12345678:batch:mb_1:burnpool",
      "step:burnpool:done",
      "step:dev:sending:HASH_T/8/TX_T",
      "batch:usdt.tether-token.near:owner.tg=25,partner.tg=25",
      "step:dev:done",
      "status:done",
    ]);
  });

  it("сбой до первого шага (Ref недоступен) — пачка сама вернулась в корзину", async () => {
    st.swapFails = true;
    st.batch = { id: "mb_r", bucket: "sub_usd_map", amount: 13.5, steps: [] };
    await expect(runBatch("mb_r")).rejects.toThrow("Ref недоступен");
    expect(ev).toEqual(["revert"]);
  });

  it("обмен с неизвестным исходом не повторяется — пачка встаёт", async () => {
    st.batch = { id: "mb_3", bucket: "sub_usd", amount: 100, steps: [{ name: "swap", state: "sending", amount: 50 }] };
    await expect(runBatch("mb_3")).rejects.toThrow(/по хэшу/);
    expect(ev.some((e) => e.startsWith("swap:"))).toBe(false);
    expect(ev).toContain("status:failed");
  });

  it("обмен «sending» с подписанными байтами — не повторяется, разберёт сверка с сетью", async () => {
    st.batch = {
      id: "mb_6",
      bucket: "sub_usd",
      amount: 100,
      steps: [{ name: "swap", state: "sending", amount: 50, hash: "H", nonce: "1", tx: "T" }],
    };
    await expect(runBatch("mb_6")).rejects.toThrow(/сверю с сетью сам/);
    expect(ev.some((e) => e.startsWith("swap:"))).toBe(false);
  });

  it("сделанные шаги при продолжении пропускаются", async () => {
    st.batch = {
      id: "mb_4",
      bucket: "sub_usd",
      amount: 70,
      steps: [
        { name: "swap", state: "done", received: 1000, amount: 20 },
        { name: "burn", state: "done", amount: 1000, hash: "H" },
      ],
    };
    await runBatch("mb_4");
    expect(ev).toEqual([
      "step:dev:sending:HASH_T/8/TX_T",
      "batch:usdt.tether-token.near:owner.tg=25,partner.tg=25",
      "step:dev:done",
      "status:done",
    ]);
  });

  it("перевод «отправляется» без ответа — не повторяется; «retry» — уходит заново", async () => {
    st.batch = { id: "mb_5", bucket: "sub_burn", amount: 10, steps: [{ name: "burn", state: "sending", amount: 10 }] };
    await expect(runBatch("mb_5")).rejects.toThrow(/исход перевода неизвестен/);
    expect(ev.some((e) => e.startsWith("batch:"))).toBe(false);
    ev.length = 0;
    st.batch.steps.push({ name: "burn", state: "retry", amount: 10 });
    await runBatch("mb_5");
    expect(ev).toContain("batch:darai.tkn.near:darai_duplo.near=10");
  });
});

describe("что пора разослать", () => {
  it("авто: $ по порогу, DARAI — когда оплат набралось на порог", async () => {
    // Оплат DARAI набралось на 999 999 997,5 из 1 млрд — ещё рано.
    // корзина $ — 70 % оплат: 69 USDT = 98,6 оплат, ещё рано; 70 = 100 оплат.
    st.bal = { ...st.bal, sub_usd: 69, sub_burn: 150_000_000, sub_dev: 249_999_999 };
    await runDueBatches("auto");
    expect(ev).toEqual([]);
    st.bal = { ...st.bal, sub_usd: 70 };
    await runDueBatches("auto");
    expect(ev).toEqual(["open:sub_usd"]);
    ev.length = 0;
    st.bal = { ...st.bal, sub_usd: 0, sub_burn: 150_000_000, sub_dev: 250_000_001 };
    await runDueBatches("auto");
    // Разработчикам — по оплатам; пул сжигания (150 млн) ещё не набрал 250 млн.
    expect(ev).toEqual(["open:sub_dev"]);
  });

  it("пул сжигания уходит сам одной пачкой от 250 млн, независимо от разработчиков", async () => {
    st.bal = { ...st.bal, sub_burn: 249_999_999.99, sub_dev: 0 };
    await runDueBatches("auto");
    expect(ev).toEqual([]);
    st.bal = { ...st.bal, sub_burn: 250_000_000 };
    await runDueBatches("auto");
    expect(ev).toEqual(["open:sub_burn"]);
  });

  it("пачка $, начатая до пула (перевод в дупло уже был), — в пул второй раз не кладётся", async () => {
    st.batch = {
      id: "mb_old",
      bucket: "sub_usd",
      amount: 70,
      steps: [
        { name: "swap", state: "done", received: 1000, amount: 20 },
        { name: "burn", state: "sending", amount: 1000, hash: "H", nonce: "1", tx: "T" },
      ],
    };
    await expect(runBatch("mb_old")).rejects.toThrow(/исход перевода неизвестен/);
    expect(ev.some((e) => e.startsWith("burnpool:"))).toBe(false);
  });

  it("режим «вручную» — сам ничего не шлёт, кнопка шлёт только свою корзину", async () => {
    st.dist.rules.sub_usd.mode = "manual";
    st.dist.rules.sub_darai.mode = "manual";
    st.bal = { ...st.bal, sub_usd: 500, sub_burn: 1e9, sub_dev: 1e9 };
    await runDueBatches("auto");
    expect(ev).toEqual([]);
    await runDueBatches({ force: "burn" }, "owner");
    expect(ev).toEqual(["open:sub_burn"]);
  });

  it("«$ → карта» — сразу, без порога и режима; меньше 1 USDT — ждёт", async () => {
    st.dist.rules.sub_usd.mode = "manual";
    st.bal = { ...st.bal, sub_usd_map: 0.9 };
    await runDueBatches("auto");
    expect(ev).toEqual([]);
    st.bal = { ...st.bal, sub_usd_map: 2.1 };
    await runDueBatches("auto");
    expect(ev).toEqual(["open:sub_usd_map"]);
  });

  it("аукционы админа — своим порогом по самой корзине, вручную — только кнопкой", async () => {
    st.bal = { ...st.bal, auc_usd: 99.99, auc_darai: 999_999_999 };
    await runDueBatches("auto");
    expect(ev).toEqual([]);
    st.bal = { ...st.bal, auc_usd: 100, auc_darai: 1_000_000_000 };
    await runDueBatches("auto");
    expect(ev).toEqual(["open:auc_darai", "open:auc_usd"]);
    ev.length = 0;
    st.dist.rules.auc_usd.mode = "manual";
    await runDueBatches("auto");
    expect(ev).toEqual(["open:auc_darai"]);
    ev.length = 0;
    await runDueBatches({ force: "auc_usd" }, "owner");
    expect(ev).toEqual(["open:auc_usd"]);
    st.dist.rules.auc_usd.mode = "auto";
  });

  it("пачка аукционов USDT — целиком разработчикам в USDT, без обмена и дупла", async () => {
    st.batch = { id: "mb_a", bucket: "auc_usd", amount: 120, steps: [] };
    await runBatch("mb_a");
    expect(ev.some((e) => e.startsWith("swap:"))).toBe(false);
    expect(ev.find((e) => e.startsWith("batch:"))).toBe("batch:usdt.tether-token.near:owner.tg=60,partner.tg=60");
    expect(ev).toContain("status:done");
  });

  it("два прогона разом идут по очереди", async () => {
    st.maxActive = 0;
    await Promise.all([runDueBatches("auto"), runDueBatches("auto"), runDueBatches("auto")]);
    expect(st.maxActive).toBe(1);
  });
});
