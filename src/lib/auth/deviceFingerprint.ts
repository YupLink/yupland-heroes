// «Слепок» браузера для журнала Google-входов (владелец, 29.10.2026: пока только
// ЗАПИСЫВАЕМ, правил против ферм ещё нет).
//
// Id устройства из localStorage умирает в анонимной вкладке и в другом браузере;
// слепок собран из того, что у того же железа обычно то же: экран, часовой пояс,
// языки, ядра и память, платформа, видеокарта (WebGL) и маленький canvas-рисунок.
// На выходе — sha-256 hex от строки частей в постоянном порядке. Каждое чтение в
// try/catch: чего браузер не дал, то идёт пустой строкой, слепок всё равно есть.

export type FingerprintParts = {
  screen: string;
  dpr: string;
  tz: string;
  langs: string;
  cores: string;
  memory: string;
  platform: string;
  touch: string;
  gpu: string;
  canvas: string;
};

const ORDER: Array<keyof FingerprintParts> = [
  "screen",
  "dpr",
  "tz",
  "langs",
  "cores",
  "memory",
  "platform",
  "touch",
  "gpu",
  "canvas",
];

/** Строка частей в постоянном порядке: одинаковые части — одинаковая строка. */
export function fingerprintSource(p: FingerprintParts): string {
  return ORDER.map((k) => `${k}=${p[k] ?? ""}`).join("|");
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fingerprintHash(p: FingerprintParts): Promise<string> {
  return sha256Hex(fingerprintSource(p));
}

function safe(read: () => unknown): string {
  try {
    const v = read();
    return v == null ? "" : String(v);
  } catch {
    return "";
  }
}

type Nav = Navigator & { deviceMemory?: number };

function gpuName(): string {
  return safe(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return "";
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as unknown;
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as unknown;
    return `${String(vendor ?? "")}~${String(renderer ?? "")}`;
  });
}

/** Маленький рисунок: шрифты и сглаживание у разного железа рисуют его по-разному. */
function canvasPicture(): string {
  return safe(() => {
    const c = document.createElement("canvas");
    c.width = 120;
    c.height = 24;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#f60";
    ctx.fillRect(2, 2, 60, 18);
    ctx.fillStyle = "#069";
    ctx.font = "14px Arial";
    ctx.fillText("YupLand ✓ 1.5", 4, 4);
    ctx.strokeStyle = "rgba(120, 40, 200, 0.7)";
    ctx.beginPath();
    ctx.arc(96, 12, 9, 0, Math.PI * 2);
    ctx.stroke();
    return c.toDataURL();
  });
}

/** Части слепка этого браузера; вне браузера — пустые строки. */
export async function collectFingerprintParts(): Promise<FingerprintParts> {
  const nav = (typeof navigator === "undefined" ? undefined : navigator) as Nav | undefined;
  const hasDom = typeof window !== "undefined" && typeof document !== "undefined";
  const picture = hasDom ? canvasPicture() : "";
  return {
    screen: hasDom
      ? safe(() => `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`)
      : "",
    dpr: hasDom ? safe(() => window.devicePixelRatio) : "",
    tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    langs: safe(() => (nav?.languages ?? []).join(",")),
    cores: safe(() => nav?.hardwareConcurrency),
    memory: safe(() => nav?.deviceMemory),
    platform: safe(() => (nav ? `${nav.platform}/${nav.maxTouchPoints}` : "")),
    touch: hasDom ? safe(() => "ontouchstart" in window) : "",
    gpu: hasDom ? gpuName() : "",
    canvas: picture ? await sha256Hex(picture).catch(() => "") : "",
  };
}

/** sha-256 hex слепка; не вышло вовсе — null (вход от него не зависит). */
export async function deviceFingerprint(): Promise<string | null> {
  try {
    return await fingerprintHash(await collectFingerprintParts());
  } catch {
    return null;
  }
}
