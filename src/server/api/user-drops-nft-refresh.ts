import { createServerFn } from "@tanstack/react-start";
import { pg } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { _userScanAt, scanUserInventoryViaSendler } from "./user-drops-nft-scan";

/** Принудительное обновление inventory. Без throttle. Дёргается из
 *  UI-кнопки «Обновить». Юзер ждёт результат. */
export const refreshMyInventory = createServerFn({ method: "POST" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Кошелёк не подключён");
    try {
      const me = await pg.users.findOne({ wallet });
      if (me?.telegram_id) _userScanAt.set(me.telegram_id, Date.now());
      const res = await scanUserInventoryViaSendler(wallet);
      return { ok: true, ...res };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // MCP-DB временные сбои соединения. У клиента уже есть один авто-ретрай;
      // если оба раза не получилось — отдаём человеку понятную ошибку вместо
      // технического "no session path" / "SSE closed".
      if (
        /no session path|SSE closed|MCP timeout|MCP POST/i.test(msg)
      ) {
        throw new Error(
          "База временно недоступна, попробуй ещё раз через 5 секунд."
        );
      }
      throw err;
    }
  }
);
