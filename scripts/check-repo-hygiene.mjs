#!/usr/bin/env node
// Гигиена репо: секреты и данные игроков не должны попасть в git.
//
//   node scripts/check-repo-hygiene.mjs --staged         строки, добавленные в индекс (pre-commit)
//   node scripts/check-repo-hygiene.mjs --range A..B     строки, добавленные в диапазоне (CI; A...B тоже можно)
//   node scripts/check-repo-hygiene.mjs --all            все отслеживаемые файлы целиком
//
// Локальный хук включается один раз на клон:  git config core.hooksPath .githooks
// В CI — .github/workflows/repo-hygiene.yml. Зависимостей нет, только Node и git.
//
// Намеренный случай (фейк в документации и т. п.) — строка с пометкой `hygiene-ok`
// пропускается целиком. Выход 1 = есть находки: файл:строка, правило, значение в маске.
// Здесь только общие шаблоны — ни одного настоящего идентификатора команды или игрока.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const B58 = "1-9A-HJ-NP-Za-km-z";
const ALLOW_MARK = "hygiene-ok";
const BINARY_EXT =
  /\.(png|jpe?g|webp|gif|ico|avif|bmp|pdf|woff2?|ttf|otf|eot|mp3|ogg|wav|m4a|mp4|webm|mov|zip|gz|tgz|lockb|wasm|glb)$/i;

const isTestFile = (f) =>
  /(^|\/)(tests?|__tests__|__mocks__|e2e|fixtures?)\//.test(f) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const isExample = (f) => /\.example$/.test(f);

// Заглушки, которые сами по себе не секрет: test/fake/example…, подстановки ${…}/$VAR/<…>,
// имена переменных окружения капсом, маски из звёздочек/иксов.
const PLACEHOLDER =
  /test|fake|example|dummy|sample|placeholder|changeme|isolated|redacted|your[_-]|xxxx|\*\*\*|\.\.\./i;
const isPlaceholder = (v) =>
  PLACEHOLDER.test(v) ||
  /^[<{$%[]/.test(v) ||
  /^[A-Z][A-Z0-9_]*$/.test(v) ||
  /^(postgres|password|pass|pw|pwd|secret|admin|root|user)$/i.test(v);

// Похоже на случайный ключ, а не на имя/путь/выражение: буквы и цифры вперемешку,
// много разных символов, нет ссылок на env, подстановок и URL.
const looksRandom = (v) =>
  /\d/.test(v) &&
  /[A-Za-z]/.test(v) &&
  new Set(v).size >= 10 &&
  !/\$\{|process\.env|import\.meta|:\/\//.test(v);

// Частные, локальные, документационные (RFC 5737), маски и явные заглушки.
const SAFE_IP =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|203\.0\.113\.|198\.51\.100\.|192\.0\.2\.|255\.255\.|(1\.2\.3\.4|5\.6\.7\.8|0\.0\.0\.0)$)/;
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
// Имя переменной кончается на «секретное» слово (BOT_TOKEN, SESSION_SECRET, apiKey, MIMO_API_KEYS…).
// SPL_TOKEN_PROGRAM, TOKENINFO и прочие публичные адреса/URL сюда не попадают.
const SECRET_WORD =
  "(?:secret|password|passwd|token|api_?key|private_?key)(?:_?(?:key|keys|s|b64|base64|hex))?";
const SECRET_NAME = `[A-Za-z0-9_]*${SECRET_WORD}`;
const ENV_NAME = `[A-Z0-9_]*${SECRET_WORD.toUpperCase()}`;

const mask = (v) => (v.length <= 6 ? v.slice(0, 2) + "…" : `${v.slice(0, 4)}…(${v.length})`);

// rule: id, re (с флагом g), why, group — какая группа в маску, ok(значение, файл) — разрешено,
// skip(файл) — правило к файлу не применяется.
const RULES = [
  { id: "private-key", re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g, why: "PEM приватный ключ" },
  { id: "near-key", re: new RegExp(`ed25519:[${B58}]{80,}`, "g"), why: "приватный ключ NEAR" },
  { id: "tg-bot-token", re: /\b\d{8,10}:AA[\w-]{30,}/g, why: "токен Telegram-бота" },
  { id: "jwt", re: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g, why: "JWT-токен" },
  { id: "aws-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, why: "ключ AWS" },
  {
    id: "github-token",
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{50,})/g,
    why: "токен GitHub",
  },
  {
    id: "stripe-key",
    re: /\b(?:[sr]k_(?:live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{24,})/g,
    why: "ключ Stripe",
  },
  {
    id: "openai-key",
    re: /\bsk-(?:proj-|ant-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/g,
    why: "ключ OpenAI/Anthropic",
    ok: (v) => !looksRandom(v),
  },
  { id: "fal-key", re: /\bfal_sk_[A-Za-z0-9_-]{16,}/g, why: "ключ fal.ai" },
  { id: "google-key", re: /\bAIza[0-9A-Za-z_-]{35}/g, why: "ключ Google API" },
  {
    id: "db-password",
    re: /\bpostgres(?:ql)?:\/\/[^:\s/@'"`]+:([^@\s'"`]+)@/g,
    group: 1,
    why: "пароль в адресе базы",
    ok: (v) => isPlaceholder(v),
  },
  {
    id: "secret-assign",
    re: new RegExp(`\\b${SECRET_NAME}["']?\\s*[:=]\\s*(["'\`])([^"'\`\\s]{16,})\\1`, "gi"),
    group: 2,
    why: "секрет в коде",
    ok: (v) => isPlaceholder(v) || !looksRandom(v),
    skip: (f) => isExample(f) || isTestFile(f),
  },
  {
    id: "secret-assign",
    re: new RegExp(`^\\s*(?:export\\s+)?${ENV_NAME}\\s*[=:]\\s*([^\\s"'\`#]{16,})`, "g"),
    group: 1,
    why: "секрет в конфиге",
    ok: (v) => isPlaceholder(v) || !looksRandom(v),
    skip: (f) => isExample(f) || isTestFile(f),
  },
  {
    id: "account-id",
    re: /\bacc_([A-Za-z0-9_-]{20})(?![\w-])/g,
    group: 1,
    why: "похоже на настоящий id аккаунта",
    ok: (v) => !looksRandom(v) || /test|fake|demo|example|sample/i.test(v),
    skip: (f) => /^migrations\//.test(f),
  },
  {
    id: "tg-wallet",
    re: /\btg(\d{6,})\b/g,
    group: 1,
    why: "псевдокошелёк игрока (tg + id)",
    ok: (v) => /^(\d)\1+$/.test(v) || "12345678901234567890".startsWith(v),
    skip: isTestFile,
  },
  {
    id: "ipv4",
    re: new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?!\\.?\\d)`, "g"),
    why: "публичный IP-адрес",
    ok: (v) => SAFE_IP.test(v),
  },
];

const BAD_PATHS = [
  [/^audit\//, "выгрузки audit/ — данные игроков"],
  [/\.(csv|dump)$|\.sql\.gz$/i, "выгрузка данных (csv/dump/sql.gz)"],
  [/(^|\/)\.env(\.[\w.-]+)?$/, ".env-файл с настройками сервера"],
];

/** Причина, по которой путь нельзя добавлять в репо, или null. */
export function checkPath(file) {
  if (isExample(file)) return null;
  for (const [re, why] of BAD_PATHS) if (re.test(file)) return why;
  return null;
}

/** Находки в одной строке файла: [{ rule, why, shown }]. */
export function scanLine(file, text) {
  if (text.includes(ALLOW_MARK)) return [];
  const hits = [];
  for (const rule of RULES) {
    if (rule.skip?.(file)) continue;
    for (const m of text.matchAll(rule.re)) {
      const value = m[rule.group ?? 0];
      if (rule.ok?.(value, file)) continue;
      const shown = rule.id === "ipv4" ? value.split(".")[0] + ".x.x.x" : mask(value);
      hits.push({ rule: rule.id, why: rule.why, shown });
    }
  }
  return hits;
}

const DIFF = ["diff", "--no-color", "--no-ext-diff", "--diff-filter=ACMR"];
const git = (args) =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });

// Добавленные строки из `git diff -U0`: Map<файл, [{ n, text }]>.
function addedLines(diffArgs) {
  const out = git([...DIFF, "-U0", "--src-prefix=a/", "--dst-prefix=b/", ...diffArgs]);
  const files = new Map();
  let file = null;
  let n = 0;
  let inHunk = false;
  for (const line of out.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHunk = false;
      file = null;
    } else if (!inHunk && line.startsWith("+++ ")) {
      file = line.slice(4).replace(/\t$/, "").replace(/^"|"$/g, "").replace(/^b\//, "");
      files.set(file, []);
    } else if (line.startsWith("@@")) {
      inHunk = true;
      n = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (inHunk && file && line.startsWith("+")) {
      files.get(file).push({ n: n++, text: line.slice(1) });
    } else if (inHunk && line.startsWith(" ")) {
      n++;
    }
  }
  for (const name of git([...DIFF, "--name-only", "-z", ...diffArgs]).split("\0")) {
    if (name && !files.has(name)) files.set(name, []); // бинарные и переименованные — только путь
  }
  return files;
}

// Все отслеживаемые текстовые файлы: Map<файл, [{ n, text }]>.
function trackedLines() {
  const files = new Map();
  for (const file of git(["ls-files", "-z"]).split("\0").filter(Boolean)) {
    let text = "";
    try {
      const buf = BINARY_EXT.test(file) || !lstatSync(file).isFile() ? null : readFileSync(file);
      if (buf && !buf.subarray(0, 8000).includes(0)) text = buf.toString("utf8");
    } catch {
      // файл удалён в рабочей копии — путь всё равно проверим
    }
    files.set(file, text ? text.split("\n").map((t, i) => ({ n: i + 1, text: t })) : []);
  }
  return files;
}

function run(argv) {
  const [mode, arg] = argv;
  let files;
  if (mode === "--staged") files = addedLines(["--cached"]);
  else if (mode === "--range" && arg && !arg.startsWith("-")) files = addedLines([arg]);
  else if (mode === "--all") files = trackedLines();
  else {
    console.error("usage: check-repo-hygiene.mjs --staged | --range <base>..<head> | --all");
    return 2;
  }
  const report = [];
  for (const [file, lines] of files) {
    const why = checkPath(file);
    if (why) report.push(`${file}  [path] ${why}`);
    if (BINARY_EXT.test(file)) continue;
    for (const { n, text } of lines) {
      for (const h of scanLine(file, text))
        report.push(`${file}:${n}  [${h.rule}] ${h.why}: ${h.shown}`);
    }
  }
  if (!report.length) {
    console.log(`repo-hygiene: чисто (${files.size} файлов)`);
    return 0;
  }
  console.error(report.join("\n"));
  console.error(
    `\nrepo-hygiene: ${report.length} находок. Секреты — в .env/хранилище, данные игроков — не в репо.` +
      `\nНамеренный фейк — пометьте строку комментарием ${ALLOW_MARK}.`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
