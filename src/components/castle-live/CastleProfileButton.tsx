// Кружок профиля в шапке внутрянки замка. Живёт ОТДЕЛЬНО от самого окна
// профиля: CastleLiveView держит кнопку статически, а окно грузит лениво —
// в одном файле ленивый импорт затягивал бы «Аккаунт» и «Рефералы» в общий
// чанк и код-сплит терял смысл.
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { thumb } from "@/lib/image";
import { ProfileAvatar } from "./ProfileAvatar";
import { ReferralRewardDot } from "@/components/referrals/ReferralRewardDot";
import { SatietyBar, satietyLabel, useSatiety } from "@/components/beta-raid/SatietyBar";
import "./castle-profile-satiety.css";

export function CastleProfileButton({ onClick, showSatiety = true }: { onClick: () => void; showSatiety?: boolean }) {
  const ru = useLang() === "ru";
  const satiety = useSatiety(showSatiety);
  // Канонический ключ выбранного героя — тот же, что у окна замка и рейда:
  // своя копия ключа не видела бы invalidateHeroQueries и показывала бы
  // прошлого героя после смены (правило «без F5»). Опрос раз в полминуты
  // убран — смена героя сама инвалидирует этот ключ.
  const hero = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
  });
  const avatar = (
    <ProfileAvatar
      onClick={onClick}
      label={ru ? "Открыть профиль" : "Open profile"}
      loading={hero.isPending}
      imageUrl={!hero.isError && hero.data?.imageUrl ? thumb(hero.data.imageUrl, 96) : null}
      badge={<ReferralRewardDot className="absolute right-1 top-1" />}
    />
  );
  if (!showSatiety) return avatar;
  return (
    <div className="castle-profile-satiety" title={satiety ? satietyLabel(satiety, ru) : undefined}>
      <SatietyBar ru={ru} variant="ring" />
      {avatar}
    </div>
  );
}
