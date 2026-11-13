// Id устройства для журнала Google-входов (владелец, 29.10.2026): случайная строка
// в localStorage `gd_device`, заводится при первом обращении. Хранилище закрыто
// (анонимка, запрет сайта) — id живёт до закрытия вкладки.
const KEY = "gd_device";
const VALID = /^[A-Za-z0-9_-]{8,64}$/;

let memo: string | null = null;

function freshId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && VALID.test(saved)) return saved;
    const id = memo ?? freshId();
    localStorage.setItem(KEY, id);
    memo = id;
    return id;
  } catch {
    memo ??= freshId();
    return memo;
  }
}
