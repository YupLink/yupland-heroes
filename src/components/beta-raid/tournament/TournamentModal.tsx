// Окно постройки «Турнир» (Арена): полки «Идут / Скоро / Прошлые».
//
// Плашка — весь турнир одним блоком (владелец, 05.10.2026): запись, моё место
// и, раскрытая, — участники, условия и призы. Раскрыта не больше одной
// плашки за раз (openId). Пока окно открыто — обновление раз в 30 с.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import { useT } from "@/lib/i18n";
import { errText } from "@/lib/tournament/errText";
import { getTourPlates } from "@/server/api/tournament/tour-read";
import type { TourPlate } from "@/lib/tournament/types";
import { HudModal } from "../hud/HudModal";
import { TourPlateCard } from "./TourPlateCard";
import { TOUR_REFRESH_MS } from "./tourView";
import { shelvePlates } from "./tourJoin";

export function TournamentModal({ q, r, onClose }: { q: number; r: number; onClose: () => void }) {
  const t = useT();
  const now = useNow(TOUR_REFRESH_MS);
  const [openId, setOpenId] = useState<string | null>(null);
  const plates = useQuery({
    queryKey: ["tour-plates", q, r],
    queryFn: () => getTourPlates({ data: { q, r } }),
    refetchInterval: TOUR_REFRESH_MS,
    retry: false,
  });

  const { active, soon, past } = shelvePlates(plates.data);

  const card = (p: TourPlate) => (
    <TourPlateCard
      key={p.id}
      q={q}
      r={r}
      plate={p}
      now={now}
      open={openId === p.id}
      onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
    />
  );

  return (
    <HudModal
      title={t("tour.title")}
      icon={<Trophy className="h-5 w-5 text-gold" />}
      onClose={onClose}
    >
      {plates.isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {plates.error && (
        <p className="py-6 text-center text-sm text-destructive">{errText(plates.error, t)}</p>
      )}
      {plates.data && (
        <>
          <Section title={t("tour.active")}>
            {active.length > 0 ? (
              active.map(card)
            ) : (
              <p className="py-3 text-center text-xs text-muted-foreground">{t("tour.none")}</p>
            )}
          </Section>
          {soon.length > 0 && <Section title={t("tour.soon")}>{soon.map(card)}</Section>}
          {past.length > 0 && <Section title={t("tour.past")}>{past.map(card)}</Section>}
        </>
      )}
    </HudModal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

/** «Сейчас» для подписи «осталось»: тикает, даже если ответ сервера не менялся. */
function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
