// Contract checks with server/auth/database replaced by inert fakes. No game imports execute.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { z } = require('zod');
const calls = [];
function moduleFrom(path, imports) {
  const source = fs.readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (id) => {
    if (!(id in imports)) throw Error(`Unexpected import: ${id}`);
    return imports[id];
  } }, { filename: path });
  return exports;
}
const size = moduleFrom('src/lib/castleLabelSize.ts', {});
const kinds = moduleFrom('src/lib/castleKinds.ts', {});
const createServerFn = () => {
  let parse = x => x;
  const builder = { inputValidator(fn) { parse = fn; return builder; }, handler(fn) { return data => fn({ data: parse(data) }); } };
  return builder;
};
const api = moduleFrom('src/server/api/castle-editor-assets.ts', {
  '@tanstack/react-start': { createServerFn }, zod: { z }, nanoid: { nanoid: () => 'test' },
  '../db/mcpClient': { mcpExec: async sql => { calls.push(sql); } },
  '../auth': { requireCastleEditor: async () => 'fixture' }, './raid-shared': { sqlStr: s => "'" + s.replaceAll("'", "''") + "'" },
  '@/lib/castleKinds': kinds, '@/lib/castleLabelSize': size, './castle-editor': { ensureCastleTables: async () => {} },
});
(async () => {
  assert.equal(size.castleLabelSize(undefined), 14);
  assert.equal(size.castleLabelSize(NaN), 14);
  for (const n of [10, 14, 20]) {
    const asset = await api.castleEditorCreateAsset({ kind: 'building', name: 'Test', imageUrl: 'fixture.png', labelFontSize: n });
    assert.equal(asset.label_font_size, n);
    assert.match(calls.at(-1), new RegExp(`, ${n}\\)`));
    await api.castleEditorUpdateAsset({ id: asset.id, labelFontSize: n });
    assert.match(calls.at(-1), new RegExp(`THEN ${n} ELSE label_font_size`));
  }
  const old = await api.castleEditorCreateAsset({ kind: 'building', name: 'Legacy', imageUrl: 'fixture.png' });
  assert.equal(old.label_font_size, 14);
  await api.castleEditorUpdateAsset({ id: old.id, name: 'Renamed' });
  assert(!calls.at(-1).includes('label_font_size'));
  for (const n of [9, 21, 10.5, NaN, Infinity, '14', null]) {
    assert.throws(() => api.castleEditorUpdateAsset({ id: old.id, labelFontSize: n }));
  }
  console.log('PASS: default, create response + SQL, update SQL, rename preserves size, invalid values rejected; inert DB/auth fakes only');
})().catch(e => { console.error(e); process.exit(1); });
