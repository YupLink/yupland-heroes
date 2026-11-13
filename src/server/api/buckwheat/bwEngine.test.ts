// Движок Кайлани на сервере: партия по зерну и ходам повторяется один в один,
// браузер не получает генератор, финал и выплата — в том же ответе, что последний
// ход. Код движка приходит из репозитория Кайлани сам (minigames/README.md): каждая версия —
// в архиве engines/ под своим отпечатком, деньги (вход и корона) — закреплены здесь.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  canSwap,
  createGame,
  type Game,
} from "../../../../minigames/buckwheat/src/engine.mjs";
import { CURRENT_ENGINE, ENGINES } from "./engines";
import {
  GAME_ID_RE,
  LEGACY_ENGINE,
  entryGold,
  moveRandom,
  newGameId,
  replay,
  rulesOf,
  settleNow,
  stateOf,
  step,
  toCell,
  type Move,
} from "./bwEngine";

const fingerprint = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 12);

/** Первый допустимый ход на поле (детерминированно). */
function anyMove(g: Game, skip = 0): Move | null {
  const found: Move[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [r2, c2] of [
        [r, c + 1],
        [r + 1, c],
      ])
        if (r2 < ROWS && c2 < COLS && canSwap(g.board, { row: r, col: c }, { row: r2, col: c2 }))
          found.push([r, c, r2, c2]);
  return found.length ? found[skip % found.length] : null;
}

const SALT = "5a".repeat(32);

/** Сыграть партию до конца так же, как сервер: каждый ход — переигрывание с начала. */
function playOut(seed: number, salt = SALT) {
  const moves: Move[] = [];
  let last = null as ReturnType<typeof step> | null;
  for (let i = 0; i < 60 && !last?.settlement; i++) {
    const g = replay(seed, salt, moves);
    const m = anyMove(g, moves.length * 7 + seed);
    if (!m) break;
    last = step(g, toCell(m[0], m[1]), toCell(m[2], m[3]));
    expect(last.valid).toBe(true);
    moves.push(m);
  }
  return { moves, last: last! };
}

describe("движок «Короны гречневого королевства» на сервере", () => {
  it("правила сервера — код Кайлани из minigames; каждая версия архива — под своим отпечатком", () => {
    expect(fingerprint(resolve(__dirname, "../../../../minigames/buckwheat/src/engine.mjs"))).toBe(
      CURRENT_ENGINE,
    );
    const dir = resolve(__dirname, "engines");
    const files = readdirSync(dir).filter((f) => f.endsWith(".mjs"));
    for (const f of files) expect(fingerprint(resolve(dir, f))).toBe(f.slice(0, 12));
    expect(Object.keys(ENGINES).sort()).toEqual(files.map((f) => f.slice(0, 12)).sort());
    expect(ENGINES[LEGACY_ENGINE]).toBeDefined();
  });

  it("деньги — слово владельца: вход 100, корона 50 (поменялись в коде Кайлани — не выкатится)", () => {
    expect(entryGold()).toBe(100);
    for (const crowns of [0, 1, 2, 3]) {
      const g = createGame(1);
      g.crowns = crowns;
      expect(settleNow(g)).toMatchObject({ entry: 100, returned: 50 * crowns });
    }
  });

  it("партия доигрывается по правилам, с которыми начата", () => {
    expect(rulesOf("bw_abc-_9")).toBe(ENGINES[LEGACY_ENGINE]);
    const id = newGameId("abc-_9");
    expect(id).toBe(`bw_abc-_9.${CURRENT_ENGINE}`);
    expect(rulesOf(id)).toBe(ENGINES[CURRENT_ENGINE]);
    // Ручки принимают и новый номер, и прежний (11.11: новый не проходил проверку — ходы падали).
    expect(GAME_ID_RE.test(newGameId("feEponI0MeCpjwJ-"))).toBe(true);
    expect(GAME_ID_RE.test("bw_M1Xg2fx1Ixh21_GL")).toBe(true);
    expect(GAME_ID_RE.test("bw_M1Xg2fx1Ixh21_GL.zz")).toBe(false);
    expect(() => rulesOf("bw_abc.000000000000")).toThrow("bw.engine");
  });

  it("зерно задаёт раскладку: разные зёрна — разные поля, одно зерно — одно поле", () => {
    expect(createGame(11).board).toEqual(createGame(11).board);
    expect(createGame(11).board).not.toEqual(createGame(12).board);
  });

  it("переигрывание по ходам даёт ту же партию", () => {
    for (const seed of [3, 77, 1234567]) {
      const { moves, last } = playOut(seed);
      expect(stateOf(replay(seed, SALT, moves))).toEqual(last.state);
    }
  });

  it("случайность ходов — из соли: поле по зерну то же, падающие фишки другие", () => {
    expect(replay(8, "a".repeat(64), []).board).toEqual(createGame(8).board);
    const m = anyMove(createGame(8))!;
    const a = step(replay(8, "a".repeat(64), []), toCell(m[0], m[1]), toCell(m[2], m[3]));
    const b = step(replay(8, "b".repeat(64), []), toCell(m[0], m[1]), toCell(m[2], m[3]));
    const plain = createGame(8);
    step(plain, toCell(m[0], m[1]), toCell(m[2], m[3]));
    expect(a.state.board).not.toEqual(b.state.board);
    expect(a.state.board).not.toEqual(stateOf(plain).board);
    expect(moveRandom("c".repeat(64), 3)()).toBe(moveRandom("c".repeat(64), 3)());
    expect(() => moveRandom("", 0)).toThrow("bw.no_salt");
  });

  it("последний ход приносит финал и расчёт; вход — из правил игры", () => {
    const { last } = playOut(5);
    expect(last.finale).not.toBeNull();
    expect(last.settlement?.entry).toBe(entryGold());
    expect(last.settlement?.returned).toBe(last.finale!.state.crowns * 50);
    expect(last.finale?.state.moves).toBe(0);
  });

  it("неверный ход ничего не меняет и не тратит ход", () => {
    const g = createGame(9);
    const before = stateOf(g);
    const res = step(g, toCell(0, 2), toCell(5, 5));
    expect(res.valid).toBe(false);
    expect(stateOf(g)).toEqual(before);
  });

  it("чужой записанный ход при переигрывании — ошибка, а не тихая подмена", () => {
    expect(() => replay(9, SALT, [[0, 2, 5, 5]])).toThrow("bw.replay");
    expect(() => toCell(-1, 0)).toThrow("bw.bad_move");
    expect(() => toCell(ROWS, 0)).toThrow("bw.bad_move");
    expect(() => toCell(1.5, 0)).toThrow("bw.bad_move");
  });

  it("браузер не получает генератор; всё — чистый JSON", () => {
    const g = createGame(21);
    const m = anyMove(g)!;
    const res = step(g, toCell(m[0], m[1]), toCell(m[2], m[3]));
    expect(Object.keys(res.state)).not.toContain("random");
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  });

  it("«Выйти» посреди партии: выплата за опущенные короны", () => {
    const g = createGame(4);
    g.crowns = 2;
    expect(settleNow(g)).toMatchObject({ returned: 100, net: 0 });
  });
});
