// «Снятие иммунитетов» на экране: значок над героем — только таймер, без
// числа; подписи ru+en из словаря; свой значок (перечёркнутый щит).
import { describe, expect, it } from "vitest";
import { ShieldOff } from "lucide-react";
import { buildEffectGroups } from "./effectGroups";
import { effectDetail, effectMeta, type TFn } from "./effectMeta";
import { dict } from "@/lib/translations/braid-strip";

const now = Date.parse("2026-10-22T00:00:00Z");
const later = (min: number) => new Date(now + min * 60_000).toISOString();
const tOf =
  (lang: "ru" | "en"): TFn =>
  (key, params) => {
    let s = dict[key]?.[lang] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) s = s.replace(`{${k}}`, String(v));
    return s;
  };

describe("снятие иммунитетов в HUD и подписях", () => {
  it("значок над героем: таймер и источник, без «−1»; истёкшее не рисуем", () => {
    const base = { chips: [], slow: null, buff: [], now };
    const strip = { kind: "strip_immune", value: 1, expiresAt: later(12), source: "Лич" };
    expect(buildEffectGroups({ ...base, weaken: [strip] })).toEqual([
      { key: "strip_immune", badge: null, until: later(12), items: [], source: "Лич" },
    ]);
    const gone = { ...strip, expiresAt: later(-1) };
    expect(buildEffectGroups({ ...base, weaken: [gone] })).toEqual([]);
  });

  it("подпись и значок — ru и en, свой перечёркнутый щит", () => {
    const ru = effectMeta("strip_immune", tOf("ru"));
    expect(ru.label).toBe("Снятие иммунитетов");
    expect(ru.Icon).toBe(ShieldOff);
    expect(effectMeta("strip_immune", tOf("en")).label).toBe("Strip immunities");
    // Без перевода (серверная подпись) — по-русски, как остальные способности.
    expect(effectMeta("strip_immune").label).toBe("Снятие иммунитетов");
  });

  it("строка опасности на карточке цели — без силы, с минутами админа", () => {
    const t: TFn = (key, params) =>
      key === "braid.dur_min" ? ` · ${params?.n} min` : tOf("en")(key, params);
    const a = { kind: "strip_immune", chance: 10, value: 0, duration: "5-10" };
    expect(effectDetail(a, t)).toBe("Hero immunities don't work · 5-10 min");
  });

  it("в словаре есть обе локали у каждого ключа", () => {
    for (const e of Object.values(dict)) {
      expect(e.ru).toBeTruthy();
      expect(e.en).toBeTruthy();
    }
  });
});
