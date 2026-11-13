// Радиус «второго обзора» аккаунта в SQL: 40 под биноклем, иначе 20
// (lib/raid/sight.ts). Подставляется туда, где раньше стояло число 20:
// хп и запас чужих шахт, мешочки и бугорки, ямки, газеты. «NOT LIKE 'buff_%'» —
// чтобы планировщик взял уникальный индекс (account_id, kind) — он частичный.
import { FOG_ACTIVE_RADIUS } from "@/lib/raid/fogRadius";
import { BINOCULAR_RADIUS, SIGHT_KIND } from "@/lib/raid/sight";

/** `acc` — уже экранированный SQL (литерал или столбец). */
export const sightRadiusSql = (acc: string): string =>
  `(CASE WHEN EXISTS (SELECT 1 FROM yuplink.beta_raid_player_effects se
                       WHERE se.account_id = ${acc} AND se.kind = '${SIGHT_KIND}'
                         AND se.kind NOT LIKE 'buff_%' AND se.expires_at > now())
         THEN ${BINOCULAR_RADIUS} ELSE ${FOG_ACTIVE_RADIUS} END)`;
