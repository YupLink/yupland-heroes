// Вид жилы в форме товара лавки (lib/veinPlace): золото или алмазы — выбором из
// списка, а не текстом (правило админки: конечный выбор — только список).
import { VEIN_KINDS, VEIN_NAME_RU, isVeinKind, type VeinKind } from "@/lib/veinPlace";

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function VeinKindSelect({
  value,
  onPick,
}: {
  /** ref позиции; не вид жилы (старый черновик) — показываем золото. */
  value: string | null;
  onPick: (kind: VeinKind) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Вид жилы</span>
      <select
        value={isVeinKind(value) ? value : "gold"}
        onChange={(e) => {
          if (isVeinKind(e.target.value)) onPick(e.target.value);
        }}
        className={inp}
      >
        {VEIN_KINDS.map((k) => (
          <option key={k} value={k}>
            {VEIN_NAME_RU[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
