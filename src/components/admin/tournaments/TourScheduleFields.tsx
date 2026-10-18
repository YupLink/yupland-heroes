// «Начало» и «Конец» турнира — по UTC. Задано начало — автостарт (и автоконец,
// если задан конец); пусто — старт кнопкой на плашке. На телефоне поля друг
// под другом: дата со временем в половину 360 px не влезает. Само поле с
// крестиком «очистить» — общее с письмами (UtcDateTimeInput).
import { useT } from "@/lib/i18n";
import { UtcDateTimeInput } from "@/components/admin/UtcDateTimeInput";
import { CAP, FIELD } from "./tourCls";
import type { TourDraft } from "./tourDraft";

type Key = "startAt" | "endAt";
const FIELDS: ReadonlyArray<{ key: Key; label: string }> = [
  { key: "startAt", label: "tour.adm.f_start" },
  { key: "endAt", label: "tour.adm.f_end" },
];

export function TourScheduleFields({
  value,
  onPatch,
}: {
  value: Pick<TourDraft, Key>;
  onPatch: (p: Partial<Pick<TourDraft, Key>>) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="min-w-0">
          <label htmlFor={`tour-${key}`} className={CAP}>
            {t(label)}
          </label>
          <UtcDateTimeInput
            id={`tour-${key}`}
            value={value[key]}
            onChange={(v) => onPatch({ [key]: v })}
            clearLabel={t("tour.adm.clear")}
            className={FIELD}
          />
        </div>
      ))}
    </div>
  );
}
