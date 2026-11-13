// Голос в лаборатории (§8.81) — наш транскрибатор на сервере (владелец 29.10:
// «никакого клаудфлара на расшифровку — мы установили транскрибатор на сервак,
// через него рули всё»). Служба yuplink-asr: faster-whisper Скрайба,
// large-v3-turbo на CPU, за файл-сокетом в каталоге игры — каталог примонтирован
// в контейнер, в сеть служба не торчит. Замер 29.10: фраза в 3 с — ~6 с
// (первая после перезапуска службы — ~11 с: грузится модель).
import { request } from "node:http";

export type Heard = { ok: true; text: string } | { ok: false; why: string };

const SOCKET = process.env.ASR_SOCKET ?? "/opt/golden-drop/.run/asr.sock";

export function serverTranscribe(
  audio: Buffer,
  lang: "ru" | "en",
  socket = SOCKET,
): Promise<Heard> {
  const token = process.env.ASR_TOKEN;
  if (!token) return Promise.resolve({ ok: false, why: "no token" });
  return new Promise((resolve) => {
    const req = request(
      {
        socketPath: socket,
        path: `/transcribe?lang=${lang}`,
        method: "POST",
        headers: {
          "X-Asr-Token": token,
          "Content-Type": "application/octet-stream",
          "Content-Length": audio.length,
        },
        timeout: 45_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (body += c));
        res.on("end", () => {
          let text = "";
          try {
            text = String((JSON.parse(body) as { text?: unknown }).text ?? "").trim();
          } catch {
            // ответ не JSON — ниже «не расслышал»
          }
          resolve(
            res.statusCode === 200 && text
              ? { ok: true, text }
              : { ok: false, why: `asr ${res.statusCode}` },
          );
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, why: e.message }));
    req.end(audio);
  });
}
