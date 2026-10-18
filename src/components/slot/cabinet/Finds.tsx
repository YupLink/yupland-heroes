import { findKind, SUPER_PRIZE } from "@/lib/slot/bonus";
import type { SlotState } from "@/lib/slot/state";
import { num, text } from "./shared";

export const findName = (kind: string, ru: boolean) =>
  ({
    bag: text(ru, "Маленький мешочек", "Small bag"),
    chest: text(ru, "Маленький сундук", "Small chest"),
    magic: text(ru, "Большой сундук", "Large chest"),
    trap: text(ru, "Капкан", "Trap"),
    bear: text(ru, "Медведь", "Bear"),
  })[kind] ?? "";
export function FindArt({
  kind,
  className = "",
}: {
  kind: string;
  className?: string;
}) {
  return (
    <span
      className={"find-art find-" + kind + " " + className}
      aria-hidden="true"
    />
  );
}
export function Finds({
  state,
  ru,
  excludeLast = false,
}: {
  state: SlotState;
  ru: boolean;
  excludeLast?: boolean;
}) {
  const values = (state.bonus?.picks ?? [])
    .map((col, row) => state.bonus!.board[row][col])
    .filter((v) => v > 0)
    .map((v) => ({ kind: findKind(v), amount: v * state.bonusStake }));
  const caves = state.superGame?.step ?? 0;
  for (let i = 0; i < caves; i++)
    values.push({ kind: "magic", amount: SUPER_PRIZE * state.bonusStake });
  const all = values.slice();
  if (excludeLast) values.pop();
  if (!all.length) return null;
  return (
    <div
      className="bonus-finds"
      style={{ visibility: values.length ? "visible" : "hidden" }}
    >
      <div className="finds-total">
        <span>{text(ru, "Найдено", "Collected")}</span>
        <strong>
          {num(
            values.reduce((s, v) => s + v.amount, 0),
            ru,
          )}
        </strong>
      </div>
      <div className="finds-piles">
        {["bag", "chest", "magic"].map((kind) => {
          const items = values.filter((v) => v.kind === kind);
          return all.some((v) => v.kind === kind) ? (
            <div
              className="finds-pile"
              data-find-kind={kind}
              style={{ visibility: items.length ? "visible" : "hidden" }}
              key={kind}
              aria-label={findName(kind, ru) + ": " + items.length}
            >
              <div className="finds-stack">
                {items.slice(0, 3).map((_, i) => (
                  <FindArt
                    key={i}
                    kind={kind}
                    className={"stack-item stack-" + i}
                  />
                ))}
              </div>
              <span className="finds-count">×{items.length}</span>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}
