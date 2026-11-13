const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { z } = require('zod');
const source = fs.readFileSync(process.env.WEATHER_ADMIN_TEST_SOURCE || path.resolve(__dirname, '../../src/server/api/beta-raid/weather/weather-admin.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ admin = true, rows = [{ enabled: false }], error = null } = {}) {
  const calls = [];
  const exports = {};
  const createServerFn = ({ method }) => {
    let validate = x => x;
    return {
      inputValidator(fn) { validate = fn; return this; },
      handler(fn) { return Object.assign(async (args = {}) => fn({ data: validate(args.data) }), { method }); },
    };
  };
  vm.runInNewContext(code, { exports, require(id) {
    if (id === '@tanstack/react-start') return { createServerFn };
    if (id === 'zod') return { z };
    if (id === '@/server/auth') return { requireAdmin() { if (!admin) throw new Error('forbidden'); } };
    if (id === '@/server/db/mcpClient') return { async mcpExec(sql, options) { calls.push({ sql, options }); if (error) throw error; return rows; } };
    throw new Error('Unexpected dependency: ' + id);
  } });
  return { ...exports, calls };
}

test('anonymous/non-admin cannot read or write; no database calls', async () => {
  const h = harness({ admin: false });
  await assert.rejects(h.adminGetWeatherEffects(), /forbidden/);
  await assert.rejects(h.adminSetWeatherEffects({ data: { enabled: true } }), /forbidden/);
  assert.equal(h.calls.length, 0);
});
test('read returns stored boolean and uses same normalization as slot generator', async () => {
  for (const enabled of [true, false]) {
    const h = harness({ rows: [{ enabled }] });
    assert.equal((await h.adminGetWeatherEffects()).enabled, enabled);
    assert.match(h.calls[0].sql, /btrim\(value, ' "'\) = 'on'/);
    assert.equal(h.adminGetWeatherEffects.method, 'GET');
  }
});
test('strict boolean input rejects strings, null and arbitrary setting keys before writing', async () => {
  const h = harness();
  for (const data of [{ enabled: 'true' }, { enabled: 1 }, null, {}, { enabled: true, key: 'other' }]) {
    await assert.rejects(h.adminSetWeatherEffects({ data }));
  }
  assert.equal(h.calls.length, 0);
});
test('enable/disable writes only weather_effects, never existing weather slots', async () => {
  for (const enabled of [true, false]) {
    const value = enabled ? 'on' : 'off';
    const h = harness({ rows: [{ value }] });
    assert.equal((await h.adminSetWeatherEffects({ data: { enabled } })).enabled, enabled);
    assert.equal(h.adminSetWeatherEffects.method, 'POST');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].options.wrapJsonCte, true);
    assert.equal(h.calls[0].options.wrapJson, undefined);
    assert.match(h.calls[0].sql, new RegExp("VALUES \\('weather_effects', '" + value + "'\\)"));
    assert.doesNotMatch(h.calls[0].sql, /raid_weather|DELETE|TRUNCATE/i);
  }
});
test('failed reads and writes never report success or silently default to off', async () => {
  for (const options of [{ rows: null }, { rows: [] }, { error: new Error('database unavailable') }]) {
    const h = harness(options);
    await assert.rejects(h.adminGetWeatherEffects());
    await assert.rejects(h.adminSetWeatherEffects({ data: { enabled: true } }));
  }
  await assert.rejects(harness({ rows: [{ value: 'off' }] }).adminSetWeatherEffects({ data: { enabled: true } }));
});
