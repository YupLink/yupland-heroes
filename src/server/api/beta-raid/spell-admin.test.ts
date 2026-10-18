// «Каталог заклинаний правит только админ» — проверка на исходниках.
//
// Такое не проверить прогоном функции: вопрос не «что считает код», а «кто до
// него дотягивается». Поэтому тест читает сам файл и стережёт границу: каждая
// серверная ручка каталога начинается с requireAdmin(). Без него любой
// подключённый кошелёк завёл бы себе заклинание с нулевой ценой и вечным
// нулевым откатом — и выучил его у первого же столба.
//
// Тест падает, когда границу двигают. Приём и форма — из scatter-guard.test.ts,
// где та же граница уже стоила бы игрокам чужих денег.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

describe("границы каталога заклинаний", () => {
  it("все ручки закрыты админским гейтом", () => {
    const src = read("server/api/beta-raid/spell-admin.ts");
    // Каждая серверная функция файла обязана начинаться с requireAdmin.
    const parts = src.split("createServerFn(").slice(1);
    expect(parts.length, "серверных функций в spell-admin.ts").toBeGreaterThanOrEqual(3);
    for (const part of parts) {
      const handler = part.slice(0, part.indexOf("});") + 1 || part.length);
      expect(handler, "серверная функция без requireAdmin()").toContain("requireAdmin()");
    }
    expect(src).toMatch(/import\s*\{\s*requireAdmin\s*\}\s*from/);
  });

  it("игровые ручки заклинаний админского гейта не требуют", () => {
    // Обратная сторона той же границы: изучение, забвение и каст — для игрока,
    // и requireAdmin в них означал бы, что механика не работает ни у кого.
    for (const rel of ["spell-learn.ts", "spell-cast.ts", "spell-book.ts", "spell-pillar.ts"]) {
      const src = read(`server/api/beta-raid/${rel}`);
      expect(src, `${rel} с админским гейтом`).not.toContain("requireAdmin(");
      // Зато гейт бета-рейда обязателен: без него ручка открыта кому угодно.
      if (src.includes("createServerFn(")) {
        expect(src, `${rel} без requireBetaRaid()`).toContain("requireBetaRaid()");
      }
    }
  });
});
