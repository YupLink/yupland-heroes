const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module = { exports: {} };
  const req = (id) => {
    if (id in mocks) return mocks[id];
    if (id.endsWith(".webp")) return { default: id };
    if (id === "@/lib/mushroomKinds") return load("src/lib/mushroomKinds.ts");
    if (id === "@/lib/mineWeather") return load("src/lib/mineWeather.ts");
    if (id === "@/lib/minePending") return load("src/lib/minePending.ts");
    if (id === "@/lib/harvestSourceGroups") return load("src/lib/harvestSourceGroups.ts");
    if (id === "@/lib/mineLost") return load("src/lib/mineLost.ts");
    if (id === "@tanstack/react-start") return { createServerFn: () => ({ handler: () => null }) };
    throw new Error("Unexpected dependency: " + id);
  };
  vm.runInNewContext("(function(require,module,exports){"+js+"\n})", {})(req, module, module.exports);
  return module.exports;
}
const noop = {};
const serverMocks = {
  "../../auth": noop, "../raid-shared": { sqlStr: s => "'"+s+"'" },
  "./gate": noop, "../currency/move": noop, "./encounter-where": noop, zod: noop,
};
test("loss rows preserve original cell and identify mushrooms without reading today's cell", async () => {
  let sql;
  const raw = [
    { id: "lost-mushroom", map_id: "world", q: -6, r: 3, resource: "gold", kind: "take", amount: "6", mushroom_image: "/gold-mushroom.webp" },
    { id: "lost-mine", map_id: "world", q: 4, r: -2, resource: "gold", kind: "capture", amount: 9 },
    { id: "expired", map_id: "world", q: 7, r: 8, resource: "diamonds", kind: "expire", amount: 2 },
    { id: "other-floor", map_id: "cave", map_name: "Cave", q: -6, r: 3, resource: "token", token: "DARAI", kind: "take", amount: 10000 },
  ];
  const { lostMineRows } = load("src/server/api/beta-raid/mine-capture-log.ts", {
    ...serverMocks, "../../db/mcpClient": { mcpExec: async s => { sql = s; return raw; } },
  });
  const rows = await lostMineRows("owner", "world", []);
  assert.equal(rows[0].mapId, "world");
  assert.equal(rows[0].q, -6); assert.equal(rows[0].r, 3);
  assert.equal(rows[0].mushroom.kind, "gold");
  assert.equal(rows[0].mushroom.image, "/gold-mushroom.webp");
  assert.equal(rows[0].lost.amount, 6);
  assert.equal(rows[1].mushroom, undefined);
  assert.equal(rows[2].mushroom.kind, "diamonds");
  assert.equal(rows[3].mushroom.kind, "darai");
  assert.equal(rows[3].floor, "Cave");
  assert.doesNotMatch(sql, /JOIN\s+yuplink\.raid_map_cells/i);
});
test("farm read excludes removed hero even when accrued or stored resources remain", async () => {
  const statements = [];
  const { myHarvestFields } = load("src/server/api/beta-raid/harvest-fields.ts", {
    ...serverMocks,
    "../../db/mcpClient": { mcpExec: async sql => {
      statements.push(sql);
      return sql.includes("raid_field_worker w")
        ? [{ q: 1, r: 2, hero_id: null, accrued: 50, cfg: {} },
           { q: 3, r: 4, hero_id: "hero", hero_name: "Hero", accrued: 0, workers: 1, cfg: {} }]
        : [];
    }},
    "@/lib/fieldConfig": { parseFieldConfig: () => ({ yield: 0, reward: { kind: "resource", resource: "gold" } }) },
    "@/lib/warehouseCells": { OWN_CELLS: 2, stackCells: () => 0 },
    "./item-alias": { canonRef: async () => null },
    "./warehouse-store": { warehouseCells: async () => [], nearestOf: () => null },
    "./field-settle": { WAREHOUSE_RADIUS: 1 },
    "./account-upgrade": { ownCellsOf: async () => 2, upgradesOf: async () => ({ farm: false, warehouse: false }) },
    "@/lib/accountUpgrade": load("src/lib/accountUpgrade.ts", { "./warehouseCells": { OWN_CELLS: 2 } }),
  });
  const fields = await myHarvestFields("world", "owner");
  assert.equal(fields.length, 1);
  assert.equal(fields[0].heroName, "Hero");
  assert.equal(fields[0].perHour, 0);
  assert.match(statements[0], /AND w\.hero_id IS NOT NULL/);
});
function jsx(type, props, key) { return typeof type === "function" ? type(props ?? {}) : { type, props: props ?? {}, key }; }
function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (Array.isArray(tree)) return tree.map(textOf).join(" ");
  return textOf(tree.props?.children);
}
function sourceList() {
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": { MapPin: "map-pin" },
    "@/lib/i18n": { useT: () => (k, p) => k + (p ? JSON.stringify(p) : "") },
    "@/lib/formatQty": { formatQty: String },
    "./CaptureCollectButton": { CaptureCollectButton: () => jsx("button", { "data-single-collect": true }) },
  };
  return load("src/components/beta-raid/hud/HarvestSourceList.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "lucide-react": { MapPin: "map-pin" },
    "@/lib/i18n": { useT: () => (k, p) => k + (p ? JSON.stringify(p) : "") },
    "@/lib/formatQty": { formatQty: String },
    "@/lib/daraiMine": { mushroomNameKey: k => "dmine.item." + k },
    "@/lib/mineV2Clock": { mineServerNow: (_, now) => now },
    "@/lib/raid/weatherYield": load("src/lib/raid/weatherYield.ts"),
    "@/components/beta-raid/weather/useWeatherByMap": { useWeatherByMap: () => new Map() },
    "@/components/beta-raid/weather/WeatherBadge": { WeatherBadge: () => null, WeatherBadges: () => null },
    "./CapturedResourceRow": load("src/components/beta-raid/hud/CapturedResourceRow.tsx", mocks),
  }).HarvestSourceList;
}
test("independent panels and counts omit inactive farm; navigation targets each source", () => {
  const hits = [];
  const base = { mapId: "world", resource: "gold", yield: 1, capturedAt: 1, claimedHours: 0, maxHours: null };
  const field = { mapId: "world", reward: { kind: "resource", resource: "gold" }, perHour: 0, stored: null, ready: 0 };
  const tree = sourceList()({ mines: [
    { ...base, q: 1, r: 2 },
    { ...base, q: -6, r: 3, mushroom: { kind: "gold", image: "/gold.webp" }, lost: { id: "loss", kind: "take", amount: 6 } },
  ], fields: [
    { ...field, q: 8, r: 9, heroName: null, stored: 99 },
    { ...field, q: 4, r: 5, heroName: "Hero" },
  ], now: 1000, onShowCell: (q, r) => hits.push([q, r]), action: jsx("button", { "data-collect": true }) });
  const all = nodes(tree);
  const panels = all.filter(n => n.type === "section");
  assert.equal(panels.length, 2);
  assert.equal(panels[0].props.children[1].props["data-harvest-collect-wrap"], true);
  assert.ok(all.filter(n => n.type === "details").every(n => !n.props.open));
  assert.match(textOf(panels[0]), /my_mines_mushrooms_n\{"n":2\}/);
  assert.match(textOf(panels[1]), /my_farms_n\{"n":1\}/);
  assert.match(textOf(panels[0]), /harvest.mushroom_seized/);
  const buttons = all.filter(n => n.type === "button" && n.props["data-harvest-show-cell"]);
  assert.equal(buttons.length, 3);
  buttons.forEach(b => b.props.onClick());
  assert.deepEqual(hits, [[1,2],[-6,3],[4,5]]);
  assert.equal(nodes(panels[1]).some(n => n.props?.["data-collect"]), false);
});
test("expired mushroom stops rate and does not accrue beyond its own lifetime", () => {
  const tree = sourceList()({ mines: [{
    mapId: "world", q: 1, r: 2, resource: "gold", yield: 1, capturedAt: 3600000,
    claimedHours: 0, maxHours: null, mushroom: { kind: "gold", image: "/gold.webp", diesAt: 7200000 },
  }], fields: [], now: 36000000 });
  const row = nodes(tree).find(n => n.props?.["data-harvest-mine"]);
  const rate = nodes(row).find(n => n.props?.className === "harvest-row-rate");
  assert.match(textOf(rate), /^0\s*harvest.rate_suffix/);
  assert.match(textOf(row), /harvest.mushroom_expired/);
  const amount = nodes(row).find(n => n.type === "b");
  assert.equal(textOf(amount), "1");
});

test("all source labels have Russian and English translations", () => {
  const { dict } = load("src/lib/translations/braid-harvest.ts");
  const source = fs.readFileSync(path.join(root, "src/components/beta-raid/hud/HarvestSourceList.tsx"), "utf8");
  for (const [, key] of source.matchAll(/"(harvest\.[a-z_]+)"/g)) {
    assert.ok(dict[key]?.ru, key + " missing ru");
    assert.ok(dict[key]?.en, key + " missing en");
  }
});

test("only identical sources group together; stopped sources add ready amount but no income", () => {
  const { groupHarvestSources } = load("src/lib/harvestSourceGroups.ts");
  const base = { mapId: "world", q: 1, r: 2, resource: "gold", yield: 3, capturedAt: 3600000, claimedHours: 0, maxHours: null };
  const groups = groupHarvestSources([
    base, { ...base, q: 2, yield: 5 },
    { ...base, q: 3, lost: { id: "lost", kind: "capture", amount: 7 } },
    { ...base, q: 4, yield: 1, mushroom: { kind: "gold", diesAt: 36000000 } },
    { ...base, q: 5, yield: 1, mushroom: { kind: "gold", diesAt: 36000000 } },
    { ...base, q: 6, resource: "diamonds", yield: 1, mushroom: { kind: "diamonds", diesAt: 36000000 } },
    { ...base, q: 7, resource: "token", token: "DARAI", mushroom: { kind: "darai", diesAt: 36000000 } },
  ], 7200000);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].rows.length, 3);
  assert.equal(groups[0].perHour, 8);
  assert.equal(groups[0].ready, 15);
  assert.equal(groups[0].seized, 1);
  assert.equal(groups[1].rows.length, 2);
  assert.equal(groups[1].perHour, 2);
});

