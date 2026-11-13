const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, existsSync, statSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = resolve(__dirname, '../..');
const source = readFileSync(resolve(root, 'src/components/beta-raid/raid-shop-window/header.ts'), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod = {exports:{}};
vm.runInNewContext('(function(module,exports,URL){'+js+'})', {})(mod, mod.exports, URL);
const header = mod.exports.raidShopHeader;
const file = value => value ? new URL(value.src, 'https://yuplink.invalid').pathname.split('/').pop() : undefined;

test('known individual artwork survives new names, URLs, extensions and query strings', () => {
  assert.equal(file(header('/uploads/tasks/ax3WuS6u8x.webp', {name:'Магазин',kind:'market'})), 'bakery.webp');
  assert.equal(file(header('https://service.yupland.io/uploads/tasks/sk17da2ca599.webp?v=2', {kind:'market'})), 'grocery-white.webp');
  assert.equal(file(header('/uploads/tasks/4L5ZQJyp2m.png', {kind:'market'})), 'forge.webp');
  assert.equal(new URL(header('/uploads/tasks/ax3WuS6u8x.webp').src, 'https://yuplink.invalid').searchParams.get('v'), 'light-20261101');
});

test('ordinary-world forge skins and named styles use the forge header', () => {
  for(const image of ['sOkwsjdRuU.webp','8wZpD6Gh6w.webp','8ceLEh-LTy.webp','sk90a03b0b55.png']) {
    assert.equal(file(header('/uploads/tasks/'+image, {name:'Северная кузница',kind:'market'})), 'forge.webp');
  }
  assert.equal(file(header('/new/skin.webp', {name:'Гречневая кузница',kind:'market'})), 'forge.webp');
  assert.equal(file(header(null, {name:'Мастерская пчёл',kind:'market'})), 'forge.webp');
});

test('tutorial and unknown market skins keep a header without a known asset filename', () => {
  for(const image of [null, '', '/uploads/tasks/new.webp', 'http://[bad']) {
    assert.equal(file(header(image, {name:'Гречневый магазин',kind:'market'})), 'food-market.webp');
  }
  assert.equal(file(header(null, {name:'Новая лавка',kind:'market'})), 'food-market.webp');
  assert.equal(header(null), null);
});

test('service roles and names choose the corresponding existing panorama', () => {
  const cases=[['Лесная казарма','forest-barracks'],['Казарма юпиков','barracks'],['Найм воинов','barracks'],['Плавильня','smelter'],['Ломбард','pawn'],['Лепёшки','bakery'],['Магазин Саженцев','seedlings'],['Оружейник','armory'],['Магазин героев','heroes'],['Каменщик','construction'],['Лавка Алхимика','enchant'],['Northern forge','forge']];
  for(const [name,want] of cases) assert.equal(file(header(null,{name,kind:'market'})), want+'.webp', name);
  assert.equal(file(header(null,{kind:'enchant'})), 'enchant.webp');
  assert.equal(file(header(null,{name:'Ремонт',repair:true})), 'forge.webp');
});

test('every referenced panorama exists and stays under the 20 KB budget', () => {
  for(const name of ['bakery','armory','grocery-white','heroes','food-market','construction','seedlings','barracks','forest-barracks','forge','pawn','enchant','smelter']) {
    const path=resolve(root,'public/raid-shops/headers',name+'.webp');
    assert.ok(existsSync(path), name);
    assert.ok(statSync(path).size <= 20000, name+' exceeds image budget');
  }
});
