// Что видно в игре (владелец, 14.10.2026): чужие лагеря и их точки на карте,
// юпики, гуляющие по замку. Два отдельных переключателя, только вид.
import { PawPrint, Tent } from "lucide-react";
import { useAccountView, useSetAccountView } from "@/lib/hooks/useAccountView";

export function ProfileViewToggles({ ru }: { ru: boolean }) {
  const view = useAccountView();
  const save = useSetAccountView();
  const rows = [
    { key: "hidePlayers" as const, icon: Tent, label: ru ? "Игроки на карте" : "Players on map" },
    { key: "hideResidents" as const, icon: PawPrint, label: ru ? "Юпики в замке" : "Yupiks in castle" },
  ];
  return (
    <>
      {rows.map(({ key, icon: Icon, label }) => {
        const on = !view[key];
        return (
          <button
            key={key}
            type="button"
            data-game-button="row"
            className="castle-profile__row"
            role="switch"
            aria-checked={on}
            onClick={() => save.mutate({ [key]: on })}
          >
            <Icon aria-hidden="true" /><span>{label}</span><span className={`castle-profile__switch ${on ? "is-on" : ""}`} aria-hidden="true" />
          </button>
        );
      })}
      {save.isError && <p role="alert" className="px-3 text-sm text-destructive">{ru ? "Не сохранилось. Попробуй ещё раз." : "Not saved. Try again."}</p>}
    </>
  );
}
