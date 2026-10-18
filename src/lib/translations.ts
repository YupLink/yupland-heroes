// translations.ts — агрегатор переводов.
// Переводы разбиты по доменам в src/lib/translations/*.ts
// Этот файл реэкспортирует dict для обратной совместимости с i18n.ts
//
// Чтобы добавить новую строку — найди нужный субдомен:
//   chips.*   → src/lib/translations/chips.ts
//   drops.* / mynfts.*  → src/lib/translations/drops.ts
//   hallway.* → src/lib/translations/hallway.ts
//   boss.*    → src/lib/translations/boss.ts
//   raid.*    → src/lib/translations/raid.ts
//   pvp.*     → src/lib/translations/pvp.ts
//   wallet.* / wmodal.* / wmain.* / wsign.* / wconnect.*
//             → src/lib/translations/wallet.ts
//   admin.*   → src/lib/translations/admin.ts
//   likes.*   → src/lib/translations/likes.ts
//   common.*  → src/lib/translations/common.ts
//   nav.*     → src/lib/translations/nav.ts
//   landing.* → src/lib/translations/landing.ts
//   lookup.*  → src/lib/translations/lookup.ts
//   referrals.* → src/lib/translations/referrals.ts
//   market.*  → src/lib/translations/market.ts
//   shop.*    → src/lib/translations/shop.ts

export { dict } from "./translations/index";
