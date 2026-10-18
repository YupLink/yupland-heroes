// Карточка ачивки: значок, имя, взятая редкость, полоска до следующей, что
// даёт сейчас и лестница всех шести редкостей — порог и награда каждой.
// compact — строка для панели острова.
import { useLang, useT } from "@/lib/i18n";
import type { AchTrackId } from "@/lib/achievements/tracks";
import { achStatLabel, achTrackView } from "./achView";
import { AchTrackIcon } from "./AchTrackIcon";
import "./achievements.css";

export function AchTrackCard({
  id,
  count,
  compact = false,
  goal,
}: {
  id: AchTrackId;
  count: number;
  compact?: boolean;
  /** Цель острова (порог обычной редкости): вместо следующей. */
  goal?: number;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const v = achTrackView(id, count);
  const stat = achStatLabel(v.stat, lang, t);
  const target = goal ?? v.target;
  const pct = goal ? Math.min(100, Math.round((count / goal) * 100)) : v.pct;
  const done = goal != null && count >= goal;
  return (
    <div
      className={`ach-card${compact ? " ach-card--compact" : ""}${done ? " is-done" : ""}`}
      data-rarity={v.rarity ?? "none"}
    >
      <span className="ach-card__icon">
        <AchTrackIcon id={id} />
      </span>
      <span className="ach-card__body">
        <span className="ach-card__head">
          <strong>{t(`ach.track.${id}`)}</strong>
          <span className="ach-card__rarity">
            {v.rarity ? t(`ach.rarity.${v.rarity}`) : t("ach.none")}
          </span>
        </span>
        <span
          className="ach-card__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className="ach-card__foot">
          <span>{target == null ? t("ach.maxed") : `${Math.min(count, target)} / ${target}`}</span>
          {!compact && v.bonus > 0 && (
            <span className="ach-card__bonus">{t("ach.gives", { n: v.bonus, stat })}</span>
          )}
        </span>
        {!compact && (
          <ol className="ach-ladder">
            {v.ladder.map((s) => (
              <li key={s.rarity} data-rarity={s.rarity} className={s.done ? "is-on" : undefined}>
                <span>{t(`ach.rarity.${s.rarity}`)}</span>
                <b>{s.target}</b>
                <em>{t("ach.gives", { n: s.bonus, stat })}</em>
              </li>
            ))}
          </ol>
        )}
        {!compact && <small className="ach-card__how">{t(`ach.track.${id}.how`)}</small>}
      </span>
    </div>
  );
}
