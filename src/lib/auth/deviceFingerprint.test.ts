// Слепок браузера: одинаковые части — тот же хеш, любая разница — другой.
import { describe, expect, it } from "vitest";
import {
  deviceFingerprint,
  fingerprintHash,
  fingerprintSource,
  type FingerprintParts,
} from "./deviceFingerprint";

const parts: FingerprintParts = {
  screen: "1080x2400x24",
  dpr: "2.75",
  tz: "Europe/Moscow",
  langs: "ru-RU,en",
  cores: "8",
  memory: "8",
  platform: "Linux armv8l/5",
  touch: "true",
  gpu: "ARM~Mali-G610",
  canvas: "ab12",
};

describe("слепок браузера", () => {
  it("стабилен: те же части — тот же sha-256 hex", async () => {
    const a = await fingerprintHash(parts);
    const b = await fingerprintHash({ ...parts });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
  });

  it("порядок полей во входе не важен", async () => {
    const shuffled = Object.fromEntries(Object.entries(parts).reverse()) as FingerprintParts;
    expect(fingerprintSource(shuffled)).toBe(fingerprintSource(parts));
    expect(await fingerprintHash(shuffled)).toBe(await fingerprintHash(parts));
  });

  it("другое железо — другой слепок", async () => {
    const a = await fingerprintHash(parts);
    expect(await fingerprintHash({ ...parts, gpu: "Qualcomm~Adreno 740" })).not.toBe(a);
    expect(await fingerprintHash({ ...parts, screen: "1440x3200x24" })).not.toBe(a);
  });

  it("вне браузера не падает: слепок из того, что есть", async () => {
    const fp = await deviceFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(await deviceFingerprint()).toBe(fp);
  });
});
