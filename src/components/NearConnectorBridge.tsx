import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { getConnector, isSigningOnlyConnect } from "@/lib/near-connector";
import { connectWallet } from "@/server/api/user-auth";
import { signedConnect } from "@/lib/signedConnect";
import { inTelegramMiniApp, runTelegramLogin, useTgLogin } from "@/lib/auth/telegramLogin";

function getRefParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("ref");
}

// Wires hot-connector events to the server session + zustand store.
// Mounted once at the app root. Keeps the connector's client-side state
// (localStorage, popups, wallet sessions) in sync with our cookie session.
//
// АВТОРИЗАЦИЯ (см. память golden-drop-auth-tg-first-entry): в Telegram ТГ
// определяет аккаунт. Коннектор создан с autoConnect:true и при инициализации
// САМ эмитит wallet:signIn коша УСТРОЙСТВА — на общем устройстве это чужой кош
// (напр. miplix), который НЕ должен перехватывать ТГ-аккаунт. Поэтому:
//  • пока идёт первичное восстановление в Telegram — авто-signIn игнорируем;
//  • ТГ-логин первый; его результат (tgWallet) авторитетен — авто-переподключение
//    к ДРУГОМУ кошу после этого игнорируем (кроме явного «Добавить кошелёк»).
export function NearConnectorBridge() {
  const setWallet = useAppStore((s) => s.setWallet);
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let connectorRef: Awaited<ReturnType<typeof getConnector>> = null;

    let tgMode = false; // открыто внутри Telegram Mini App (есть initData)
    let restoreDone = false; // мост завершил первичное решение об аккаунте
    let tgWallet: string | null = null; // аккаунт, выбранный по ТГ (авторитетный)

    // Привязывает сессию к кошу коннектора (device/подключённый). Учитывает
    // «Добавить кошелёк» (additionalFor → сервер линкует новый кош к тому же ТГ).
    //
    // interactive: подпись NEP-413 просим ТОЛЬКО при ЯВНОМ действии пользователя
    // (нажал «Подключить»/«Добавить кошелёк» — попап уместен). На АВТО-восстановлении
    // при перезагрузке подпись НЕ дёргаем — иначе внешний кош каждый рестор кидал бы
    // попап «подписать». Сессия и так живёт в HMAC-куке; повторно доказывать владение
    // на каждый рестор не нужно. В грейсе авто-путь идёт неподписанным connectWallet.
    const applySignIn = async (
      { accounts }: { accounts: Array<{ accountId: string }> },
      interactive: boolean,
    ) => {
      const accountId = accounts[0]?.accountId;
      if (!accountId) return;
      try {
        const additionalFor = useAppStore.getState().pendingAddForWallet;
        if (additionalFor) {
          useAppStore.getState().setPendingAddForWallet(null);
        }
        const res = interactive
          ? await signedConnect({
              accountId,
              kind: "external",
              ref: getRefParam(),
              additionalFor: additionalFor ?? undefined,
            })
          : await connectWallet({
              data: {
                wallet: accountId,
                ref: getRefParam(),
                additionalFor: additionalFor ?? undefined,
              },
            });
        if (cancelled) return;
        setWallet(res.wallet);
        qc.invalidateQueries();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Авто-восстановление: кошелёк коннектора не привязан к Telegram сессии —
        // сервер отказал, и это нормально (18.10.2026: без подписи только свои
        // кошельки). Молчим, чтобы не сыпать ошибкой на каждой загрузке.
        if (!interactive) {
          console.info("[bridge] кошелёк коннектора не пристёгнут:", msg);
          return;
        }
        toast.error(`Не удалось подключить кошелёк: ${msg}`);
      }
    };

    // Событийный обработчик коннектора (в т.ч. autoConnect). Гейт: в Telegram до
    // конца восстановления игнорируем (иначе кош устройства перезапишет ТГ). После
    // — если ТГ-аккаунт активен, авто-переподключение к ДРУГОМУ кошу игнорируем
    // (кроме явного добавления коша пользователем).
    const onSignInEvent = (payload: { accounts: Array<{ accountId: string }> }) => {
      if (isSigningOnlyConnect()) return; // кошелёк подключили только чтобы подписать
      const acc = payload.accounts[0]?.accountId;
      const pendingAdd = useAppStore.getState().pendingAddForWallet;
      // 18.10.2026: кошелёк пристёгивается к Telegram только явным «Добавить
      // кошелёк» (pendingAdd) — и в мини-аппе, и в браузере. Остальные подключения
      // (оплата, сжигание NFT, вывод излишков, autoConnect) — только для подписи
      // транзакций: сессию игры не трогают и подпись входа не просят. Первичное
      // восстановление вне Telegram — шаг 3 ниже.
      if (!pendingAdd || !acc) return;
      void applySignIn(payload, true);
    };

    // Выход из кошелька коннектора — не выход из игры (18.10.2026): сессия держится
    // на Telegram. Раньше здесь стиралась серверная сессия — и «Добавить кошелёк»
    // (он сначала отключает коннектор) разлогинивал игрока ещё до подписи.
    const onSignOut = () => {};

    (async () => {
      // 1) ТГ-логин ПЕРВЫЙ и БЕЗ кошелька (17.10): раньше он ждал загрузку библиотеки
      // NEAR-коннектора — пока она грузилась (или не загрузилась) у новичка не было
      // сессии, и экран просил «Подключи кошелёк». ТГ определяет аккаунт.
      tgMode = inTelegramMiniApp();
      let restored = false;
      // Кош устройства как фолбэк разрешён вне Telegram всегда; в Telegram —
      // ТОЛЬКО если ТГ явно без аккаунта (no_wallet_linked = админ по кошу). При
      // сетевом сбое ТГ-логина кош устройства НЕ трогаем (чтобы блип не увёл в
      // чужой аккаунт на общем устройстве).
      let allowDeviceFallback = !tgMode;
      if (tgMode) {
        const res = await runTelegramLogin(qc);
        if (cancelled) return;
        if (res.result === "ok" && res.wallet) {
          tgWallet = res.wallet;
          restored = true;
        } else if (res.result === "skipped") {
          allowDeviceFallback = true; // легитимно нет ТГ-аккаунта (Ярослав)
        }
      }

      // 2) Коннектор кошелька — после входа; его сбой вход больше не ломает.
      let connector: Awaited<ReturnType<typeof getConnector>> = null;
      try {
        connector = await getConnector();
      } catch {
        connector = null;
      }
      if (cancelled) return;
      if (!connector) {
        restoreDone = true;
        return;
      }
      connectorRef = connector;
      connector.on("wallet:signIn", onSignInEvent);
      connector.on("wallet:signOut", onSignOut);

      // 3) Фолбэк: кош устройства (Ярослав / браузер / вне Telegram).
      if (!restored && allowDeviceFallback && !cancelled) {
        try {
          const existing = await connector.getConnectedWallet();
          if (cancelled) return;
          if (existing?.accounts?.[0]?.accountId) {
            // Авто-восстановление на загрузке — без подписи (никакого попапа на рестор).
            await applySignIn({ accounts: existing.accounts }, false);
            restored = true;
          }
        } catch {
          // No active session — nothing to do.
        }
      }

      restoreDone = true;
    })();

    return () => {
      cancelled = true;
      if (connectorRef) {
        connectorRef.off("wallet:signIn", onSignInEvent);
        connectorRef.off("wallet:signOut", onSignOut);
      }
    };
  }, [setWallet, qc]);

  return null;
}
