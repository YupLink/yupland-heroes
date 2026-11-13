// Правило кругов NFT: один перевод — одна выдача, перевод обязан быть из
// текущего круга, вечных замков по номеру нет. Случаи взяты из жизни:
// жалоба игрока 27.09, двойной догон 26.08, призы, пак-токены.
import { describe, expect, it } from "vitest";
import {
  cycleAt,
  decideCredit,
  hiddenForHolder,
  isCreditable,
  openBinding,
  recoveryOrder,
  type CycleBinding,
  type CycleRow,
} from "./nftCycle";

const T = (iso: string) => Date.parse(iso);
const bind = (serial: number): CycleBinding => ({
  chipId: `uci_${serial}`,
  serial,
  templateId: "ct_football_1",
  level: 5,
  collectionId: "cc_football",
});
let n = 0;
const cyc = (
  opened: string,
  closed: string | null,
  closeTx: string | null = closed ? `tx_${++n}` : null,
  binding: CycleBinding | null = null,
): CycleRow => ({
  id: `c${++n}`,
  openedAt: T(opened),
  openSource: binding ? "mint" : "implicit",
  closedAt: closed ? T(closed) : null,
  closeTx,
  binding,
});

describe("decideCredit — что делать с переводом на склад", () => {
  it("номер никогда не выезжал с учётом — неявный круг, выдача", () => {
    const d = decideCredit([], "tx", T("2026-09-01T10:00:00Z"));
    expect(d.kind).toBe("implicit");
    expect(isCreditable(d)).toBe(true);
  });

  it("открытый круг вывода закрывается переводом и отдаёт привязку", () => {
    const mint = cyc("2026-08-26T21:55:51Z", null, null, bind(33665));
    const d = decideCredit([mint], "tx_player", T("2026-09-27T21:07:00Z"));
    expect(d.kind).toBe("close");
    if (d.kind === "close") expect(d.cycle.binding?.serial).toBe(33665);
  });

  it("тот же перевод второй раз — уже зачтён, не вторая выдача", () => {
    const c = cyc("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "tx_same");
    expect(decideCredit([c], "tx_same", T("2026-09-01T11:00:00Z")).kind).toBe("already");
  });

  it("старый перевод внутри круга, закрытого другим вводом, — не выдаём", () => {
    const c = cyc("2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z", "tx_new");
    const d = decideCredit([c], "tx_old", T("2026-09-01T11:00:00Z"));
    expect(d.kind).toBe("stale");
    expect(isCreditable(d)).toBe(false);
  });

  it("перевод после закрытого круга — номер выезжал мимо учёта: новый тесный круг", () => {
    const c = cyc("2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    const d = decideCredit([c], "tx_prize_winner", T("2026-09-05T09:00:00Z"));
    expect(d.kind).toBe("implicit");
    // Тесный: не «от прошлого ввода», а вплотную к переводу.
    if (d.kind === "implicit") expect(d.openedAt).toBe(T("2026-09-05T09:00:00Z") - 1);
  });

  it("два неявных круга подряд не отбирают выдачу у старшего перевода", () => {
    // Номер дважды выезжал мимо учёта; догон сначала зачёл младший перевод.
    const c0 = cyc("2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z");
    const younger = { ...cyc("2026-09-01T11:59:59.999Z", "2026-09-01T12:00:00Z", "tx_r"), openSource: "implicit" };
    const older = decideCredit([c0, younger], "tx_q", T("2026-09-01T11:00:00Z"));
    expect(older.kind).toBe("implicit");
  });

  it("прерванная выдача: круг закрыт этим переводом, выдачи нет — доделать", () => {
    const c = { ...cyc("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z", "tx_cut"), granted: false };
    const d = decideCredit([c], "tx_cut", T("2026-09-01T11:00:00Z"));
    expect(d.kind).toBe("already");
    expect(isCreditable(d)).toBe(true);
    const done = { ...c, granted: true };
    expect(isCreditable(decideCredit([done], "tx_cut", T("2026-09-01T11:00:00Z")))).toBe(false);
  });

  it("при равном времени выезда берётся круг с большим id — как в SQL", () => {
    const a = { ...cyc("2026-09-01T10:00:00Z", null), id: "a" };
    const b = { ...cyc("2026-09-01T10:00:00Z", null), id: "b" };
    expect(cycleAt([a, b], T("2026-09-01T11:00:00Z"))?.id).toBe("b");
  });

  it("жалоба игрока 27.09: живая фишка прошлого владельца больше не запирает ввод", () => {
    // Как восстановлено из истории: три прошлых ввода и её вывод 26.08.
    const history = [
      cyc("2026-07-22T15:35:00Z", "2026-07-22T15:35:30Z"),
      cyc("2026-07-22T15:35:31Z", "2026-07-29T08:49:00Z"),
      cyc("2026-07-29T08:49:01Z", "2026-08-26T21:05:11Z", "CRVNC"),
      cyc("2026-08-26T21:55:51Z", null, null, bind(33665)),
    ];
    const hers = decideCredit(history, "tx_player", T("2026-09-27T21:07:00Z"));
    expect(hers.kind).toBe("close");
    // Догон 26.08 зачёл перевод другого игрока второй раз — теперь это «уже зачтено».
    expect(decideCredit(history, "CRVNC", T("2026-08-26T18:06:33Z")).kind).toBe("already");
  });

  it("склад отдал номер наружу сразу после ввода — прошлый перевод не цепляет новый круг", () => {
    const prev = cyc("2026-09-01T10:00:00Z", null);
    const next = cyc("2026-09-01T10:00:05Z", null, null, bind(7));
    // Перевод 10:00:01 — до выезда 10:00:05: закрывает прошлый круг, не новый.
    const d = decideCredit([prev, next], "tx_prev", T("2026-09-01T10:00:01Z"));
    expect(d.kind).toBe("close");
    if (d.kind === "close") expect(d.cycle.id).toBe(prev.id);
  });

  it("два честных перевода одного номера в разных кругах — обе выдачи", () => {
    const c1 = cyc("2026-09-01T10:00:00Z", "2026-09-01T10:30:00Z", "tx_a");
    const c2 = cyc("2026-09-02T10:00:00Z", null);
    expect(decideCredit([c1, c2], "tx_b", T("2026-09-02T11:00:00Z")).kind).toBe("close");
  });
});

describe("cycleAt — круг, в котором случился перевод", () => {
  it("берёт самый поздний круг, открытый не позже перевода", () => {
    const a = cyc("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z");
    const b = cyc("2026-09-03T10:00:00Z", null);
    expect(cycleAt([a, b], T("2026-09-02T00:00:00Z"))?.id).toBe(a.id);
    expect(cycleAt([a, b], T("2026-09-04T00:00:00Z"))?.id).toBe(b.id);
    expect(cycleAt([a, b], T("2026-08-01T00:00:00Z"))).toBeNull();
  });
});

describe("hiddenForHolder — что прятать в списке «Ввести NFT»", () => {
  it("только что введённое прячем, пока индекс владения не догнал", () => {
    const c = cyc("2026-09-01T10:00:00Z", "2026-09-27T21:07:00Z");
    expect(hiddenForHolder([c], T("2026-09-25T15:48:40Z"))).toBe(true);
  });

  it("получил номер после нашего последнего ввода — показываем", () => {
    const c = cyc("2026-09-01T10:00:00Z", "2026-09-01T11:00:00Z");
    expect(hiddenForHolder([c], T("2026-09-10T00:00:00Z"))).toBe(false);
  });

  it("круг открыт — NFT снаружи, показываем", () => {
    expect(hiddenForHolder([cyc("2026-09-01T10:00:00Z", null)], T("2026-09-02T00:00:00Z"))).toBe(false);
  });

  it("кругов нет вовсе — показываем", () => {
    expect(hiddenForHolder([], T("2026-09-02T00:00:00Z"))).toBe(false);
  });
});

describe("openBinding — «это твоя выведенная фишка»", () => {
  it("привязка открытого круга вывода", () => {
    const mint = cyc("2026-08-26T21:55:51Z", null, null, bind(33665));
    expect(openBinding([mint])?.serial).toBe(33665);
  });

  it("круг закрыт — привязки нет", () => {
    const mint = cyc("2026-08-26T21:55:51Z", "2026-09-27T21:07:00Z", "tx", bind(33665));
    expect(openBinding([mint])).toBeNull();
  });
});

describe("recoveryOrder — очередь догона", () => {
  const t = (tokenId: string, atMs: number) => ({ contract: "c", tokenId, atMs, txHash: `${tokenId}@${atMs}` });

  it("номер со свежим переводом — первым, старые невыдаваемые не держат очередь", () => {
    const list = [t("old", 1), t("fresh", 100), t("mid", 50)];
    expect(recoveryOrder(list).map((c) => c.tokenId)).toEqual(["fresh", "mid", "old"]);
  });

  it("внутри номера — от старого перевода к новому, группа не рвётся", () => {
    const list = [t("a", 30), t("b", 20), t("a", 10), t("b", 5)];
    expect(recoveryOrder(list).map((c) => `${c.tokenId}${c.atMs}`)).toEqual(["a10", "a30", "b5", "b20"]);
  });

  it("пустой список — пустая очередь", () => {
    expect(recoveryOrder([])).toEqual([]);
  });
});
