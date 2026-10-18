// Диапазон уровней боссов для восстановления: «1-10».
//
// Карту размечают боссами разных уровней, и оживлять их приходится не всех
// разом: нижние — на каждый тест, верхние — раз в неделю. Уровень лежит
// отдельной колонкой шаблона, так что отобрать по нему можно прямо здесь.
//
// Пусто — восстанавливаются все боссы, как было до этого поля.

/** Разбор «1-10», «5 - 20», «7» и мусора. Пусто/непонятно — без ограничения. */
export function parseLevelRange(raw: string): { from?: number; to?: number } {
  const nums = raw.match(/\d+/g);
  if (!nums || nums.length === 0) return {};
  const clamp = (n: number) => Math.min(100, Math.max(1, n));
  const a = clamp(Number(nums[0]));
  // Одно число — точный уровень, а не «от сих и до конца»: «5» в поле
  // диапазона читается как «пятые», и оживлять заодно сотые было бы сюрпризом.
  const b = nums[1] === undefined ? a : clamp(Number(nums[1]));
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

export function AdminBossLevelRange({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const range = parseLevelRange(value);
  return (
    <label
      className="inline-flex items-center gap-1.5"
      title="Диапазон уровней: 1-10 вернёт боссов с 1 по 10 уровень. Пусто — все"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Ур. боссов
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="1-10"
        inputMode="numeric"
        maxLength={7}
        className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-[11px]"
      />
      {/* Пока поле пустое, подписью служит сам пример: «1-10» в placeholder плюс
          напоминание, что пустое поле — это все боссы. Иначе диапазон легко
          принять за обязательный. */}
      <span className="text-[10px] text-gold">
        {range.from === undefined
          ? "все"
          : range.from === range.to
            ? `${range.from} lv`
            : `${range.from}–${range.to} lv`}
      </span>
    </label>
  );
}
