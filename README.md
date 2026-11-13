# YupLand Heroes

A live fantasy game in Telegram and the browser. Players sign in with Telegram, Google or a NEAR wallet, pick a race and a hero and explore a hex-map world. They fight, loot, trade on a player market, run mines and build up a castle. **A wallet is never needed to play.** NEAR comes in only when a player chooses to bring DARAI, the community token on NEAR, into the game.

Built for **NEAR HACKATHON 2026**, track `games` (Games With Real Economies). The game existed before the hackathon. What is judged is the work done from **2026-10-19 to 2026-11-14**. It is marked by the git tags `pre-hackathon` (the code on 2026-10-18) and `hackathon-submission` (the code now).

| What | Link |
|---|---|
| Diff judged for the hackathon | https://github.com/YupLink/yupland-heroes/compare/pre-hackathon...hackathon-submission |
| Commit chronicle of the window (1,038 commits) | [HACKATHON_COMMITS.md](HACKATHON_COMMITS.md) |
| Play in the browser, Google sign-in | https://service.yupland.io |
| Play in the browser, Telegram sign-in | https://tg.service.yupland.io |
| Play in the browser, NEAR wallet sign-in | https://near.service.yupland.io |
| New: Crown of the Buckwheat Kingdom, a match-3 round with DARAI stakes | https://service.yupland.io/crown |
| Play in Telegram | https://t.me/yupland_heroes_bot |
| Landing | https://heroes.yupland.io/en.html |
| Crown game client (MIT, by Kaylani) | https://github.com/kaylani-vibe/yupland-heroes-buckwheat-match3 |
| Game account on NearBlocks (every DARAI deposit and withdrawal) | https://nearblocks.io/address/darai_gdrop.near?tab=tokentxns |

## What we built during the hackathon (Oct 19 – Nov 14, 2026)

| | |
|---|---|
| Commits in the window | 1,038 (sanitized list: [HACKATHON_COMMITS.md](HACKATHON_COMMITS.md)) |
| Judged diff (public copy) | 5,413 files changed, +242,118 / −19,532 lines ([compare](https://github.com/YupLink/yupland-heroes/compare/pre-hackathon...hackathon-submission)) |
| Registered players | 640+ |
| NEAR wallet sign-ins (unique wallets, since the sign-in log started on Nov 8) | 15 |
| DARAI deposits / withdrawals in the window | 77 deposits from 34 accounts, 3,375,541,282 DARAI in total / 103 withdrawals, 1,094,920,289 DARAI in total |
| Crown rounds played | 494: 489 for gold (11 of them free demo rounds) and 5 for DARAI |
| Raid fights / mine captures in the window | 87,807 / 7,030 |
| On-chain proof | Every deposit and withdrawal is a DARAI transfer to or from the game account [`darai_gdrop.near`](https://nearblocks.io/address/darai_gdrop.near?tab=tokentxns) |

Player and usage numbers are database totals for 2026-10-19 – 2026-11-13. They contain no player names or ids.

### Before → after

The whole game, not only NEAR. `[NEAR]` marks rows tied to NEAR, the DARAI token (`darai.tkn.near`) or on-chain data. Paths in the "Before" column can be checked at the tag `pre-hackathon`, paths in "Where in code" at `hackathon-submission`. Things that already existed before the window are described as such.

| Area | Before (Oct 18, tag `pre-hackathon`) | After (now) | Where in code |
|---|---|---|---|
| Sign-in options | Telegram only: the Mini App session, or the Telegram login widget / one-time login code in a browser (`src/lib/auth/telegramLogin.ts`, `src/server/api/loginCode.ts`). | Telegram, Google and NEAR wallet, each on its own domain (`service.yupland.io` Google, `tg.service.yupland.io` Telegram, `near.service.yupland.io` wallet). What an account may do follows its keys, not the entry page. | `src/server/entryHost.ts`, `src/lib/auth/entryRules.ts`, `src/server/api/google-login/googleLogin.ts` |
| [NEAR] NEAR wallet sign-in | Telegram players had an embedded NEAR wallet and could *link* an external wallet to their Telegram account with a NEP-413 signature (`src/lib/nep413.ts`, `src/server/api/user-auth.ts`). There was no way to enter the game with a wallet alone (no wallet-login module). | Wallet-only sign-in: NEP-413 signed challenge plus a full-access-key check. Wallets that already exist map to their own account. New wallet accounts are created only through the `/crown` link (with a withdraw right) or the `near.service.yupland.io` entrance (without withdrawal). Admin statistics. | `src/server/api/nep413-login.ts`, `src/server/api/wallet-login/walletLogin.ts`, `src/server/api/wallet-login/walletLoginCrown.ts` |
| [NEAR] Crown minigame | Absent (no `minigames/`, no `src/routes/crown.tsx`). | "Crown of the Buckwheat Kingdom", Kaylani's MIT match-3 client, runs in an iframe from a map building. The `/crown` page offers NEAR wallet sign-in, DARAI stakes and deposit/withdraw. Rolls come from a server-side secret salt, the game has its own DARAI fund (when it runs dry, the map pool pays the rest and admins get an alert), and the client is synced from Kaylani's public repo. | `minigames/buckwheat/`, `src/routes/crown.tsx`, `src/server/api/buckwheat/bwApi.ts`, `src/server/api/buckwheat/bwEngine.ts`, `migrations/buckwheat-04-darai.sql`, `migrations/buckwheat-05-fund.sql`, `migrations/buckwheat-06-fund-floor.sql` |
| [NEAR] DARAI rails | Already present: DARAI deposit from a NEAR wallet (`src/lib/ftTransfer.ts`) and withdrawal (`src/server/api/currency/withdraw.ts`), both since 2026-08-26. The castle Bank already had DARAI swap and staking (`src/server/api/bank/bank-swap.ts`, `migrations/bank-07-stake.sql`). | New DARAI uses: gold packs paid in DARAI, DARAI mushrooms on veins, a gold/DARAI candle chart, bank pools in any coin, and Crown stakes from the DARAI balance. The DARAI price is read live from Ref, with an alarm when the rate freezes. Token icons come from on-chain metadata. | `src/lib/goldShop.ts`, `src/lib/mushroomKinds.ts`, `src/lib/bankRate.ts`, `src/server/api/buckwheat/bwCore.ts`, `src/server/api/energy-sub/rate-watch.ts` |
| [NEAR] DARAI withdrawal limits | Monthly cap in tiers of 10 / 50 / 100 M DARAI by what the player brought in over 30 days (`migrations/wd-04-darai-limit-tiers-back.sql`; it replaced wd-03 the same day, 2026-10-16). | Turnover rule: own deposits go back 1:1 outside the cap, and the +10 % applies only to DARAI spent in the game (wd-07). Each subscription adds its own allowance (wd-08 to wd-10). A whitelist covers accounts present on rollout day, and Google-only accounts cannot withdraw. | `migrations/wd-07-darai-turnover.sql`, `migrations/wd-10-sub-bonus-per-sub.sql`, `src/server/api/withdraw-list/withdrawList.ts` |
| [NEAR] On-chain data | NFT ownership and reputation came from the third-party Sendler API (`src/server/sendler.ts`). | Own indexer: it polls FastNEAR transaction history for the project's wallets and NFT contracts and stores transfers and NFT owners. It **runs alongside** Sendler, not instead of it. A reconciliation against Sendler and game records runs every 10 minutes and sends alerts to admins. | `src/server/chain/chain-indexer.ts`, `src/server/chain/recon.ts`, `migrations/chain-01-indexer.sql` |
| Accounts | No account archive or passport (`src/server/accountArchive.ts` absent). | One account per Telegram account or wallet; duplicates are archived and the richer account stays main. The admin "passport" shows the Telegram, wallets and Google login of each account. Google logins are never merged automatically. | `src/server/accountArchive.ts`, `src/server/api/passport/passportAdmin.ts` |
| Onboarding | A newbie-island prototype (since 2026-10-14) that only admins could enter or reset (`adminIslandEnter` in `src/server/api/beta-raid/island/island-api.ts`, islands created only from `src/server/api/beta-raid/island/island-admin.ts`). | Every newcomer picks a race and gets a personal copy of the designer's template island. A 13-step short tutorial runs on all new islands, and the island has exit and storage caps. | `src/server/api/beta-raid/island/island-newbie.ts`, `src/server/api/beta-raid/island/island-create.ts`, `migrations/island-short-01.sql` |
| Map and worlds | Hex raid map with fog and portals already existed. There were no modules for weather, mounts, dynamite or veins, no builder world and no per-world art; mushrooms existed only as fleeing map creatures. | World weather with climates and anomalies. Mounts, including the pegasus jump. Dynamite. Gold and diamond veins with mushrooms. A builder world where land tiles are placed into the void. Interworld portals on the map, fog reach rules, online camps and a daily treasure. Eight worlds redrawn in 16-bit pixel art. | `src/lib/raid/weather.ts`, `src/lib/hero/mount.ts`, `src/lib/dynamite.ts`, `src/lib/landPlace.ts`, `src/lib/raid/sight.ts`, `src/components/beta-raid/world-art/worldArt.ts` |
| Mines | Mines v1 with guard fights (`src/components/beta-raid/mine/MineGuardFight.tsx`). | Mines v2: blueprints from the Architect, output modes, service stock, breakdown and repair, levels 1–4, mines on veins, a remote Mine Office with "repair all", and blueprint boosts. | `src/lib/mineV2.ts`, `src/server/api/mine-office/mine-office-list.ts`, `migrations/minev2-01-engine.sql` |
| Castle buildings | The Town Hall offered entries to the Auction House, Bank and Casino (`src/components/castle-live/TownHallBank.tsx` and siblings). It had no levels and no building catalogue (`src/lib/townHall.ts` absent). | Town Hall with 9 levels, a building limit and a catalogue. New buildings: Architect, Mine Office, Weather Station, Shaman Hut, Newspaper Kiosk, Armory/Forge, an enchanting shop and the Artifact Generator. Buildings can be sold, and the castle layout syncs across devices. | `src/lib/townHall.ts`, `src/lib/townHallCatalog.ts`, `src/lib/shamanHut.ts`, `src/lib/buildingSale.ts`, `src/server/api/castle-layout/castle-layout.ts` |
| Currencies | Tickets were a soft currency alongside gold (ticket shop, ticket fillers in `src/lib/translations/admin.ts`, `src/lib/translations/boss.ts`). | Tickets removed: 1 ticket = 100 gold, and everything that cost or paid tickets now uses gold. Gold packs are priced in USD. | `src/lib/ticketGold.ts`, `src/lib/goldShop.ts` |
| Casino | A slot machine on gold already existed (`src/server/api/slot/slot-core.ts`). | A per-player "soft pull" toward a 90 % return, recalculated every 20 spins. A guest demo that writes nothing to the server. New reel motion, music and sounds. Casino-owner heroes share 5 % of daily profit. Closed to Google-only accounts. | `src/lib/slot/reelLevel.ts`, `src/lib/slot/demoSlot.ts`, `src/lib/casinoShare.ts` |
| Market and auction | Chip market priced in tickets (`src/server/api/chips-market-batch.ts`); game auctions (`src/server/api/game-auction/bid.ts`). | Chip market in gold, with a 9 % fee that is burned. A hero market and a pawnshop for heroes and artifacts. Shop recipes with random outcomes and up to five ingredients. Unread-lot badges on auctions, and enchanted lots. | `src/server/api/chips-market-gold.ts`, `src/server/api/hero-market/hm-list.ts`, `src/lib/pawnDrop.ts`, `src/lib/marketRecipe.ts` |
| Artifacts and AI generation | Artifacts had no wear, enchanting or AI generation (`src/lib/hero/artWear.ts`, `src/lib/enchant/`, `src/server/craft/` absent). | Wear per battle; broken artifacts fall off the hero and are repaired at the forge. Risky enchanting. An AI art lab for admins and an Artifact Generator building for players: a chain of free models, then fal.ai, with server-side speech-to-text for spoken prompts. | `src/lib/hero/artWear.ts`, `src/lib/enchant/enchant.ts`, `src/server/craft/generate.ts`, `src/server/craft/falAi.ts`, `src/server/api/art-gen/art-gen-api.ts` |
| Creator worlds | Absent (no creator modules or migrations). | A creator studio on blank maps with settlement templates, view/edit roles, copies, expansion up to 512, a catalogue and a team. | `src/server/api/creator/creator-api.ts`, `src/lib/raid/creator/blankMap.ts`, `migrations/creator-01-works.sql` |
| Newspaper | Absent. | "Vestnik", a daily image newspaper built from in-game events, plus a castle kiosk, a reader on the map and `/api/news` as JSON or HTML. | `src/server/news/vestnik-render.ts`, `src/components/newspaper/NewspaperKiosk.tsx`, `src/routes/api.news.ts` |
| English localization | RU/EN string tables already existed: 70 modules in `src/lib/translations/`. | 117 modules. Browser sign-in screen with an EN/RU switch, the newspaper in RU/EN, and a privacy policy in RU and EN. | `src/lib/translations/`, `src/routes/privacy.tsx` |
| Payments | Telegram Stars, USDT and DARAI (`migrations/usd-02-usdt-ladder-stars.sql`, `migrations/esub-02-stars-pool.sql`). No card payments. | Card payments through Xsolla for Google-only accounts. Sandbox mode is the default, and live mode is enabled by an environment variable. Signed webhook. Stars invoices moved to the game bot. | `src/server/api/xsolla/xsollaPay.ts`, `src/routes/api.xsolla-webhook.ts`, `src/server/tgStarsUpdate.ts` |
| Performance | 254 WebP files in the tree. None of these modules existed: per-frame batching of query notifications, an animation zone, a water ripple layer, a boot watchdog or stale-chunk recovery. | 1,612 WebP files, with runtime image references switched from PNG to WebP. Query updates are batched once per frame, building animations run only at close zoom, and water ripples have their own layer instead of repainting the whole map. A boot watchdog reloads the page if the code fails to load, and stale chunks recover silently. | `src/lib/frameNotify.ts`, `src/components/beta-raid/animZone.ts`, `src/components/beta-raid/waterLayers.ts`, `src/lib/bootWatchdog.ts`, `src/lib/staleReload.ts` |
| Security | No Content-Security-Policy. Wallet secrets were kept in IndexedDB under a browser key, and the wallet password only locked the UI (`src/lib/secureWallet.ts`, `src/lib/appLock.ts`). `@tanstack/react-start` was at `^1.167.14`. No repository secret scan. | CSP with a per-request nonce and a report endpoint: report-only by default, blocking with `CSP_ENFORCE=1` (blocking in production). Wallet secrets are sealed with a PBKDF2 → AES-GCM key derived from the wallet password and held only in memory. Request bodies are capped at 1 MB and uploads at 10 MB. `@tanstack/react-start` is at `^1.168.61` (fixes GHSA-qx66-fv34-fjm8). A pre-commit and CI scan checks for secrets and player data. Telegram IDs are no longer exposed in leaderboards. | `src/lib/csp/pageNonce.ts`, `src/lib/csp/cspPolicy.ts`, `src/lib/walletVault.ts`, `src/lib/http/bodyLimit.ts`, `scripts/check-repo-hygiene.mjs` |

### Timeline

What a player could do by the end of each week. `[NEAR]` marks NEAR-related items.

#### Week 1 (Oct 19–25): mines, gold economy, markets

- **Run mines v2.** Order a mine blueprint from the castle Architect, place it on a free cell, pick an output mode, repair it when it breaks, upgrade it to level 4, and capture other players' mines. Gold and diamond mines can only stand on veins of their own kind. — `src/lib/mineV2.ts`
- **Play with gold instead of tickets.** Tickets were converted to gold at 1 ticket = 100 gold. Chips can be crafted for gold and traded on a gold chip market, where 9 % of each sale is burned. — `src/lib/ticketGold.ts`, `src/server/api/chips-market-gold.ts`
- **Trade heroes.** List heroes on the hero market, or sell several heroes and artifacts to the pawnshop in one deal. — `src/server/api/hero-market/hm-list.ts`, `src/lib/pawnDrop.ts`
- **[NEAR] Buy gold packs and farm DARAI.** Gold packs are priced in USD and paid in USDT, DARAI or Telegram Stars. DARAI, gold and diamond mushrooms spawn on veins and can be picked up and planted. — `src/lib/goldShop.ts`, `src/lib/mushroomKinds.ts`
- **[NEAR] Follow the gold/DARAI rate** in the castle Bank as a line or candle chart (1h / 4h / 1d). — `src/lib/bankRate.ts`
- **[NEAR] Withdraw DARAI by turnover.** Your own deposits go back 1:1 outside the monthly cap. The +10 % bonus applies only to DARAI that was actually spent in the game. — `migrations/wd-07-darai-turnover.sql`
- **Grow the castle.** The Town Hall has 9 levels with a building limit, and buildings and decor are bought from its catalogue. — `src/lib/townHall.ts`, `src/lib/townHallCatalog.ts`
- **Wear, repair and blow things up.** Artifacts wear out per battle and break; the forge repairs them. Dynamite clears trees, rocks and broken mines. — `src/lib/hero/artWear.ts`, `src/server/api/art-repair/art-repair.ts`, `src/lib/dynamite.ts`

#### Week 2 (Oct 26 – Nov 1): weather, mounts, enchanting, newspaper

- **Live with world weather.** Each world has shared weather that changes on a schedule. When the admin switch is on, it also affects mines, farms, fishing and movement. Players can read the odds at the Weather Station and pay a shaman rite to shift them. — `src/lib/raid/weather.ts`, `src/lib/raid/weatherRitual.ts`, `src/lib/shamanHut.ts`
- **Ride.** A new "Mount" slot on the hero sets travel pace, and a pegasus can jump. — `src/lib/hero/mount.ts`
- **Enchant and merge.** Enchant an artifact with a risky ± roll that can destroy it. A hero rite turns N heroes of one rarity into one hero of the next rarity, up to a new "unique" tier. — `src/lib/enchant/enchant.ts`, `src/lib/enchant/heroRite.ts`
- **Read the daily newspaper "Vestnik"** (an image built from in-game events) and collect issues at a Newspaper Kiosk in the castle. — `src/server/news/vestnik-render.ts`, `src/components/newspaper/NewspaperKiosk.tsx`
- **See interworld portals** and their destination worlds on the player map. — `src/lib/raid/worldPortals.ts`
- **Casino.** Guests can spin a free demo with no server writes. For real-gold play the reels adapt per player toward a fixed return. — `src/lib/slot/demoSlot.ts`, `src/lib/slot/reelLevel.ts`
- **Redeem promo codes** from the profile. Prizes are delivered straight to where they belong. — `src/lib/promo/promoCode.ts`
- **[NEAR] Subscriptions raise the DARAI withdrawal allowance** (extra monthly cap per tier). — `migrations/wd-08-sub-withdraw-bonus.sql`

#### Week 3 (Nov 2–8): NEAR wallet sign-in, Crown minigame, onboarding for all

- **[NEAR] Sign in with a NEAR wallet alone, without Telegram.** The game issues a NEP-413 signed challenge and checks for a full-access key. Wallets that already exist map to their own account. — `src/server/api/nep413-login.ts`, `src/server/api/wallet-login/walletLogin.ts`
- **[NEAR] Play "Crown of the Buckwheat Kingdom"**, Kaylani's MIT match-3 client. It runs from a map building, or from the `/crown` link with wallet sign-in, a DARAI balance bar, DARAI stakes and deposit/withdraw. — `src/routes/crown.tsx`, `src/server/api/buckwheat/bwApi.ts`, `src/server/api/wallet-login/walletLoginCrown.ts`, `minigames/buckwheat/`
- **[NEAR] Own chain indexer (behind the scenes).** It polls the project's wallets and NFT contracts and records transfers and NFT ownership. It runs alongside the previous provider, and a reconciliation pass reports any mismatch. — `src/server/chain/chain-indexer.ts`, `src/server/chain/recon.ts`
- **Sign in with Google** as a new player. Each Telegram account or wallet maps to one game account; extra accounts are archived. — `src/components/auth/GoogleLoginButton.tsx`, `src/server/accountArchive.ts`
- **Start on your own island.** Every newcomer picks a race and gets a personal copy of the designer's template island. — `src/server/api/beta-raid/island/island-newbie.ts`
- **Build worlds in the Creator studio** on blank maps, with view/edit roles and copies. — `src/server/api/creator/creator-api.ts`
- **New ways to earn.** Shop recipes with random outcomes, a daily buried treasure, and gold referrals worth 10–20 % of friends' purchases. — `src/lib/marketRecipe.ts`, `src/lib/treasure.ts`, `src/lib/referralGold.ts`
- **Order a unique AI-generated artifact** at the Artifact Generator building. — `src/server/api/art-gen/art-gen-api.ts`

#### Week 4 (Nov 9–14): three entrances, card payments, art and security

- **[NEAR] Three entrances, one rule set.** `service.yupland.io` is the Google entrance, `tg.service.yupland.io` the Telegram one and `near.service.yupland.io` the NEAR wallet one. What an account may do depends on its keys, not on the page it came from. — `src/server/entryHost.ts`, `src/lib/auth/entryRules.ts`
- **[NEAR] Crown gets its own DARAI fund.** When it runs dry, the shortfall is paid from the map pool and admins get an alert. The client code is synced from Kaylani's public repository. — `migrations/buckwheat-05-fund.sql`, `migrations/buckwheat-06-fund-floor.sql`, `minigames/buckwheat.upstream`
- **[NEAR] Withdrawal whitelist.** The withdraw button loads only for accounts that existed on the rollout day, and Google-only accounts cannot withdraw. — `src/server/api/withdraw-list/withdrawList.ts`
- **Pay by card** (Xsolla) for gold and subscriptions on Google-only accounts. It runs in sandbox mode unless switched to live. — `src/server/api/xsolla/xsollaPay.ts`, `src/routes/api.xsolla-webhook.ts`
- **Short tutorial for every new island:** 13 steps (chest, sell an ingot, axe, oak, fight, boat, crossing, spell). — `migrations/island-short-01.sql`, `src/server/api/beta-raid/island/island-newbie.ts`
- **Explore redrawn worlds.** Eight worlds have new 16-bit pixel art, Midgard keeps its art with new water, and there are new snow, rain and thunderstorm effects. — `src/components/beta-raid/world-art/worldArt.ts`, `src/components/beta-raid/waterLayers.ts`
- **See who is online.** Camps of online players are animated on the map. Casino-owner heroes receive 5 % of the casino's daily profit. — `src/lib/raid/presence.ts`, `src/lib/casinoShare.ts`
- **Safer client.** Pages get a Content-Security-Policy with a per-request nonce. Embedded-wallet secrets are sealed with a key derived from the wallet password, which lives only in page memory. — `src/lib/csp/pageNonce.ts`, `src/lib/walletVault.ts`

## Problem

Most crypto games ask for a wallet before the first minute of play, and their economy is the token chart. YupLand Heroes goes the other way.

- **It plays like a normal game first.** Players sign in with Telegram or Google and earn gold in an in-game economy.
- **The token is there for those who want it.** The community already holds DARAI ([`darai.tkn.near`](https://nearblocks.io/token/darai.tkn.near), NEP-141).
- **What was missing before the hackathon.** DARAI could already be deposited and withdrawn (since August 2026), but players could sign in only through Telegram. There was no game round to play with DARAI, and withdrawals had only a tiered monthly cap. During the hackathon we added sign-in with a NEAR wallet alone, a match-3 round with DARAI stakes and a server-side ledger, and withdrawal rules tied to what a player actually brought in and spent.

## Try it

**Without a wallet (about 2 minutes):**
1. Open https://service.yupland.io and switch to **EN**. Sign in with Google.
2. Pick a race. You start on your own island with a short tutorial: open a chest, sell an ingot, take an axe, cut an oak, win a fight, take a boat.
3. Gold, loot and fights all stay in the game database. Nothing touches the chain.

**With DARAI on NEAR mainnet (about 5 minutes; needs a NEAR wallet with at least 1,000,000 DARAI):**
1. Open https://service.yupland.io/crown and press **Sign in with NEAR wallet**. The NEAR Connector wallet list opens. The wallet signs a message: no transaction, no gas. A new wallet becomes a game account here.
2. Top up DARAI (minimum 1,000,000). The wallet shows an `ft_transfer` of DARAI to `darai_gdrop.near` with the memo `yuplink account top-up`. After the server finds the transfer, the in-game balance grows.
3. Choose **DARAI** and press **Play**. The entry is 100,000 DARAI. Guide the crowns to the exits in 30 moves: each crown pays 50,000 DARAI, three crowns end the round.
4. Withdraw (minimum 1,000,000 DARAI). An account created through `/crown` can take out up to what it deposited plus 10 % (plus any subscription allowance). The server sends `ft_transfer` from `darai_gdrop.near` to your wallet in the same request, without manual approval.

No DARAI? The Crown screen links to Rhea Finance, where you can get it.

## Track 09 — Games With Real Economies: how to check

| Do this | You will see |
|---|---|
| Sign in on `/crown` with a NEAR wallet | A wallet signature request, no transaction (`src/server/api/nep413-login.ts`) |
| Top up DARAI | Your transfer to `darai_gdrop.near` on NearBlocks, then the balance in the Crown header |
| Play a DARAI round | The result screen with the payout; the server replays your moves (`src/server/api/buckwheat/bwCore.ts`) |
| Withdraw | A transfer from `darai_gdrop.near` to your wallet on NearBlocks |
| Play a gold round on the in-game map | The same game with gold, no wallet and no chain |

From Oct 19 to Nov 13, players fought 87,807 raid fights and captured mines 7,030 times. These totals come from the same tables the game's newspaper digest reads (`src/server/api/news/news-sql.ts`); they include all accounts.

## Game loop

| How often | What the player does |
|---|---|
| Every ~30 seconds | Moves on the hex map, fights, opens chests, fishes, digs for treasure; in the Crown round, swaps pieces to guide crowns to the exits |
| Every session | Sells loot on the player market or at the auction house, buys gear, collects income from mines, upgrades the castle |
| Over weeks | Captures and repairs mines, climbs leaderboards, orders AI-generated artifacts, stakes DARAI in the castle Bank |

Part of the economy drains itself: 9 % of every chip-market sale is burned.

## NEAR integration

| Step | What happens | On-chain? | Code |
|---|---|---|---|
| Sign in with NEAR (new in the window) | NEAR Connector (`@hot-labs/near-connect`) wallet list. The wallet signs a NEP-413 message. The server checks a single-use nonce, the ed25519 signature and that the key is a full-access key (read-only RPC view). The signature check was extracted from the existing wallet-link code. | no transaction | `src/server/api/nep413-login.ts` |
| New wallet = new account (new in the window) | Only through `/crown` (withdraw right: deposited +10 %) or the `near.` entrance (no withdrawal). One device can create one new wallet account. | no | `src/server/api/wallet-login/walletLogin.ts`, `src/server/api/wallet-login/walletLoginCrown.ts` |
| Deposit DARAI (existed since Aug 2026) | The wallet sends `storage_deposit` + `ft_transfer` of DARAI to `darai_gdrop.near`. The server looks the transfer up through the third-party Sendler FT-transfer API and checks sender, receiver, token contract and amount before crediting. Each transaction can be credited only once. | **yes** | `src/lib/ftTransfer.ts`, `src/server/api/currency/deposit-apply.ts`, `src/server/near.ts` |
| Crown of the Buckwheat Kingdom (new in the window) | Entry 100 gold or 100,000 DARAI; 50 gold or 50,000 DARAI per crown. The server keeps the seed and salt secret, replays every move with the same engine file the browser runs, and keeps the ledger and the game's DARAI fund in SQL. | no, server ledger | `src/server/api/buckwheat/`, `minigames/buckwheat/src/engine.mjs`, `migrations/buckwheat-04-darai.sql`, `migrations/buckwheat-05-fund.sql` |
| Withdraw DARAI (existed since Aug 2026; limits new in the window) | Only to the player's own wallet. The balance is debited first, then the server signs `ft_transfer` from `darai_gdrop.near`. Monthly caps by turnover, a whitelist of accounts, no withdrawal for Google-only accounts. | **yes** | `src/server/api/currency/withdraw.ts`, `src/server/api/user-payouts-withdraw.ts`, `migrations/wd-07-darai-turnover.sql`, `migrations/wd-08-sub-withdraw-bonus.sql`, `migrations/entry-01-three-entries.sql` |
| Own chain indexer (new in the window) | Polls transaction history for the project's wallets and NFT contracts and stores transfers and NFT owners. It runs alongside the previous provider, and a reconciliation reports mismatches. | reads | `src/server/chain/chain-indexer.ts`, `src/server/chain/recon.ts` |

- **Network:** NEAR mainnet.
- **Token:** DARAI, `darai.tkn.near`, NEP-141.
- **Game account:** `darai_gdrop.near` receives deposits and sends withdrawals.
- **Limits:** minimum deposit and withdrawal 1,000,000 DARAI; the monthly cap on earned DARAI is `max(10M, in-game spend + min(10 % of it, 100M))` plus subscription allowances; unspent own deposits go back 1:1 outside the cap (`migrations/wd-08-sub-withdraw-bonus.sql:85`, `migrations/wd-07-darai-turnover.sql:9-20`).

## Baseline: what existed before 2026-10-19 (not judged)

At the tag `pre-hackathon` the game already had:

- the hex raid map with fog and portals between worlds;
- Telegram sign-in (Mini App, login widget, one-time code);
- an embedded NEAR wallet and linking an external wallet to a Telegram account with a NEP-413 signature;
- DARAI deposit and withdrawal (since 2026-08-26) and the castle Bank with DARAI swap and staking;
- mines with guard fights, the Town Hall with the Auction House, Bank and Casino, a gold slot machine;
- a chip market priced in tickets and game auctions;
- RU/EN string tables.

## For AI reviewers

| Claim | Where to verify |
|---|---|
| NEAR sign-in by signed message, no gas; nonce is single-use | `src/server/api/nep413-login.ts:104-111` (nonce consumed), `:122` (ed25519 signature check) |
| A new wallet becomes an account only via `/crown` or the `near.` host | `src/server/api/wallet-login/walletLogin.ts:151`, `:196` |
| A `/crown` account may withdraw up to what it deposited +10 % | `src/server/api/wallet-login/walletLoginCrown.ts:20`, `migrations/buckwheat-04-darai.sql:173-186` |
| DARAI deposit verified before crediting: own sender, amount, single use | `src/server/api/currency/deposit-apply.ts:55` (verify) then `:71` (credit); `src/server/near.ts:584` (receipt reuse), `:655` (sender), `:687` (amount) |
| Crown result computed on the server from a secret seed and salt | `src/server/api/buckwheat/bwCore.ts:90-91` (seed, salt), `:129` (replay), `src/server/api/buckwheat/bwEngine.ts:62-65` (per-move randomness from the secret salt) |
| Crown prices: 100 / 50 gold, ×1000 for DARAI, 30 moves | `minigames/buckwheat/src/engine.mjs:6-9`, `src/server/api/buckwheat/bwCore.ts:16` |
| Gold rounds never touch the chain | `migrations/buckwheat-05-fund.sql:57` (gold stake through the in-game ledger); no NEAR or RPC import under `src/server/api/buckwheat/` |
| DARAI withdrawal only to the player's own wallet | `src/server/api/currency/withdraw.ts:46` |
| Withdrawal protected from double requests | `src/server/api/currency/withdraw.ts:121` (idempotency key), `src/server/api/user-payouts-lock.ts:52` (concurrent payout refused), `migrations/buckwheat-04-darai.sql:160` (per-account lock) |
| Monthly withdrawal cap by turnover | `migrations/wd-08-sub-withdraw-bonus.sql:85` |
| Withdrawal whitelist, edited only by the payouts admin | `migrations/entry-01-three-entries.sql:59`, `src/server/api/withdraw-list/withdrawListAdmin.ts:34` |
| Google-only accounts cannot withdraw | `src/server/api/google-login/noWithdraw.ts:14` |
| Request bodies capped before parsing (1 MB, uploads 10 MB) | `src/lib/http/bodyLimit.ts:20-35`, `src/start.ts:19-23` |

**Run the tests.** The game itself needs its database, Telegram bot and keys, so it does not start from this repository; please use the live game. The unit tests run offline:

```bash
npm ci
npm install --no-save --legacy-peer-deps vitest@5.0.3
npx vitest run src/server/api/nep413-login.test.ts src/server/api/wallet-login src/server/api/buckwheat src/server/api/withdraw-list src/server/api/currency src/server/api/google-login src/lib/auth src/server/rateGate.test.ts src/lib/http src/lib/csp
```

On 2026-11-13 this ran 33 test files, 167 tests, all passing. The Crown engine has its own tests: `cd minigames/buckwheat && npm test` (61 passing). Vitest is not listed in `package.json` because the server deploy runs `npm ci` without it.

## What was removed from this public copy

This is a clean copy of a private repository. The tags `pre-hackathon` and `hackathon-submission` are snapshots of it, not its full history. Removed:

- secrets and keys;
- player data (in the `pre-hackathon` snapshot, player ids that were in old code and tests are replaced with placeholders such as `player01`);
- deployment, admin and one-off scripts;
- internal docs, plans and rules.

Configuration comes from environment variables.

## Tools and AI

- TanStack Start (React 19, server functions), Canvas 2D, PostgreSQL, Tailwind CSS.
- NEAR: `@hot-labs/near-connect`, `near-api-js`, `@noble/ed25519`.
- AI coding assistants (Claude Code) wrote a large share of the code in the window, directed and reviewed by the team.
- The game art was made with generative AI tools together with the YupLand community.

## Security

Please report security issues privately to the YupLand team, not in public issues.

## License

Code: [Apache License 2.0](LICENSE). Game art, music, characters, names and logos: all rights reserved, see [NOTICE](NOTICE).

The Crown game client lives in its own repository under MIT: https://github.com/kaylani-vibe/yupland-heroes-buckwheat-match3
