// Крон: без ключа в окружении — закрыто, не тот ключ — 401 (аудит 11.11.2026).
import { afterEach, describe, expect, it } from "vitest";
import { cronDenied } from "./cronAuth";

const req = (auth?: string) =>
  new Request("https://x/api/cron/towns", auth ? { headers: { authorization: auth } } : {});

describe("cronDenied", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it("ключа нет в окружении — 503, а не «пускаем всех»", async () => {
    expect((await cronDenied(req()))?.status).toBe(503);
  });
  it("не тот ключ или без ключа — 401; верный — пускаем", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await cronDenied(req()))?.status).toBe(401);
    expect((await cronDenied(req("Bearer nope")))?.status).toBe(401);
    expect(await cronDenied(req("Bearer s3cret"))).toBeNull();
  });
});
