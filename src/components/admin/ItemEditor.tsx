// Редактор определения артефакта/героя (создание и правка).
// Вынесено из ItemsAdminPanel при разбивке на модули (§13 ПРАВИЛА.md) —
// поведение не менялось, только переезд: поля артефакта уехали в
// ItemArtifactFields, мелкие контролы — в ItemFieldControls.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { ImageUploader } from "@/components/ImageUploader";
import { adminCreateItem, adminUpdateItem } from "@/server/api/items";
import { heroAbilityOf } from "@/lib/hero/heroAbilities";
import { ItemHeroFields } from "./ItemHeroFields";
import { ItemArtifactFields } from "./ItemArtifactFields";
import { RARITY, isUniqueItem, type ItemRow } from "./itemsAdminShared";

export function ItemEditor({
  kind,
  initial,
  onDone,
}: {
  kind: "artifact" | "hero";
  initial: ItemRow | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [image, setImage] = useState<string | null>(initial?.imageUrl ?? null);
  const [rarity, setRarity] = useState<(typeof RARITY)[number]>(
    (initial?.rarity as (typeof RARITY)[number]) ?? "rare",
  );
  const [level, setLevel] = useState(initial?.level ?? 3);
  const [race, setRace] = useState(initial?.race ?? "");
  const [specialization, setSpecialization] = useState(initial?.specialization ?? "");
  // Артефакт-структура. Земля выбирается осознанно («строим от земли»).
  const [land, setLand] = useState(initial?.land ?? "");
  const [statType, setStatType] = useState(initial?.statType ?? "");
  const numStr = (v: number | null | undefined) => (v != null ? String(v) : "");
  const [statAmount, setStatAmount] = useState(numStr(initial?.statAmount));
  const [raceAmount, setRaceAmount] = useState(numStr(initial?.raceAmount));
  const [specAmount, setSpecAmount] = useState(numStr(initial?.specAmount));
  const [landAmount, setLandAmount] = useState(numStr(initial?.landAmount));
  const [fishBonusPct, setFishBonusPct] = useState(
    initial?.fishBonusPct ? String(initial.fishBonusPct) : "",
  );
  const [immunities, setImmunities] = useState<string[]>(initial?.immunities ?? []);
  const [slot, setSlot] = useState(initial?.slot ?? "");
  /** Уникальный герой: выпадет один раз, потом уйдёт из пула превращений. */
  const [uniq, setUniq] = useState(isUniqueItem(initial?.meta));
  /** Способность героя (lib/hero/heroAbilities) — в meta.ability, пусто — нет. */
  const [ability, setAbility] = useState<string>(heroAbilityOf(initial?.meta) ?? "");
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const artifactPayload = {
    rarity,
    land: land || undefined,
    landAmount: num(landAmount),
    statType: statType || undefined,
    statAmount: num(statAmount),
    race: race || undefined,
    raceAmount: num(raceAmount),
    specialization: specialization || undefined,
    specAmount: num(specAmount),
    // Пусто — ноль: «нет бонуса», а не «не трогать» — иначе стереть бонус было бы нечем.
    fishBonusPct: Math.max(0, Number(fishBonusPct.replace(",", ".")) || 0),
    immunities,
    slot: slot || undefined,
  };
  /**
   * meta шлём ЦЕЛИКОМ — сервер её перезаписывает (items.adminUpdateItem), и
   * послать один только флаг значило бы стереть остальное, что в ней лежит.
   */
  const heroMeta = () => {
    const base = { ...((initial?.meta as Record<string, unknown> | null) ?? {}) };
    if (uniq) base.unique = true;
    else delete base.unique;
    if (ability) base.ability = ability;
    else delete base.ability;
    return base;
  };
  const isEdit = !!initial;
  // У героя раса и спец обязательны: 15.09 два common-шаблона создали с «—» в
  // спеце, и 70 героев качались с нулями (RACE_STATS строки «без спеца» не
  // имеет). Пункт «—» оставлен, чтобы битый шаблон открывался как есть, но
  // сохранить его без выбора нельзя; сервер проверяет то же (items-hero-guard).
  const heroIncomplete = kind === "hero" && (!race || !specialization);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? adminUpdateItem({
            data: {
              id: initial!.id,
              name: name.trim(),
              description: description.trim() || null,
              imageUrl: image,
              ...(kind === "artifact"
                ? artifactPayload
                : {
                    level,
                    race: race || null,
                    specialization: specialization || null,
                    meta: heroMeta(),
                  }),
            },
          })
        : adminCreateItem({
            data: {
              kind,
              name: name.trim(),
              description: description.trim() || undefined,
              imageUrl: image || undefined,
              ...(kind === "artifact"
                ? artifactPayload
                : {
                    level,
                    race: race || undefined,
                    specialization: specialization || undefined,
                    meta: heroMeta(),
                  }),
            },
          }),
    onSuccess: () => {
      toast.success(
        isEdit ? "Сохранено" : kind === "artifact" ? "Артефакт создан" : "Герой создан",
      );
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-card/60 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "artifact" ? "Название артефакта" : "Имя героя"}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Описание"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold/50"
          />
          {kind === "artifact" ? (
            <ItemArtifactFields
              v={{
                rarity,
                slot,
                land,
                landAmount,
                statType,
                statAmount,
                race,
                raceAmount,
                specialization,
                specAmount,
                fishBonusPct,
                immunities,
              }}
              set={{
                rarity: (x) => setRarity(x as (typeof RARITY)[number]),
                slot: setSlot,
                land: setLand,
                landAmount: setLandAmount,
                statType: setStatType,
                statAmount: setStatAmount,
                race: setRace,
                raceAmount: setRaceAmount,
                specialization: setSpecialization,
                specAmount: setSpecAmount,
                fishBonusPct: setFishBonusPct,
                immunities: setImmunities,
              }}
            />
          ) : (
            <ItemHeroFields
              v={{ level, race, specialization, ability, uniq }}
              set={{
                level: setLevel,
                race: setRace,
                specialization: setSpecialization,
                ability: setAbility,
                uniq: setUniq,
              }}
            />
          )}
        </div>
        <div className="w-full sm:w-40">
          <ImageUploader value={image} onChange={setImage} placeholder="Картинка" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onDone}
          className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Отмена
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim() || heroIncomplete}
          className="rounded-full bg-gold px-5 py-2 text-sm font-bold text-background transition active:scale-95 disabled:opacity-50"
        >
          {save.isPending ? "Сохраняю…" : isEdit ? "Сохранить" : "Создать"}
        </button>
      </div>
    </div>
  );
}
