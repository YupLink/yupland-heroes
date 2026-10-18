// Экран «Ачивки» профиля замка (§8.57): восемь занятий с редкостями,
// «Ветеран портала» и старые ачивки портала, перенесённые в игру.
// Заменил прежний экран «Награды Yupland», читавший портал вживую.
import { ChevronLeft, Trophy } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ACH_TRACK_IDS } from "@/lib/achievements/tracks";
import { veteranNext, veteranOf } from "@/lib/achievements/veteran";
import { AchTrackCard } from "@/components/achievements/AchTrackCard";
import { useMyAchievements } from "@/components/achievements/useMyAchievements";
import trophyImage from "@/assets/harvest/trophy.webp";
import "@/components/achievements/achievements.css";

function Veteran({ points }: { points: number }) {
  const t = useT();
  const vet = veteranOf(points);
  const next = veteranNext(points);
  return (
    <div className="ach-card" data-rarity={vet.rarity ?? "none"}>
      <span className="ach-card__icon">
        <Trophy aria-hidden="true" />
      </span>
      <span className="ach-card__body">
        <span className="ach-card__head">
          <strong>{t("ach.veteran")}</strong>
          <span className="ach-card__rarity">
            {vet.rarity ? t(`ach.rarity.${vet.rarity}`) : t("ach.none")}
          </span>
        </span>
        <span className="ach-card__foot">
          <span>{t("ach.veteran.points", { n: points.toLocaleString("ru-RU") })}</span>
        </span>
        <small className="ach-card__how">
          {points > 0 ? t("ach.veteran.how") : t("ach.veteran.none")}
          {next != null && ` ${t("ach.veteran.next", { n: next.toLocaleString("ru-RU") })}`}
        </small>
      </span>
    </div>
  );
}

export function CastleAchievements({ onBack }: { onBack: () => void }) {
  const t = useT();
  const q = useMyAchievements();
  const counts = q.data?.counts ?? {};
  const portal = q.data?.portal ?? [];
  const points = portal.reduce((s, a) => s + a.points, 0);
  return (
    <section className="castle-profile__rewards" aria-label={t("ach.title")}>
      <button data-game-button="row" type="button" className="castle-profile__rewards-back" onClick={onBack}>
        <ChevronLeft aria-hidden="true" />
        {t("ach.back")}
      </button>
      <h2>{t("ach.title")}</h2>
      {q.isError ? (
        <div role="alert">
          <p>{t("ach.load_error")}</p>
          <button data-game-button="secondary" type="button" onClick={() => void q.refetch()}>
            {t("ach.retry")}
          </button>
        </div>
      ) : q.isPending ? (
        <p role="status">{t("ach.loading")}</p>
      ) : (
        <>
          <div className="ach-list">
            {ACH_TRACK_IDS.map((id) => (
              <AchTrackCard key={id} id={id} count={counts[id] ?? 0} />
            ))}
          </div>
          <div className="ach-section">
            <Veteran points={points} />
          </div>
          {portal.length > 0 && (
            <div className="ach-section">
              <h3>{t("ach.portal_list")}</h3>
              <div className="ach-list">
                {portal.map((a) => (
                  <div className="ach-portal" key={a.id}>
                    <img src={a.icon || trophyImage} alt="" />
                    <span>
                      <strong>{a.name}</strong>
                      {a.description && <small>{a.description}</small>}
                    </span>
                    <em>{t("ach.portal_badge")}</em>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
