// «Докуда хватит энергии» (владелец, 25.10.2026): цель маршрута знает, сколько
// шагов оплачено. Сам поход частью пути — pathReachGo.test.ts.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathBadgeTarget } from "./usePathBadgeTarget";

const path = [
  { q: 1, r: 0, cost: 1 },
  { q: 2, r: 0, cost: 1 },
  { q: 3, r: 0, cost: 1 },
];

function Probe({ energy }: { energy: number }) {
  const t = usePathBadgeTarget({ pendingPath: path, pendingAction: null, cells: {} }, "ru", energy);
  return <b>{`${t?.reach}/${t?.steps}`}</b>;
}
const reachOf = (energy: number) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <Probe energy={energy} />
    </QueryClientProvider>,
  );

describe("цель маршрута: сколько шагов оплачено", () => {
  it("хватает на всё", () => expect(reachOf(5)).toContain("3/3"));
  it("на часть", () => expect(reachOf(2.4)).toContain("2/3"));
  it("ни на шаг", () => expect(reachOf(0.5)).toContain("0/3"));
});
