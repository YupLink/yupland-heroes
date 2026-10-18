// «Обычных игроков это не касается» — проверка на исходниках.
//
// Автораздача снимает объекты и обещает деньги; всё, что она умеет, обязано
// оставаться за админской дверью. Такие вещи не проверить прогоном функции:
// вопрос не «что считает код», а «кто и откуда до него дотягивается». Поэтому
// тест читает сами файлы и стережёт три границы: гейт на ручках, круг
// импортов и список таблиц, в которые фича вообще пишет.
//
// Тест падает, когда границу двигают. Это не придирка к стилю: каждая из трёх
// однажды уже стоила бы игрокам чужих денег.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Все исходники проекта, кроме самих тестов и тестовой обвязки. */
const sources = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((p) => /\.tsx?$/.test(p) && !p.includes(".test.") && !p.startsWith("test/"))
    .map((p) => p.split("\\").join("/"));

const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** Файлы, которым по чину знать про раздачу. Всё остальное — утечка. */
const ALLOWED = [
  /^server\/api\/beta-raid\/scatter/,
  /^components\/beta-raid\/scatter\//,
  /^components\/beta-raid\/AdminRaidRestore\.tsx$/,
  // Второй вход в ту же раздачу — режим бога. Слой рисуется только админу
  // (проверка гейта ниже), а окно держит порталом: карту правят на весь экран,
  // и ходить за раздачей в общий редактор карт админ больше не обязан.
  /^components\/beta-raid\/AdminLiveLayer\.tsx$/,
  // scatterLands — арифметика отмеченных админом местностей: её читают и
  // сервер (сколько куда класть), и панель (сводка раздела и дефицит), поэтому
  // она живёт в общем договоре, как scatterPlan и scatterMath.
  /^lib\/raid\/(scatterPlan|scatterMath|scatterLands|pileKind)\.ts$/,
  /^server\/api\/beta-raid\/pile-kind\.ts$/,
  /^api\/index\.ts$/,
];

/** Импорт любого модуля раздачи — хоть относительный, хоть через алиас `@/`. */
const MENTIONS = /from\s+"[^"]*(scatter|pile-kind|pileKind)[^"]*"/i;

describe("границы фичи раздачи", () => {
  it("обе ручки закрыты админским гейтом", () => {
    const src = read("server/api/beta-raid/scatter.ts");
    // Каждая серверная функция файла обязана начинаться с requireAdmin: без
    // него ЛЮБОЙ подключённый кошелёк переразложил бы карту.
    const parts = src.split("createServerFn(").slice(1);
    expect(parts.length, "серверных функций в scatter.ts").toBeGreaterThanOrEqual(2);
    for (const part of parts) {
      const handler = part.slice(0, part.indexOf("});") + 1 || part.length);
      expect(handler, "серверная функция без requireAdmin()").toContain("requireAdmin()");
    }
    expect(src).toMatch(/import\s*\{\s*requireAdmin\s*\}\s*from/);
  });

  it("про раздачу знает только админский угол проекта", () => {
    const leaks = sources().filter((rel) => {
      if (ALLOWED.some((re) => re.test(rel))) return false;
      return MENTIONS.test(read(rel));
    });
    expect(leaks, `модули раздачи утекли в игровой код: ${leaks.join(", ")}`).toHaveLength(0);
  });

  it("ни один экран игры не тянет серверные модули раздачи", () => {
    // Клиенту позволено видеть ровно две вещи: договор плана (lib/raid) и
    // сами серверные ручки — их TanStack Start срезает до вызова по сети.
    // Всё остальное серверное (подбор клеток, запись, справочники) в бандл
    // игрока попасть не должно даже мёртвым кодом.
    const inner = /(scatter-(build|cells|apply|tpl|report|funds|schema)|beta-raid\/pile-kind)/;
    const leaks = sources()
      .filter((rel) => rel.startsWith("components/") || rel.startsWith("routes/"))
      .filter((rel) => inner.test(read(rel)));
    expect(leaks, `серверные модули раздачи в клиентских файлах: ${leaks.join(", ")}`).toHaveLength(
      0,
    );
  });

  it("панель раздачи живёт под тем же замком, что и остальная админка", () => {
    // Входов в раздачу два — блок над картой и режим бога, — и оба обязаны
    // стоять за одним замком: сами панели ничем не гейтятся, проверка прав
    // живёт на экране рейда, который их держит.
    expect(read("components/beta-raid/AdminRaidRestore.tsx")).toContain("<ScatterPanel");
    expect(read("components/beta-raid/AdminLiveLayer.tsx")).toContain("<ScatterPanel");
    const screen = read("components/beta-raid/BetaRaidScreen.tsx");
    for (const tag of ["AdminRaidRestore", "AdminLiveLayer"]) {
      const spots = [...screen.matchAll(new RegExp(`<${tag}`, "g"))].map((m) => m.index ?? 0);
      expect(spots.length, `${tag} на экране рейда`).toBeGreaterThan(0);
      for (const at of spots) {
        const before = screen.slice(Math.max(0, at - 400), at);
        expect(before, `${tag} отрисован без проверки isAdmin`).toContain("isAdmin");
      }
    }
  });

  it("раздача пишет только в клетки карты — и никуда больше", () => {
    // Списки игроков, счета, билеты, энергия и сами шаблоны для неё
    // ТОЛЬКО чтение. Появится в этом списке чужая таблица — игроку станет
    // больно молча, поэтому пусть больно станет тесту.
    const allowed = new Set([
      "yuplink.raid_map_cells",
      "yuplink.beta_raid_object_hp",
      "yuplink.raid_maps",
    ]);
    const writes: string[] = [];
    for (const rel of sources().filter((p) => /^server\/api\/beta-raid\/scatter/.test(p))) {
      const src = read(rel);
      for (const m of src.matchAll(/(INSERT INTO|UPDATE|DELETE FROM)\s+(yuplink\.\w+)/g)) {
        if (!allowed.has(m[2])) writes.push(`${rel}: ${m[1]} ${m[2]}`);
      }
    }
    expect(writes, `раздача пишет в чужую таблицу: ${writes.join("; ")}`).toHaveLength(0);
  });

  it("живых и недобитых объектов раздача не снимает", () => {
    // Условие смерти стоит в самом UPDATE, а не только в подборе кандидатов:
    // между чтением и записью админ мог объект восстановить, а игроки —
    // вложиться в бой. Снести такой значит отнять чужой бой.
    const src = read("server/api/beta-raid/scatter-apply.ts");
    expect(/const KILLED =[\s\S]{0,300}killed_at IS NOT NULL/.test(src), "условие смерти").toBe(
      true,
    );
    const update = src.slice(
      src.indexOf("UPDATE yuplink.raid_map_cells"),
      src.indexOf("RETURNING c.q"),
    );
    expect(update.includes("${KILLED}"), "снос без проверки смерти в самом UPDATE").toBe(true);
  });
});
