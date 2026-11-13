// Правки зависимостей перед сборкой — память сборки (21.10.2026). Идемпотентно.
// Первые две — только для режима сборки (buildEnd), dev-сервер не трогают; h3 — ниже.
//
// Плагин компилятора TanStack Start (@tanstack/start-plugin-core,
// start-compiler-plugin/plugin.js) создаёт компилятор на окружение и хранит его
// в Map до конца процесса. Компилятор держит контекст сборки (this.load /
// this.resolve) — а через него весь граф Rollup и деревья Babel окружения.
// Сборка идёт тремя окружениями в одном процессе, и каждое оставляло после себя
// 1,1–1,4 ГБ: к концу 4+ ГБ кучи и «heap out of memory» на сервере (снимок кучи:
// compilers → StartCompiler → getKnownServerFns → this → getModuleIds → Graph).
// В режиме сборки компилятор после своего окружения не нужен — отпускаем его
// в buildEnd. Якорь не найден (другая версия пакета) — предупреждаем и не
// трогаем: сборка пройдёт, просто с прежней памятью.
// 11.11.2026, start-plugin-core 1.171.50: Map и утечка на месте (сам плагин
// чистит Map только в buildStart — перед сборкой окружения, не после), а тело
// hotUpdate стало одной строкой — якорь обновлён под новый вид.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const FILE =
  "node_modules/@tanstack/start-plugin-core/dist/esm/vite/start-compiler-plugin/plugin.js";
const MARK = "/* yuplink: отпустить компилятор после сборки окружения */";
const ANCHOR =
  "\t\t\thotUpdate(ctx) {\n\t\t\t\treturn invalidateCompilerState(this.environment, ctx.modules);";

function patchStartCompiler() {
  if (!existsSync(FILE)) return console.warn(`[patch-deps] нет ${FILE} — пропуск`);
  const src = readFileSync(FILE, "utf8");
  if (src.includes(MARK)) return console.log("[patch-deps] start-compiler: уже");
  if (!src.includes(ANCHOR))
    return console.warn("[patch-deps] start-compiler: якорь не найден — пропуск");
  const hook =
    `\t\t\t${MARK}\n` +
    `\t\t\tbuildEnd() {\n` +
    `\t\t\t\tif (this.environment?.mode === "build") compilers.delete(this.environment.name);\n` +
    `\t\t\t},\n`;
  writeFileSync(FILE, src.replace(ANCHOR, hook + ANCHOR));
  console.log("[patch-deps] start-compiler: компилятор отпускается после окружения");
}

// Плагин Tailwind (@tailwindcss/vite, сборка) хранит «корни» CSS по окружению
// в Map до конца процесса, а корень держит замыкание this.addWatchFile — то
// есть контекст и граф Rollup окружения. Отпускаем корни окружения в buildEnd.
// Код пакета сжат: имя Map берём из соседнего this-кода, а не угадываем.
const TW_FILE = "node_modules/@tailwindcss/vite/dist/index.mjs";
const TW_MARK = "/*yuplink:tw-free*/";
const TW_PLUGIN = '{name:"@tailwindcss/vite:generate:build",apply:"build",enforce:"pre",';

function patchTailwind() {
  if (!existsSync(TW_FILE)) return console.warn(`[patch-deps] нет ${TW_FILE} — пропуск`);
  const src = readFileSync(TW_FILE, "utf8");
  if (src.includes(TW_MARK)) return console.log("[patch-deps] tailwind: уже");
  const at = src.indexOf(TW_PLUGIN);
  const roots =
    at < 0
      ? null
      : /let \w+=(\w+)\.get\(this\.environment\?\.name\?\?"default"\)/.exec(src.slice(at));
  if (!roots) return console.warn("[patch-deps] tailwind: якорь не найден — пропуск");
  const hook = `${TW_MARK}buildEnd(){${roots[1]}.delete(this.environment?.name??"default")},`;
  writeFileSync(TW_FILE, src.replace(TW_PLUGIN, TW_PLUGIN + hook));
  console.log("[patch-deps] tailwind: корни CSS отпускаются после окружения");
}

// h3 (сервер, 28.10.2026): адрес с битой %-кодировкой (сканеры: /shop/%2eenv, /%E0%A4%A…)
// ронял разбор адреса — decodeURI бросал до любого обработчика, ответа не было вовсе
// (uncaughtException в логе, у прокси — 5xx). Теперь битый адрес остаётся как есть, и
// сканер получает обычное «не найдено». Файл h3 с хэшем в имени — ищем по якорю.
const H3_DIR = "node_modules/h3/dist";
const H3_MARK = "/*yuplink:bad-uri*/";
const H3_ANCHOR =
  'function decodePathname(pathname) {\n\treturn decodeURI(pathname.includes("%25") ? pathname.replace(/%25/g, "%2525") : pathname);\n}';

function patchH3() {
  if (!existsSync(H3_DIR)) return console.warn(`[patch-deps] нет ${H3_DIR} — пропуск`);
  for (const name of readdirSync(H3_DIR).filter((n) => n.endsWith(".mjs"))) {
    const file = `${H3_DIR}/${name}`;
    const src = readFileSync(file, "utf8");
    if (src.includes(H3_MARK)) return console.log("[patch-deps] h3: уже");
    if (!src.includes(H3_ANCHOR)) continue;
    const safe =
      `function decodePathname(pathname) {${H3_MARK}\n\ttry {\n` +
      '\t\treturn decodeURI(pathname.includes("%25") ? pathname.replace(/%25/g, "%2525") : pathname);\n' +
      "\t} catch {\n\t\treturn pathname;\n\t}\n}";
    writeFileSync(file, src.replace(H3_ANCHOR, safe));
    return console.log("[patch-deps] h3: битый адрес больше не роняет разбор");
  }
  console.warn("[patch-deps] h3: якорь не найден — пропуск");
}

patchStartCompiler();
patchTailwind();
patchH3();
