// Галочки вида своего товара: зелье, магический сундук, сундук, лопата, удочка,
// карта. Не больше одной — включённая гасит остальные; то же держат сервер
// (assertOneKind и соседи в market-custom-rules) и база (kind_ok, rod_ok, map_ok).
//
// - Зелье — в сумку зелий героя, а не в рюкзак (§8.20).
// - Магический сундук — вид один: вторую галочку сервер отклонит с именем первой (§8.15).
// - Сундук — обычный сундук-склад на карте (§8.22).
// - Лопата — копать, закопать и выкопать, износ как у топора (§8.21, §8.24).
// - Удочка — рыбачить у воды, износ за поимку (§8.35).
// - Карта — целая штука у выбранного героя открывает карту мира (§8.32).

export type CustomKinds = {
  isPotion: boolean;
  magicChest: boolean;
  plainChest: boolean;
  isShovel: boolean;
  isRod: boolean;
  isMap: boolean;
};

const ROWS: ReadonlyArray<{ key: keyof CustomKinds; label: string }> = [
  { key: "isPotion", label: "Зелье — кладётся в сумку зелий, а не в рюкзак" },
  { key: "magicChest", label: "Магический сундук" },
  { key: "plainChest", label: "Сундук" },
  { key: "isShovel", label: "Лопата" },
  { key: "isRod", label: "Удочка" },
  { key: "isMap", label: "Карта" },
];

export function CustomKindChecks({
  value,
  onChange,
}: {
  value: CustomKinds;
  onChange: (next: CustomKinds) => void;
}) {
  const on = ROWS.filter((r) => value[r.key]).length;
  return (
    <>
      {ROWS.map((r) => (
        <label
          key={r.key}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            checked={value[r.key]}
            disabled={!value[r.key] && on > 0}
            onChange={(e) => onChange({ ...value, [r.key]: e.target.checked })}
            className="h-4 w-4 accent-gold"
          />
          <span>{r.label}</span>
        </label>
      ))}
    </>
  );
}
