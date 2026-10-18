// «Если есть копия предмета — одевается копия» (владелец 29.09): экземпляр на
// другом герое меняется на свободную копию того же шаблона; копий нет — как
// раньше, снимут с того героя.
import { describe, expect, it } from "vitest";
import { assignFreeCopies, freeCopiesSql } from "./heroes-gear-copies";

describe("assignFreeCopies", () => {
  it("надет на другом герое, есть свободная копия — надеваем копию", () => {
    const out = assignFreeCopies({ ring: "it_on_other" }, [
      { key: "ring", item: "it_on_other", taken: true, free: ["it_free"] },
    ]);
    expect(out).toEqual({ ring: "it_free" });
  });

  it("свободных копий нет — оставляем: снимут с другого героя, как раньше", () => {
    const out = assignFreeCopies({ ring: "it_on_other" }, [
      { key: "ring", item: "it_on_other", taken: true, free: [] },
    ]);
    expect(out).toEqual({ ring: "it_on_other" });
  });

  it("не занят никем — не трогаем", () => {
    const out = assignFreeCopies({ ring: "it_mine" }, [
      { key: "ring", item: "it_mine", taken: false, free: ["it_free"] },
    ]);
    expect(out).toEqual({ ring: "it_mine" });
  });

  it("две занятые, одна свободная копия — копия уходит в одно место, второе снимут", () => {
    const out = assignFreeCopies({ "ring#1": "a", "ring#2": "b" }, [
      { key: "ring#1", item: "a", taken: true, free: ["c"] },
      { key: "ring#2", item: "b", taken: true, free: ["c"] },
    ]);
    expect(out).toEqual({ "ring#1": "c", "ring#2": "b" });
  });

  it("свободная копия уже стоит в этом наборе — второй раз её не берём", () => {
    const out = assignFreeCopies({ "ring#1": "c", "ring#2": "b" }, [
      { key: "ring#2", item: "b", taken: true, free: ["c", "d"] },
    ]);
    expect(out).toEqual({ "ring#1": "c", "ring#2": "d" });
  });
});

describe("freeCopiesSql", () => {
  it("пустой набор — без запроса", () => {
    expect(freeCopiesSql("acc", "hero", {})).toBeNull();
  });

  it("другие герои аккаунта, битые записи и NULL не ломают выборку", () => {
    const sql = freeCopiesSql("acc_me", "hero_main", { ring: "it_1" }) ?? "";
    expect(sql).toContain("h.account_id = 'acc_me' AND h.id <> 'hero_main'");
    expect(sql).toContain("jsonb_typeof(h.equipped::jsonb) = 'object'");
    expect(sql).toContain("x.value IS NOT NULL");
    expect(sql).toContain("f.template_id = u.template_id");
    expect(sql).toContain("('ring', 'it_1')");
  });
});
