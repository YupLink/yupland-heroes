// Голос через наш транскрибатор: запрос на файл-сокет с токеном, текст из ответа.
import { createServer, type Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { serverTranscribe } from "./serverAsr";

let server: Server;
let sock: string;
let seen: { token?: string; lang?: string; bytes: number };

function listen(reply: (res: import("node:http").ServerResponse) => void) {
  sock = join(mkdtempSync(join(tmpdir(), "asr-")), "asr.sock");
  server = createServer((req, res) => {
    let n = 0;
    req.on("data", (c: Buffer) => (n += c.length));
    req.on("end", () => {
      seen = {
        token: req.headers["x-asr-token"] as string,
        lang: req.url?.split("lang=")[1],
        bytes: n,
      };
      reply(res);
    });
  });
  return new Promise<void>((r) => server.listen(sock, r));
}

describe("наш транскрибатор", () => {
  beforeEach(() => {
    process.env.ASR_TOKEN = "tok";
  });
  afterEach(async () => {
    delete process.env.ASR_TOKEN;
    await new Promise((r) => server?.close(r));
  });

  it("отдаёт запись с токеном и языком, берёт текст", async () => {
    await listen((res) => res.end(JSON.stringify({ text: " Хочу наручи. " })));
    const r = await serverTranscribe(Buffer.from("abcdef"), "ru", sock);
    expect(r).toEqual({ ok: true, text: "Хочу наручи." });
    expect(seen).toEqual({ token: "tok", lang: "ru", bytes: 6 });
  });

  it("отказ службы или пустой текст — не расслышал", async () => {
    await listen((res) => {
      res.statusCode = 401;
      res.end("{}");
    });
    expect((await serverTranscribe(Buffer.from("x"), "ru", sock)).ok).toBe(false);
  });

  it("службы нет — не расслышал, а не падение", async () => {
    await listen((res) => res.end("{}"));
    expect((await serverTranscribe(Buffer.from("x"), "en", "/nope/asr.sock")).ok).toBe(false);
  });
});
