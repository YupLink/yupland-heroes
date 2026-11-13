// «Отбитые» (владелец 04.11.2026, §8.106): потери шахт и грибов за 7 дней —
// что случилось, мир и клетка, когда. Булавка — то же окно «Показать на
// карте», что у своей шахты (в другом мире оно так и скажет).
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useT } from "@/lib/i18n";
import { lostCore } from "@/lib/mineLost";
import type { MineNotice } from "@/lib/mineNotice";
import { MINE_OFFICE_KEY } from "@/lib/mineOfficeBus";
import { getOfficeLost } from "@/server/api/mine-office/mine-office-lost";
import { Resource } from "../mine-buildings/Art";
import { kinds, tr, type Kind, type Lang } from "../mine-buildings/presentation";
import { lostWhen } from "./lostWhen";
import "./office-lost.css";

export type MapSpot = { mapId: string; place: string | null; q: number; r: number };

function LostRow({ n, l, onMap }: { n: MineNotice; l: Lang; onMap: (s: MapSpot) => void }) {
  const t = useT();
  const kind = (kinds as readonly string[]).includes(n.resource ?? "") ? (n.resource as Kind) : null;
  const place = `${n.world ? `${n.world} · ` : ""}${n.q}, ${n.r}`;
  return (
    <article className="mb-lost-row">
      {kind ? <Resource kind={kind} decorative /> : <span className="mb-lost-dot" aria-hidden />}
      <div className="mb-lost-text">
        <h3>{lostCore(t, { kind: n.kind, mushroom: n.mushroom, resource: n.resource ?? undefined })}</h3>
        <p>
          {place} · {lostWhen(n.at, l)}
        </p>
      </div>
      <button
        type="button"
        className="mb-lost-map"
        aria-label={tr(l, `Показать карту: ${place}`, `Show map: ${place}`)}
        onClick={() => onMap({ mapId: n.mapId, place: n.world, q: n.q, r: n.r })}
      >
        <MapPin size={18} />
      </button>
    </article>
  );
}

export function OfficeLost({ l, onMap }: { l: Lang; onMap: (s: MapSpot) => void }) {
  const q = useQuery({
    queryKey: [...MINE_OFFICE_KEY, "lost"],
    queryFn: () => getOfficeLost(),
    staleTime: 30_000,
  });
  if (q.isPending)
    return (
      <div className="mb-empty" role="status">
        <Loader2 className="mb-spin" />
      </div>
    );
  if (q.isError)
    return (
      <div className="mb-empty" role="alert">
        <button className="mb-outline" onClick={() => q.refetch()}>
          {tr(l, "Повторить", "Retry")}
        </button>
      </div>
    );
  const lost = q.data?.lost ?? [];
  if (!lost.length)
    return <div className="mb-empty">{tr(l, "За 7 дней потерь нет", "No losses in 7 days")}</div>;
  return (
    <div className="mb-lost-list">
      {lost.map((n) => (
        <LostRow key={n.id} n={n} l={l} onMap={onMap} />
      ))}
    </div>
  );
}
