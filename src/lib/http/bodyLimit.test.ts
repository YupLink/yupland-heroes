import { describe, expect, it } from "vitest";
import { BODY_LIMIT, UPLOAD_BODY_LIMIT, oversizedBody } from "@/lib/http/bodyLimit";

const h = (init: Record<string, string>) => new Headers(init);
const status = (r: Response | null) => r?.status ?? null;

describe("oversizedBody", () => {
  it("пропускает запросы без тела", () => {
    expect(oversizedBody("GET", "/_serverFn/x", h({ "content-length": "999999999" }))).toBeNull();
    expect(oversizedBody("HEAD", "/", h({}))).toBeNull();
  });

  it("обычный порог 1 МБ", () => {
    expect(
      oversizedBody("POST", "/_serverFn/x", h({ "content-length": String(BODY_LIMIT) })),
    ).toBeNull();
    expect(
      status(
        oversizedBody("POST", "/_serverFn/x", h({ "content-length": String(BODY_LIMIT + 1) })),
      ),
    ).toBe(413);
    expect(
      status(oversizedBody("post", "/api/tg-webhook", h({ "content-length": "5000000" }))),
    ).toBe(413);
  });

  it("загрузка картинок — 10 МБ", () => {
    expect(
      oversizedBody("POST", "/api/upload", h({ "content-length": String(8 * 1024 * 1024) })),
    ).toBeNull();
    expect(
      status(
        oversizedBody(
          "POST",
          "/api/upload",
          h({ "content-length": String(UPLOAD_BODY_LIMIT + 1) }),
        ),
      ),
    ).toBe(413);
    expect(status(oversizedBody("POST", "/api/upload/x", h({ "content-length": "2000000" })))).toBe(
      413,
    );
  });

  it("тело без длины — отказ, пустой POST — пропуск", () => {
    expect(
      status(oversizedBody("POST", "/_serverFn/x", h({ "transfer-encoding": "chunked" }))),
    ).toBe(411);
    expect(oversizedBody("POST", "/_serverFn/x", h({}))).toBeNull();
  });

  it("кривая длина — 400", () => {
    expect(status(oversizedBody("PUT", "/x", h({ "content-length": "abc" })))).toBe(400);
  });
});
