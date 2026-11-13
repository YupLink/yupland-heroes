// Три входа в игру (владелец, 11.11.2026, ПРАВИЛА §8.127): у каждого домена — своя
// единственная кнопка входа, отдельных страниц /tg и /near нет:
//   tg.service.yupland.io   — Telegram,
//   near.service.yupland.io — кошелёк NEAR (новый кошелёк получает аккаунт),
//   service.yupland.io      — Google (в мини-апке Telegram вход как раньше).
// Чистое правило для сервера и окон.

export type EntryKind = "google" | "tg" | "near";

export function entryForHost(host: string | null | undefined): EntryKind {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().split(":")[0];
  if (h.startsWith("tg.")) return "tg";
  if (h.startsWith("near.")) return "near";
  return "google";
}
