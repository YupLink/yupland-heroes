// Поля шаблона героя в редакторе: уровень, раса, специализация, способность,
// «уникальный». Вынесено из ItemEditor (лимит 250 строк).
import { useLang } from "@/lib/i18n";
import { RACES, SPECIALIZATIONS, heroRarity, metaLabel } from "@/components/heroMeta";
import { HERO_ABILITY_IDS, heroAbilityLabel } from "@/lib/hero/heroAbilities";
import { FieldSel } from "./ItemFieldControls";
import { HERO_LEVELS } from "./itemsAdminShared";

export type HeroFieldsValue = {
  level: number;
  race: string;
  specialization: string;
  ability: string;
  uniq: boolean;
};

export function ItemHeroFields({
  v,
  set,
}: {
  v: HeroFieldsValue;
  set: {
    level: (n: number) => void;
    race: (s: string) => void;
    specialization: (s: string) => void;
    ability: (s: string) => void;
    uniq: (b: boolean) => void;
  };
}) {
  const lang = useLang();
  const incomplete = !v.race || !v.specialization;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <FieldSel
        label="Ур."
        value={String(v.level)}
        onChange={(x) => set.level(Number(x))}
        opts={HERO_LEVELS.map(String)}
        renderOpt={(x) => `${x}★ · ${heroRarity(Number(x)).label}`}
      />
      <FieldSel
        label="Раса"
        value={v.race}
        onChange={set.race}
        opts={RACES as unknown as string[]}
        empty
        renderOpt={(x) => metaLabel(x, lang)}
      />
      <FieldSel
        label="Спец."
        value={v.specialization}
        onChange={set.specialization}
        opts={SPECIALIZATIONS as unknown as string[]}
        empty
        renderOpt={(x) => metaLabel(x, lang)}
      />
      <FieldSel
        label="Способность"
        value={v.ability}
        onChange={set.ability}
        opts={[...HERO_ABILITY_IDS]}
        empty
        renderOpt={(x) => heroAbilityLabel(x, lang)}
      />
      {incomplete && (
        <p className="col-span-full text-[11px] text-destructive">
          Без расы и специализации у героя нулевые характеристики — выберите обе.
        </p>
      )}
      {/* Уникальный: как только такой герой кому-то достался, он
          пропадает из пула превращений (server heroes-unique). */}
      <label className="col-span-full flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={v.uniq}
          onChange={(e) => set.uniq(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        <span className="font-medium">Уникальный</span>
        <span className="text-xs text-muted-foreground">
          выпадает один раз — потом уходит из рандома
        </span>
      </label>
    </div>
  );
}
