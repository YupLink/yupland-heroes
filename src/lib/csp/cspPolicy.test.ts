// Защитный заголовок: метка в политике, наблюдение/блокировка, разбор отчёта.
import { describe, expect, it } from "vitest";
import { cspHeaderName, cspHeaders, cspPolicy, hasCsp, newNonce } from "./cspPolicy";
import { vestnikPageHtml } from "@/server/news/vestnik-page";
import { blockedOf, pageOf } from "@/routes/api.csp-report";

describe("CSP", () => {
  it("метка — каждый раз новая, в политике — она и strict-dynamic", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
    const p = cspPolicy(a);
    expect(p).toContain(`'nonce-${a}'`);
    expect(p).toContain("'strict-dynamic'");
    expect(p).toContain("object-src 'none'");
    expect(p).toContain("report-uri /api/csp-report");
  });
  it("по умолчанию — наблюдение, с CSP_ENFORCE — блокировка", () => {
    expect(cspHeaderName(false)).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(true)).toBe("Content-Security-Policy");
  });
  it("отчёт: источник — только сайт, страница — без запроса", () => {
    expect(blockedOf("https://evil.example/x.js?a=1")).toBe("https://evil.example");
    expect(blockedOf("inline")).toBe("inline");
    expect(blockedOf(undefined)).toBe("inline");
    expect(pageOf("https://service.yupland.io/castle?x=1#y")).toBe("/castle");
    expect(pageOf(undefined)).toBe("?");
  });
  it("свой заголовок страницы: общий не ставится поверх", () => {
    expect(hasCsp(new Headers(cspHeaders("n")))).toBe(true);
    expect(hasCsp(new Headers({ "content-type": "text/html" }))).toBe(false);
  });
  it("вестник: скрипт с меткой ответа", () => {
    const v = vestnikPageHtml("abc");
    expect(v).toMatch(/<script nonce="abc">/);
    expect(v).not.toMatch(/<script>/);
  });
});
