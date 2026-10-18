// Единственный источник правды: что мы вообще имеем право отправлять НА адрес.
//
// В системе игрока могут держать под внутренним «кошельком» вида tg<telegram_id>
// (пока у него не привязан настоящий адрес). Такой идентификатор — НЕ NEAR-account:
// в цепи его нет, `ft_transfer` уходит на пустое место, средства оседают на балансе
// контракта, а игрок обоснованно жалуется, что «не дошло».
//
// Валидные для реального вывода — только три формы:
//   1. implicit-адрес: ровно 64 hex-символа
//   2. named-account с окончанием ".tg" (наш sponsored-namespace)
//   3. named-account с окончанием ".near"
export function isValidNearAccountForPayout(raw: string | null | undefined): boolean {
  const a = (raw ?? "").trim().toLowerCase();
  if (!a) return false;
  // Implicit-адрес.
  if (/^[0-9a-f]{64}$/.test(a)) return true;
  // Named-account. Общая проверка NEAR: 2..64, только [a-z0-9_-.], сегменты
  // между точками не пустые, начинаются и кончаются на буквоцифру.
  if (a.length < 2 || a.length > 64) return false;
  const parts = a.split(".");
  if (parts.length < 2) return false;
  for (const p of parts) {
    if (!/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(p)) return false;
  }
  const tld = parts[parts.length - 1];
  if (tld !== "tg" && tld !== "near") return false;
  return true;
}
