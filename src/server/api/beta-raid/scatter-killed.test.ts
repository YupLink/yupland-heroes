// «Снимем N» обязано означать ровно то, что снимут.
//
// Предпросмотр (scatter-report.countKilled) и снос (scatter-apply.removeKilled)
// — два разных запроса об одном и том же множестве. Пока каждый классифицировал
// объекты по-своему (вид шаблона против префикса object_id), объект с УДАЛЁННЫМ
// шаблоном в обещание не попадал, а сносился: обещали снять N — снимали N плюс
// сирот. Тест держит оба запроса на ОДНОМ выражении и стережёт видимость сирот.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCATTER_GROUPS } from "@/lib/raid/scatterPlan";
import { cellGroup, cellOrphan } from "./pile-kind";

const db = vi.hoisted(() => ({ sql: [] as string[], rows: [] as unknown[], fail: false }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: (sql: string) => {
    db.sql.push(sql);
    return db.fail ? Promise.reject(new Error("мост молчит")) : Promise.resolve(db.rows);
  },
  mcpSession: () => {
    throw new Error("тесты не открывают сессию к базе");
  },
}));

const { countKilled } = await import("./scatter-report");
const { removeKilled } = await import("./scatter-apply");

beforeEach(() => {
  db.sql = [];
  db.rows = [];
  db.fail = false;
});

describe("предпросмотр и снос считают одних и тех же убитых", () => {
  it("группу обе стороны определяют одним и тем же выражением", async () => {
    await countKilled("rmap_test");
    const preview = db.sql[0];
    expect(preview, "предпросмотр классифицирует сам по себе").toContain(cellGroup("c"));

    for (const group of SCATTER_GROUPS) {
      db.sql = [];
      // Кандидатов нет (rows пуст) — до записи дело не доходит, но подбор
      // кандидатов уже показывает, кого этот снос считает своим.
      expect(await removeKilled("rmap_test", group)).toBe(0);
      expect(db.sql[0], `подбор кандидатов группы ${group}`).toContain(cellGroup("c"));
    }
  });

  it("сироту видят оба: и обещание, и снос", async () => {
    // Сирота — кучка или артефакт, чей шаблон удалили из справочника. Раньше
    // предпросмотр ронял такой объект в «other» и обещал ноль, а снос забирал
    // его как сундук. Теперь он в общем числе — и назван отдельно.
    db.rows = [
      { grp: "chest", n: 12, orphan: 5 },
      { grp: "coin", n: 3, orphan: 0 },
      // Чужие объекты (постройки, корабли) не попадают ни в счёт, ни под снос.
      { grp: "other", n: 9, orphan: 9 },
    ];
    const out = await countKilled("rmap_test");
    expect(db.sql[0], "сироты не считаются вовсе").toContain(cellOrphan("c"));
    expect(out.chest).toEqual({ total: 12, orphan: 5 });
    expect(out.coin).toEqual({ total: 3, orphan: 0 });
    expect(out.boss).toEqual({ total: 0, orphan: 0 });
    expect(out.artifact).toEqual({ total: 0, orphan: 0 });
  });

  it("нечитаемый ответ базы не превращается в обещание «снимем 0»", async () => {
    db.rows = [{ grp: "chest", n: null, orphan: null }];
    const out = await countKilled("rmap_test");
    expect(out.chest).toEqual({ total: 0, orphan: 0 });

    // А молчащий мост — тем более не ноль: под «снимем 0» раздача сняла бы
    // сотни. Пусть кнопка честно покажет отказ.
    db.fail = true;
    await expect(countKilled("rmap_test")).rejects.toThrow("мост молчит");
  });
});
