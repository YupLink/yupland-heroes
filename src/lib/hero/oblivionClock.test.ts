// «Забвение» по часам сервера: у телефона, чьи часы отстают, эффект гаснет
// тогда же, когда его снял сервер, — и кнопка «Забыть» (active), и значок над
// героем (buildEffectGroups), и таймер пропадания. Ответ старой сборки без
// serverNow читается как раньше.
import { describe, expect, it } from "vitest";
import { oblivionActive } from "./boostOblivion";
import { oblivionOnDevice, oblivionSkewMs, stampOblivion } from "./oblivionClock";
import { buildEffectGroups } from "@/components/beta-raid/effectGroups";

const SERVER = Date.parse("2026-09-28T12:00:00Z");
const min = (n: number) => n * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Ответ сервера: безлимит на минуту и 2 заряда со сроком на 2 минуты. */
const reply = {
  level: 0,
  until: iso(SERVER + min(1)),
  timedLevel: 2,
  timedUntil: iso(SERVER + min(2)),
  serverNow: SERVER,
};

describe("oblivionClock — сроки по часам сервера", () => {
  it("часы телефона отстают на 5 минут — эффект гаснет по серверу, а не через 5 минут", () => {
    const phone = SERVER - min(5); // телефон думает, что сейчас 11:55
    const got = stampOblivion(reply, phone - 100, phone + 100);
    expect(oblivionSkewMs(got)).toBe(-min(5));
    const s = oblivionOnDevice(got);
    // Через 61 с по телефону безлимит кончился (на сервере — тоже 61 с спустя).
    expect(Date.parse(s.until!)).toBe(phone + min(1));
    expect(oblivionActive(s, phone + 30_000)).toBe(true);
    // Через 2 мин 1 с кончилось всё: «Забыть» пропала.
    expect(oblivionActive(s, phone + min(2) + 1000)).toBe(false);
    // Без поправки телефон держал бы кнопку ещё почти пять минут.
    expect(oblivionActive(oblivionOnDevice(reply), phone + min(2) + 1000)).toBe(true);
  });

  it("часы телефона спешат — эффект не обрывается раньше срока", () => {
    const phone = SERVER + min(10);
    const s = oblivionOnDevice(stampOblivion(reply, phone, phone));
    expect(oblivionActive(s, phone + 50_000)).toBe(true);
    expect(oblivionActive(s, phone + min(2) + 1000)).toBe(false);
  });

  it("значок над героем гаснет в тот же миг, что и кнопка", () => {
    const phone = SERVER - min(3);
    const s = oblivionOnDevice(stampOblivion(reply, phone, phone));
    const at = (t: number) =>
      buildEffectGroups({ chips: [], slow: null, weaken: [], buff: [], oblivion: s, now: t }).map(
        (g) => g.key,
      );
    expect(at(phone + 30_000)).toEqual(["oblivion_time", "oblivion_lvt"]);
    expect(at(phone + min(1) + 1000)).toEqual(["oblivion_lvt"]);
    expect(at(phone + min(2) + 1000)).toEqual([]);
  });

  it("вечные заряды часов не касаются", () => {
    const s = oblivionOnDevice({ level: 3, until: null, serverNow: SERVER, clientAt: 1 });
    expect(s.level).toBe(3);
    expect(oblivionActive(s, 0)).toBe(true);
  });

  it("ответ старой сборки или мусор — без сдвига, экран жив", () => {
    const old = { level: 0, until: reply.until, timedLevel: 0, timedUntil: null };
    expect(oblivionSkewMs(old)).toBe(0);
    expect(oblivionOnDevice(old).until).toBe(reply.until);
    expect(oblivionSkewMs({ ...old, serverNow: "мусор", clientAt: SERVER })).toBe(0);
    expect(oblivionOnDevice("мусор")).toEqual({
      level: 0,
      until: null,
      timedLevel: 0,
      timedUntil: null,
    });
  });

  it("метка получения — середина запроса", () => {
    expect(stampOblivion({ a: 1 }, 1000, 1400)).toEqual({ a: 1, clientAt: 1200 });
  });
});
