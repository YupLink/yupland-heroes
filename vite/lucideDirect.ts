// Иконки lucide — прямо из файла иконки, мимо общего входа пакета (только сборка).
//
// Общий вход lucide-react ссылается на все ~1 700 иконок, и сборщик грузит и
// разбирает их ВСЕ (1 698 модулей в клиенте и столько же в nitro), хотя в
// бандл уходит пара сотен. Память сборки на этом росла до предела 4 ГБ кучи
// (выкаты 21.10.2026 падали «heap out of memory»). Переписываем
//   import { Hammer, Gavel as G } from "lucide-react"
// в
//   import Hammer from "lucide-react/dist/esm/icons/hammer.js"
// — имя → файл берём из самого общего входа пакета, так что алиасы
// (HammerIcon, LucideHammer, переименованные иконки) совпадают с пакетом.
// Неизвестные и типовые имена остаются импортом из пакета, как были.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ICON_EXPORT = /export \{([^}]*)\} from '\.\/icons\/([^']+)';/g;
const LUCIDE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'];?/g;

/** Имя экспорта → путь к файлу иконки, по общему входу пакета. */
export function lucideIconFiles(entrySource: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const m of entrySource.matchAll(ICON_EXPORT)) {
    for (const part of m[1].split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) files.set(name, `lucide-react/dist/esm/icons/${m[2]}`);
    }
  }
  return files;
}

/** Переписать импорты lucide в одном файле; null — нечего менять. */
export function rewriteLucideImports(
  code: string,
  files: ReadonlyMap<string, string>,
): string | null {
  let changed = false;
  const out = code.replace(LUCIDE_IMPORT, (whole, list: string) => {
    const direct: string[] = [];
    const rest: string[] = [];
    for (const raw of list.split(",")) {
      const spec = raw.trim();
      if (!spec) continue;
      const [name, alias] = spec.split(/\s+as\s+/).map((s) => s.trim());
      const file = spec.startsWith("type ") ? undefined : files.get(name);
      if (file) direct.push(`import ${alias ?? name} from "${file}";`);
      else rest.push(spec);
    }
    if (direct.length === 0) return whole;
    changed = true;
    const onlyTypes = rest.every((s) => s.startsWith("type "));
    const tail = rest.length
      ? onlyTypes
        ? `import type { ${rest.map((s) => s.slice(5)).join(", ")} } from "lucide-react";`
        : `import { ${rest.join(", ")} } from "lucide-react";`
      : "";
    // Одной строкой: номера строк ниже по файлу не сдвигаются.
    return [...direct, tail].filter(Boolean).join(" ");
  });
  return changed ? out : null;
}

/** Плагин Vite: только сборка, только наш код (не node_modules). */
export function lucideDirect() {
  let files: Map<string, string> | null = null;
  const load = () => {
    if (files) return files;
    const entry = createRequire(import.meta.url).resolve("lucide-react/dist/esm/lucide-react.js");
    files = lucideIconFiles(readFileSync(entry, "utf8"));
    return files;
  };
  return {
    name: "lucide-direct",
    apply: "build" as const,
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (id.includes("/node_modules/") || !code.includes("lucide-react")) return null;
      if (!/\.(m?[jt]sx?)$/.test(id.split("?")[0])) return null;
      const out = rewriteLucideImports(code, load());
      return out === null ? null : { code: out, map: null };
    },
  };
}
