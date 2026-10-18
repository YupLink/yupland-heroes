import { useAppStore } from "@/lib/store";
// Данные книги заклинаний и сам каст.
//
// Тикающий откат живёт здесь, а не в плитке: секунды одни на всю книгу, и
// десяток отдельных setInterval на десяток плиток — это десяток перерисовок в
// секунду на телефоне.
//
// Откат ПЕРЕСЧИТЫВАЕМ от снимка ответа (dataUpdatedAt), а не парсим readyAt:
// момент готовности приезжает строкой из базы, и её разбор Date.parse на
// эталонном телефоне (Telegram-вебвью) — лотерея. Секунды же сервер уже
// посчитал сам, остаётся вычесть прошедшее.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { invalidateHeroQueries } from "@/lib/query";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { OBLIVION_KEY } from "@/lib/hooks/useOblivion";
import { boostRollText } from "@/lib/hero/boost";
import {
  getHeroSpellbook,
  getOwnedHeroSpellbook,
  type SpellBookEntry,
} from "@/server/api/beta-raid/spell-book";
import { castSpell } from "@/server/api/beta-raid/spell-cast";
import { forgetSpell } from "@/server/api/beta-raid/spell-learn";

export const SPELLBOOK_KEY = ["hero-spellbook"] as const;

/** Пересчитать откат на «сейчас»: снимок сервера стареет каждую секунду. */
function tickEntry(entry: SpellBookEntry, elapsedSec: number): SpellBookEntry {
  if (entry.cooldownLeftSec <= 0) return entry;
  const left = Math.max(0, entry.cooldownLeftSec - elapsedSec);
  if (left === entry.cooldownLeftSec) return entry;
  // Откат дотикал — снимаем и запрет, но только если он был именно откатом:
  // низкий интеллект и выключенное заклинание временем не лечатся.
  const wasCooldown = entry.reasonKey === "spell.cooldown";
  return {
    ...entry,
    cooldownLeftSec: left,
    readyAt: left > 0 ? entry.readyAt : null,
    canCast: entry.canCast || (wasCooldown && left === 0),
    reasonKey: wasCooldown && left === 0 ? null : entry.reasonKey,
  };
}

export function useSpellbook({
  heroId,
  readOnly = false,
}: { heroId?: string; readOnly?: boolean } = {}) {
  const wallet = useAppStore((s) => s.walletAddress);
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const energy = useEnergy();

  const book = useQuery({
    queryKey: heroId ? [...SPELLBOOK_KEY, "view", wallet, heroId] : SPELLBOOK_KEY,
    queryFn: () => (heroId ? getOwnedHeroSpellbook({ data: { heroId } }) : getHeroSpellbook()),
    ...(heroId ? { staleTime: 0, gcTime: 0 } : {}),
  });

  const [now, setNow] = useState(() => Date.now());
  // Часы заводим, только если кому-то правда идёт откат: книга без откатов
  // не должна перерисовываться раз в секунду просто так.
  const ticking = (book.data?.spells ?? []).some((s) => s.cooldownLeftSec > 0);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const updatedAt = book.dataUpdatedAt;
  const spells = useMemo(() => {
    const list = book.data?.spells ?? [];
    const elapsed = Math.max(0, Math.floor((now - updatedAt) / 1000));
    return list.map((s) => tickEntry(s, elapsed));
  }, [book.data, now, updatedAt]);

  const cast = useMutation({
    // Ключ нажатия свой на каждое нажатие: слепой повтор моста не должен
    // списать энергию дважды за одну кнопку. `expect` — цена, которую видел
    // игрок на кнопке: сервер не спишет больше неё.
    mutationFn: (v: { spellId: string; expect: number }) => {
      if (readOnly || heroId) throw new Error("Read only / Только просмотр");
      return castSpell({ data: { spellId: v.spellId, op: newOpId(), expect: v.expect } });
    },
    onSuccess: (res) => {
      // Отказ приезжает УСПЕШНЫМ ответом (ok:false) — это не поломка сети, а
      // правило игры, и говорить о нём надо словами, а не «ошибка запроса».
      if (!res.ok) {
        toast.error(t(res.reasonKey, res.reasonParams));
      } else if (res.repeat) {
        toast.info(t("braid.spell_repeat"));
      } else {
        toast.success(castLine(res, lang, t));
      }
      // Даже отказ обновляет книгу: причина могла быть в чужом откате.
      // beta-raid-state — позиция героя и висящие эффекты, beta-raid-ships —
      // призванный корабль: правило «обновление страницы = табу».
      // hero-spellbook живёт в общем списке ключей героя (HERO_QUERY_KEYS) —
      // здесь только то, чего в нём нет: энергия и корабли карты.
      invalidateHeroQueries(qc, ["my-energy", "beta-raid-ships"]);
      // Телепорт домой из другого мира: всё, что знало прежнюю карту, перечитываем
      // — карта увидит чужой id в журнале и скачается целиком (как у портала).
      if (res.ok && res.map) {
        void qc.invalidateQueries({
          predicate: (q) => String(q.queryKey[0] ?? "").startsWith("beta-raid"),
        });
      }
      // Корабельное заклинание меняет и окно корабля: список бортов клетки,
      // «сколько досок нужно» и разбор. Без этого окно, открытое в первые
      // секунды после каста, показывало прежний запас хода починенного судна.
      if (res.ok && res.ship) {
        for (const key of ["beta-raid-ships-at", "ship-repair", "ship-scrap"]) {
          void qc.invalidateQueries({ queryKey: [key] });
        }
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const forget = useMutation({
    // Забвение из книги — эффектом «Забвение» (уровень или время), клетки
    // столба не шлём. Героя шлём того, чью книгу видит игрок: сменись
    // выбранный между открытием книги и нажатием — сервер не забудет лишнего
    // у другого, а чужого героя не тронет вовсе.
    mutationFn: (v: { spellId: string; name: string }) => {
      const owner = book.data?.hero?.heroId;
      if (readOnly || heroId || !owner) throw new Error("Read only / Только просмотр");
      return forgetSpell({ data: { spellId: v.spellId, heroId: owner } });
    },
    onSuccess: (res, v) => {
      if (res.ok) toast.success(t("braid.spell_forgot", { name: v.name }));
      else toast.error(t(res.reasonKey, res.reasonParams));
      // Книга (строки и места) и значки «забрано» на карте — у всех «spell» в
      // имени ключа, как их гасит и окно столба. "all": карта может стоять
      // неактивной под окном героя. Витрины столбов (spell-pillar) — только
      // открытые: закрытая витрина ДАЛЬНЕГО столба на перечитывании получает
      // отказ «Подойди ближе» (requirePillar) и мигнула бы им при следующем
      // открытии; помеченная устаревшей, она и так перечитается на открытие.
      void qc.invalidateQueries({
        predicate: (query) => {
          const key = String(query.queryKey[0] ?? "");
          return key.includes("spell") && key !== "spell-pillar";
        },
        refetchType: "all",
      });
      void qc.invalidateQueries({ queryKey: ["spell-pillar"] });
      // Уровень забвения потрачен (или эффекта уже нет) — значок и кнопка тоже.
      void qc.invalidateQueries({ queryKey: OBLIVION_KEY, refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // energyQuery — замку (TavernSpellbook): отличить «энергия ещё грузится» от нуля.
  return { book, spells, energy: energy.data?.energy ?? null, energyQuery: energy, cast, forget };
}

type CastOk = Extract<Awaited<ReturnType<typeof castSpell>>, { ok: true }>;

/** Итог каста одной строкой: что прилетело герою и что случилось на карте. */
function castLine(
  res: CastOk,
  lang: "ru" | "en",
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const name = res.name;
  const line = res.rolls.map((r) => boostRollText(r, lang)).join(" · ");
  // Новый борт и пришедший чужой — разные события, и слова у них разные.
  if (res.ship && res.kind === "create_ship") return t("braid.spell_done_ship_create", { name });
  if (res.ship && res.kind === "repair_ship") return t("braid.spell_done_ship_repair", { name });
  if (res.ship) return t("braid.spell_done_ship", { name });
  if (res.moved) return t("braid.spell_done_teleport", { name });
  return line ? t("braid.spell_done", { name, line }) : t("braid.spell_done_plain", { name });
}

export type Spellbook = ReturnType<typeof useSpellbook>;
