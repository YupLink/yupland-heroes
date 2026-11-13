// Куски окна зачарования героев: ячейка героя (лицо в кольце цвета редкости,
// имя, уровень) и итог обряда — новый герой, пропавшие или «все вернулись».
import { ImageOff } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import type { HeroRiteResult, RiteHero } from "@/lib/enchant/heroRite";

type CellHero = Pick<RiteHero, "name" | "imageUrl" | "rarity"> & { level?: number };

export function RiteHeroFace({ h }: { h: CellHero }) {
  return h.imageUrl ? (
    <img
      className="hrite-ava"
      src={thumb(h.imageUrl, 160)}
      alt=""
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span className="hrite-ava is-none">
      <ImageOff className="h-5 w-5" />
    </span>
  );
}

export function RiteHeroCell({
  h,
  pressed,
  first = false,
  onClick,
}: {
  h: CellHero;
  pressed: boolean;
  /** Обряд «→ уник»: эта ячейка и станет уником — ★ в углу. */
  first?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      className={`ench-cell ench-r-${h.rarity}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {first && (
        <span className="hrite-first ench-r-unique" aria-hidden="true">
          ★
        </span>
      )}
      <RiteHeroFace h={h} />
      <span className="ench-nm">{h.name}</span>
      {h.level != null && <span className="hrite-lv">{t("herorite.lvl", { n: h.level })}</span>}
    </button>
  );
}

export function HeroRiteResultView({ res }: { res: HeroRiteResult }) {
  const t = useT();
  if (res.outcome === "ok" && res.hero) {
    const h = res.hero;
    return (
      <div className={`ench-result is-ok ench-r-${h.rarity}`} role="status">
        <h5>{t(h.rarity === "unique" ? "herorite.res_unique" : "herorite.res_ok")}</h5>
        <div className="hrite-new">
          <RiteHeroFace h={h} />
          <b>{h.name}</b>
          <span className="ench-rt">{t(`herorite.r_${h.rarity}`)}</span>
        </div>
      </div>
    );
  }
  if (res.outcome === "gone") {
    return (
      <div className="ench-result is-bad" role="status">
        <h5>{t("herorite.res_gone")}</h5>
        <p>{res.lost.map((h) => h.name).join(" · ")}</p>
      </div>
    );
  }
  return (
    <div className="ench-result" role="status">
      <h5>{t("herorite.res_none")}</h5>
      <p>{t("herorite.res_none_sub")}</p>
    </div>
  );
}
