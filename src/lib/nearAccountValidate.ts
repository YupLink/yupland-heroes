// Клиентская копия серверного валидатора (server/api/near-account-validate.ts).
// Дублировать модуль на клиенте, а не тянуть серверный — по правилу проекта
// «серверный модуль не едет в бандл». Формулу держим ту же дословно, чтобы
// клиентский UI и серверный гейт не расходились.
//
// Три и только три валидных формы:
//   1. implicit-адрес: ровно 64 hex-символа
//   2. named-account с окончанием ".tg"
//   3. named-account с окончанием ".near"
export function isValidNearAccountForPayout(raw: string | null | undefined): boolean {
  const a = (raw ?? "").trim().toLowerCase();
  if (!a) return false;
  if (/^[0-9a-f]{64}$/.test(a)) return true;
  if (a.length < 2 || a.length > 64) return false;
  const parts = a.split(".");
  if (parts.length < 2) return false;
  for (const p of parts) {
    if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(p)) return false;
  }
  const tld = parts[parts.length - 1];
  return tld === "tg" || tld === "near";
}
