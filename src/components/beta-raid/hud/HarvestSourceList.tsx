import type { ReactNode } from "react";
import { CapturedResourceRow } from "./CapturedResourceRow";
import { ChevronDown, Gem, MapPin, Mountain, Sprout, TreePine, Wheat } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatQty } from "@/lib/formatQty";
import { mushroomNameKey } from "@/lib/daraiMine";
import { groupHarvestSources, harvestSourceEndAt, harvestSourceReady } from "@/lib/harvestSourceGroups";
import { fieldShownRate, groupShownRate, mineShownRate, weatherMapIds } from "@/lib/raid/weatherYield";
import { useWeatherByMap } from "@/components/beta-raid/weather/useWeatherByMap";
import { WeatherBadge, WeatherBadges } from "@/components/beta-raid/weather/WeatherBadge";
import { mineServerNow, type MineClockStamps } from "@/lib/mineV2Clock";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import type { HarvestField } from "@/server/api/beta-raid/harvest-fields";
import logsArt from "@/assets/harvest/logs.webp";
import wheatArt from "@/assets/harvest/wheat.webp";

const resourceArt: Record<string, string> = {
  wood: logsArt,
  stone: "/resources/stone.webp",
  gold: "/resources/gold.webp",
  diamonds: "/resources/crystal.webp",
};

type HarvestMineView = MineRow & {
  maxHours?: number | null;
  v2?: { breakAt: number } | null;
};
type HarvestFieldView = HarvestField & {
  personalSlots?: { used: number; total: number } | null;
};

export function HarvestSourceList({ mines, fields, now, clock, onShowCell, action }: {
  mines: HarvestMineView[];
  fields: HarvestFieldView[];
  now?: number;
  clock?: MineClockStamps;
  onShowCell?: (q: number, r: number) => void;
  action?: ReactNode;
}) {
  const t = useT();
  const activeFields = fields.filter((field) => field.heroName !== null);
  const currentTime = mineServerNow(clock, now ?? Date.now());
  const groups = groupHarvestSources(mines, currentTime);
  // Выход в час — с погодой карты каждой постройки (шахты v2 и поля).
  const weather = useWeatherByMap(weatherMapIds(mines, activeFields));
  const nameForResource = (resource: string, token: string | null) => {
    if (resource === "token") return token ?? resource;
    const key = `mine.res.${resource}`;
    const translated = t(key);
    return translated === key ? resource : translated;
  };
  const mapButton = (name: string, q: number, r: number, floor?: string | null) => onShowCell && (
    <div className="harvest-row-map">
      <button data-harvest-show-cell data-game-button="icon" type="button"
        title={floor ?? t("harvest.show_on_map")}
        aria-label={`${name}: ${floor ? `${floor}, ` : ""}${t("harvest.cell", { q, r })}`}
        disabled={!!floor}
        onClick={() => onShowCell(q, r)}>
        <MapPin aria-hidden className="h-5 w-5" />
      </button>
      <span aria-hidden="true">{t("harvest.cell_short", { q, r })}</span>
    </div>
  );

  return (
    <>
    <section data-harvest-sources data-harvest-source-group="mines" className="harvest-panel">
      <h4 className="harvest-section-title">{t("harvest.my_mines_mushrooms_n", { n: mines.length })}</h4>
      {action && mines.length > 0 && <div data-harvest-collect-wrap>{action}</div>}
      {mines.length === 0 ? <p className="harvest-empty">{t("harvest.no_mines_mushrooms")}</p> : (
        <div className="harvest-list">
            {groups.map((group) => {
              const first = group.rows[0];
              const title = first.mushroom ? t(mushroomNameKey(first.mushroom.kind)) : nameForResource(first.resource, first.token);
              const image = first.mushroom ? first.mushroom.image : resourceArt[first.resource];
              const rate = groupShownRate(group.rows, currentTime, weather);
              return <details data-harvest-source-group-row key={group.key} className="harvest-source-group">
                <summary className="harvest-group-summary">
                  <div className="harvest-row-icon">{image ? <img src={image} alt="" /> : <Sprout aria-hidden />}</div>
                  <div className="harvest-row-main">
                    <strong>{title} <span className="harvest-group-count">{t("harvest.source_count", { n: group.rows.length })}</span></strong>
                    <div className="harvest-group-stats">
                      <span className="harvest-row-rate">{formatQty(rate.value)}{t("harvest.rate_suffix")}<WeatherBadges kinds={rate.kinds} /></span>
                      <span className="harvest-row-meta">{t("harvest.collected_label")} <b>{formatQty(group.ready)}</b></span>
                      {group.seized > 0 && <span className="harvest-group-alert">{t("harvest.seized_n", { n: group.seized })}</span>}
                      {group.stopped > 0 && <span className="harvest-row-meta">{t("harvest.stopped_n", { n: group.stopped })}</span>}
                    </div>
                  </div>
                  <ChevronDown className="harvest-group-chevron" aria-hidden />
                </summary>
                <div className="harvest-group-details">
                {group.rows.map((mine) => {
              const name = mine.mushroom ? t(mushroomNameKey(mine.mushroom.kind)) : nameForResource(mine.resource, mine.token);
              if(mine.lost && (mine.lost.kind === "capture" || mine.lost.kind === "take")) return <CapturedResourceRow
                key={mine.lost.id} id={mine.lost.id} name={name} mushroom={!!mine.mushroom} amount={mine.lost.amount}
                q={mine.q} r={mine.r} floor={mine.floor} onShowCell={onShowCell}/>;
              const image = mine.mushroom ? mine.mushroom.image : resourceArt[mine.resource];
              const Icon = mine.resource === "wood" ? TreePine : mine.resource === "stone" ? Mountain : mine.resource === "diamonds" ? Gem : Sprout;
              const endAt = harvestSourceEndAt(mine);
              const rowRate = mineShownRate(mine, currentTime, weather);
              const hoursLeft = endAt === null ? null : Math.max(0, Math.ceil((endAt - currentTime) / 3_600_000));
              const expired = !!mine.mushroom && endAt !== null && endAt <= currentTime;
              const stopped = !!mine.lost;
              const broken = mine.lost?.kind === "break" || (!!mine.v2 && endAt !== null && endAt <= currentTime);
              const stoppedLabel = mine.lost?.kind === "capture" || mine.lost?.kind === "take"
                ? t(mine.mushroom ? "harvest.mushroom_seized" : "harvest.mine_seized")
                : mine.lost?.kind === "expire" ? t("harvest.mushroom_expired")
                : mine.lost?.kind === "break" || mine.lost?.kind === "dismantle"
                  ? t("harvest.mine_broken") : t("harvest.mine_stopped");
              return <div data-harvest-mine data-harvest-seized={mine.lost?.kind === "capture" || mine.lost?.kind === "take" || undefined} data-harvest-broken={broken || undefined} key={mine.lost?.id ?? `${mine.mapId}:${mine.q},${mine.r}`} className="harvest-list-row">
                <div className="harvest-row-icon">{image ? <img src={image} alt="" /> : <Icon aria-hidden />}</div>
                <div className="harvest-row-main">
                  <strong>{name}</strong>
                  {mine.floor && <span className="harvest-row-meta">{mine.floor}</span>}
                  <div className="harvest-source-stats">
                    <span className="harvest-row-rate">{formatQty(rowRate.value)}{t("harvest.rate_suffix")}{rowRate.kind && <WeatherBadge kind={rowRate.kind} />}</span>
                    <span className="harvest-row-meta">{t(stopped ? "harvest.ready_to_collect" : "harvest.collected_label")} <b>{formatQty(harvestSourceReady(mine, currentTime))}</b></span>
                  </div>
                </div>
                {(hoursLeft !== null || stopped) && <div className="harvest-row-remaining">
                  <span>{stopped || broken || expired ? t("harvest.mine_status") : t(mine.mushroom ? "harvest.until_expiry" : "harvest.until_break")}</span>
                  <strong>{stopped ? stoppedLabel : expired ? t("harvest.mushroom_expired") : broken ? t("harvest.mine_broken") : `${formatQty(hoursLeft ?? 0)} ${t("harvest.hours_short")}`}</strong>
                </div>}
                {mapButton(name, mine.q, mine.r, mine.floor)}
              </div>;
                })}
                </div>
              </details>;
            })}
        </div>
      )}
    </section>
    <section data-harvest-sources data-harvest-source-group="farms" className="harvest-panel">
      <h4 className="harvest-section-title">{t("harvest.my_farms_n", { n: activeFields.length })}</h4>
      {activeFields.length === 0 ? <p className="harvest-empty">{t("harvest.no_active_farms")}</p> : (
        <div className="harvest-list">
          {activeFields.map((field) => {
            const isItem = field.reward.kind === "item";
            const name = isItem ? field.reward.name : nameForResource(field.reward.resource, field.reward.token);
            const rate = fieldShownRate(field, weather);
            const image = isItem ? (field.reward.image ?? (/пшениц|wheat/i.test(name) ? wheatArt : null)) : resourceArt[field.reward.resource];
            return <div data-harvest-field key={`${field.mapId}:${field.q},${field.r}`} className="harvest-list-row">
              <div className="harvest-row-icon">{image ? <img src={image} alt="" /> : <Wheat aria-hidden />}</div>
              <div className="harvest-row-main">
                <strong>{name}</strong>
                {field.floor && <span className="harvest-row-meta">{field.floor}</span>}
                <span className="harvest-row-rate">{formatQty(rate.value)}{t("harvest.rate_suffix")}{rate.kind && <WeatherBadge kind={rate.kind} />}</span>
                <span className="harvest-row-meta">{t(field.stored === null ? "harvest.ready_label" : "harvest.collected_label")} <b>{formatQty(field.stored ?? field.ready)}</b></span>
                {field.stored !== null && field.ready > 0 && <span className="harvest-row-meta">{t("harvest.ready_label")} {formatQty(field.ready)}</span>}
              </div>
              {isItem && field.personalSlots && <div className="harvest-row-remaining">
                <span>{t("harvest.personal_slots_label")}</span>
                <strong>{field.personalSlots.used}/{field.personalSlots.total}</strong>
              </div>}
              {mapButton(name, field.q, field.r, field.floor)}
            </div>;
          })}
        </div>
      )}
    </section>
    </>
  );
}

