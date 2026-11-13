/** One tool cycle retains the original 500 ms cadence; five complete cycles. */
export const TOOL_STRIKE_COUNT = 5;
export const STRIKE_CYCLE_MS = 500;
export const STRIKE_CONTACT_MS = 250;
export const TOOL_ACTION_MS = TOOL_STRIKE_COUNT * STRIKE_CYCLE_MS;
export const toolStrikeTimes = () => Array.from({ length: TOOL_STRIKE_COUNT }, (_, i) => i * STRIKE_CYCLE_MS + STRIKE_CONTACT_MS);
export const heroActionDuration = (kind: string) => kind === "wood" || kind === "stone" ? TOOL_ACTION_MS : 3000;
export function heroActionFrame(kind: string, elapsed: number) {
  if (kind === "fish") return elapsed < 300 ? 0 : elapsed < 800 ? 1 : elapsed < 2300 ? 2 : 3;
  const phase = Math.max(0, elapsed) % STRIKE_CYCLE_MS;
  return phase < 100 ? 0 : phase < STRIKE_CONTACT_MS ? 1 : phase < 370 ? 2 : 3;
}
