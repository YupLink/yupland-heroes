// Лог боя для окна: длинный бой сжимаем до первых и последних раундов.
// Вынесено из encounter-attack.ts (лимит размера файла, §13.1).

/** Сколько раундов лога показываем с каждого края длинного боя. */
const LOG_EDGE = 40;

/** Длинный бой сжимаем: первые и последние раунды, середина не нужна. */
export function trimFightLog<T>(log: T[]): T[] {
  if (log.length <= LOG_EDGE * 2) return log;
  return [...log.slice(0, LOG_EDGE), ...log.slice(-LOG_EDGE)];
}
