const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
// In the release snapshot SQL is beside this test; in the staging patch it is in ../base.
const base = fs.existsSync(path.join(root, "src/server/api/beta-raid/mine-lost/mine-lost-sql.ts"))
  ? root : path.resolve(root, "../base");
const ts = require("typescript");
const zod = require("zod");

function load(file, mocks, sourceRoot = root) {
  const source = fs.readFileSync(path.join(sourceRoot, file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const module = { exports: {} };
  const req = (id) => {
    if (id in mocks) return mocks[id];
    throw new Error("Unexpected dependency: " + id);
  };
  vm.runInNewContext("(function(require,module,exports){" + js + "\n})", {
    console,
  })(req, module, module.exports);
  return module.exports;
}

function harness() {
  const state = {
    wallet: "me.near", account: "acc_me", sql: [], bumps: [], balance: {},
    failId: null,
    rows: [
      { id: "mcl_1", account: "acc_me", amount: 40, resource: "wood", token: null, claimed: false },
      { id: "mcl_2", account: "acc_me", amount: 30000, resource: "token", token: "Darai", claimed: false },
      { id: "mcl_x", account: "acc_other", amount: 9, resource: "gold", token: null, claimed: false },
    ],
  };
  const sql = load("src/server/api/beta-raid/mine-lost/mine-lost-sql.ts", {
    "@/server/api/raid-shared": { sqlStr: (v) => "'" + String(v).replaceAll("'", "''") + "'" },
    "@/lib/mineLost": { lostKindOf: () => "mine", lostMushroomOf: () => null },
  }, base);
  const mocks = {
    "@tanstack/react-start": { createServerFn: () => {
      let validate;
      const fn = {
        inputValidator(f) { validate = f; return fn; },
        handler(h) { return async ({ data }) => h({ data: validate(data) }); },
      };
      return fn;
    } },
    zod,
    "@/server/api/beta-raid/gate": { requireBetaRaid: async () => {
      if (!state.wallet) throw new Error("session required");
      return state.wallet;
    } },
    "@/server/api/currency/move": { accAccountId: async () => state.account },
    "@/server/api/achievements/bump": {
      bumpAchievement: (account, track, points) => state.bumps.push([account, track, points]),
    },
    "@/lib/achievements/minelord": { minelordCredit: ({ token }, amount) =>
      token?.toLowerCase() === "darai" ? Math.floor(amount / 1000) : amount },
    "@/server/api/beta-raid/mine-lost/mine-lost-sql": sql,
    "@/server/db/mcpClient": { mcpExec: async (statement) => {
      state.sql.push(statement);
      if (statement.includes("FROM yuplink.raid_mine_capture_log l")) {
        return state.rows.filter((r) => r.account === "acc_me" && !r.claimed)
          .map((r) => ({ id: r.id }));
      }
      const match = /raid_mine_lost_claim\('([^']+)', '([^']+)', '([^']+)'\)/.exec(statement);
      if (!match) throw new Error("unexpected SQL");
      const [, id, account] = match;
      if (id === state.failId) throw new Error("database unavailable");
      const row = state.rows.find((r) => r.id === id);
      if (!row || row.account !== account) throw new Error("mine_lost_gone");
      if (row.claimed) return [{ res: { was: true, amount: 0, resource: row.resource, token: row.token } }];
      row.claimed = true;
      const key = row.token ?? row.resource;
      state.balance[key] = (state.balance[key] ?? 0) + row.amount;
      return [{ res: { was: false, amount: row.amount, resource: row.resource, token: row.token } }];
    } },
  };
  const claims = load("src/server/api/beta-raid/mine-lost/mine-lost-claim.ts", mocks);
  return { state, ...claims, claim: (id) => claims.claimLostMine({ data: { id } }) };
}

// Values created in vm have a different realm/prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("selected lost mine uses the existing claim SQL; retry never credits twice", async () => {
  const h = harness();
  assert.deepEqual(plain(await h.claim("mcl_1")), { ok: true, done: true, credited: { wood: 40 } });
  assert.equal(h.state.sql[0], "SELECT yuplink.raid_mine_lost_claim('mcl_1', 'acc_me', 'me.near') AS res");
  assert.deepEqual(h.state.bumps, [["acc_me", "minelord", 40]]);
  assert.deepEqual(plain(await h.claim("mcl_1")), { ok: true, done: true, credited: {} });
  assert.equal(h.state.balance.wood, 40);
  assert.equal(h.state.bumps.length, 1);
});

test("foreign and missing rows have the same empty result", async () => {
  const h = harness();
  assert.deepEqual(plain(await h.claim("mcl_x")), { ok: true, done: false, credited: {} });
  assert.deepEqual(plain(await h.claim("missing")), { ok: true, done: false, credited: {} });
  assert.deepEqual(h.state.balance, {});
  assert.deepEqual(h.state.bumps, []);
});

test("real Zod rejects invalid ids before SQL; session and account are required", async () => {
  const h = harness();
  await assert.rejects(h.claim(123));
  await assert.rejects(h.claim(""));
  await assert.rejects(h.claim("x".repeat(201)));
  assert.equal(h.state.sql.length, 0);
  h.state.wallet = null;
  await assert.rejects(h.claim("mcl_1"), /session required/);
  h.state.wallet = "me.near";
  h.state.account = null;
  await assert.rejects(h.claim("mcl_1"), /Нужен аккаунт/);
  assert.equal(h.state.sql.length, 0);
});

test("database failure propagates without claiming or crediting the row", async () => {
  const h = harness();
  h.state.failId = "mcl_1";
  await assert.rejects(h.claim("mcl_1"), /database unavailable/);
  assert.equal(h.state.rows[0].claimed, false);
  assert.deepEqual(h.state.balance, {});
});

test("existing batch claim remains available and credits its own rows", async () => {
  const h = harness();
  assert.deepEqual(plain(await h.claimLostRows("acc_me", "me.near")), {
    done: ["mcl_1", "mcl_2"], credited: { wood: 40, Darai: 30000 },
  });
  assert.deepEqual(h.state.bumps, [
    ["acc_me", "minelord", 40], ["acc_me", "minelord", 30],
  ]);
  assert.equal(h.state.rows[2].claimed, false);
  assert.deepEqual(plain(await h.claimLostRows("acc_me", "me.near")), { done: [], credited: {} });
});
