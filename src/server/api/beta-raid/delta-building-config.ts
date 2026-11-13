// Настройки постройки клетки в дельте карты — только её эффект.
//
// Клиенту из настроек нужна ровно отметка шахты (packedMines.mineAfterPatch:
// эффект клетки → эффект шаблона → имя). Остальное — награды, цели порталов,
// цены — снимок карты игрокам не отдаёт, и дельта не должна отдавать тоже.

/**
 * `null` — настроек нет (решает шаблон); `{}` — настройки есть, но без своего
 * эффекта (тоже решает шаблон); `{ effect }` — эффект, назначенный клетке.
 */
export function deltaBuildingConfig(cfg: unknown): Record<string, unknown> | null {
  let obj = cfg;
  // jsonb из базы может приехать строкой — разбираем, мусор считаем «нет настроек».
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj) as unknown;
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const effect = (obj as { effect?: unknown }).effect;
  return typeof effect === "string" && effect ? { effect } : {};
}
