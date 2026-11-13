// Импорты иконок lucide переписываются на файлы иконок — и только они.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { lucideIconFiles, rewriteLucideImports } from "../../vite/lucideDirect";

const entry = createRequire(import.meta.url).resolve("lucide-react/dist/esm/lucide-react.js");
const files = lucideIconFiles(readFileSync(entry, "utf8"));

describe("иконки lucide напрямую", () => {
  it("имена и алиасы пакета ведут на файл иконки, и он существует", () => {
    expect(files.size).toBeGreaterThan(1000);
    for (const name of ["Hammer", "HammerIcon", "LucideHammer", "Gavel", "X", "Loader2"]) {
      const file = files.get(name);
      expect(file, name).toMatch(/^lucide-react\/dist\/esm\/icons\/.+\.js$/);
      expect(() => createRequire(import.meta.url).resolve(file!)).not.toThrow();
    }
  });

  it("многострочный импорт с переименованием и типом", () => {
    const code = `import {\n  Hammer,\n  Gavel as G,\n  type LucideIcon,\n} from "lucide-react";\nconst a = 1;`;
    const out = rewriteLucideImports(code, files)!;
    expect(out).toContain(`import Hammer from "${files.get("Hammer")}";`);
    expect(out).toContain(`import G from "${files.get("Gavel")}";`);
    expect(out).toContain(`import type { LucideIcon } from "lucide-react";`);
    expect(out).not.toMatch(/import \{[^}]*Hammer/);
    // Число строк не растёт: импорт ужимается в одну строку.
    expect(out.split("\n").length).toBeLessThanOrEqual(code.split("\n").length);
  });

  it("неизвестное имя остаётся импортом из пакета; без иконок — файл не трогаем", () => {
    const out = rewriteLucideImports(`import { X, createLucideIcon } from "lucide-react";`, files)!;
    expect(out).toContain(`import X from "${files.get("X")}";`);
    expect(out).toContain(`import { createLucideIcon } from "lucide-react";`);
    expect(
      rewriteLucideImports(`import type { LucideIcon } from "lucide-react";`, files),
    ).toBeNull();
    expect(rewriteLucideImports(`import { foo } from "bar";`, files)).toBeNull();
  });
});
