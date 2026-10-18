// Зерно заброса (аудит 14.10, п.3): исход привязан к аккаунту и самому забросу
// (соль строки рыбалки). Чужой «уловистый» ключ у сборщика бросает по-новому;
// строки, начатые до соли, ловят по старой формуле — их исход не меняется.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad } from "@scure/base";
import { fishHit, hitOffsets } from "@/lib/raid/fishing";
import { fishSeed, seedMessage } from "./fishing-seed";

const SECRET = "test-secret-of-enough-length";
beforeAll(() => void vi.stubEnv("SESSION_SECRET", SECRET));
afterAll(() => void vi.unstubAllEnvs());

/** Зерно по формуле до 14.10: HMAC только от ключа нажатия. */
const legacy = (op: string): string => {
  const enc = new TextEncoder();
  const key = enc.encode(SECRET);
  return base64urlnopad.encode(hmac(sha256, key, enc.encode(`fish-seed:${op}`)));
};

describe("зерно заброса", () => {
  it("тот же op у другого аккаунта — другое зерно и другой исход", () => {
    const op = "mv7vrb2t6wikolyj64vk6nv9";
    const [a, b] = [fishSeed("acc_scout", op, "s1"), fishSeed("acc_taker", op, "s1")];
    expect(a).not.toBe(b);
    expect(hitOffsets(a, 1, 200, 50)).not.toEqual(hitOffsets(b, 1, 200, 50));
  });

  it("разведчик с рыбой на 1-й попытке ничего не подсказывает сборщику", () => {
    // Тысяча ключей при 10 %: у разведчика рыба примерно в сотне; повтори их
    // сборщик — у него рыба лишь там, где выпал его собственный шанс (~10 %).
    let [scout, both] = [0, 0];
    for (let i = 0; i < 1000; i++) {
      const op = `cast-${i}-x`;
      if (!fishHit(fishSeed("acc_scout", op, `salt-a-${i}`), 1, 10)) continue;
      scout++;
      if (fishHit(fishSeed("acc_taker", op, `salt-b-${i}`), 1, 10)) both++;
    }
    expect(scout).toBeGreaterThan(60);
    expect(both).toBeLessThan(scout / 3);
  });

  it("тот же аккаунт и op, новая соль (новый заброс) — бросает по-новому", () => {
    const op = "press-1-x";
    expect(fishSeed("acc1", op, "s1")).toBe(fishSeed("acc1", op, "s1"));
    expect(fishSeed("acc1", op, "s1")).not.toBe(fishSeed("acc1", op, "s2"));
  });

  it("строка без соли — прежняя формула, аккаунт в ней не участвует", () => {
    for (const op of ["press-1-x", "mv86rz8akkrnofb4vj7dczem"]) {
      expect(fishSeed("acc1", op, null)).toBe(legacy(op));
      expect(fishSeed("acc2", op, null)).toBe(legacy(op));
    }
    expect(seedMessage("acc1", "op1", null)).toBe("fish-seed:op1");
    expect(seedMessage("acc1", "op1", "")).toBe("fish-seed:op1");
    expect(seedMessage("acc1", "op1", "s")).toBe("fish-seed:acc1:op1:s");
  });
});
