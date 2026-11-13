// /privacy — политика конфиденциальности игры (владелец, 30.10.2026): её адрес
// требует Google для входа через Google (Google Auth Platform → Branding).
// Публичная, видна и в закрытую бету (BetaGate ALLOW_PREFIXES). Обе версии
// на одной странице: Google проверяет английскую, игроки читают русскую.
// Текст — только про то, что игра действительно хранит (вход, устройство,
// игра, кошельки, статистика интерфейса).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — YupLand Heroes" }] }),
  component: PrivacyPage,
});

type Section = { h: string; p: string[] };
type Doc = { title: string; updated: string; sections: Section[] };

const RU: Doc = {
  title: "Политика конфиденциальности YupLand Heroes",
  updated: "Обновлено 30 октября 2026",
  sections: [
    {
      h: "Какие данные мы получаем",
      p: [
        "Вход через Telegram — номер (id) и имя пользователя Telegram.",
        "Вход через Google — идентификатор аккаунта Google и адрес почты.",
        "Устройство — случайная метка в браузере, обезличенный слепок браузера (хеш), адрес сети (IP) и название браузера. Нужны для защиты от массового создания аккаунтов.",
        "Игра — прогресс, инвентарь, балансы и история действий и покупок в игре.",
        "Кошельки — адреса кошельков NEAR, Solana или Ethereum, если вы их подключили. Операции в блокчейне публичны по природе блокчейна.",
        "Статистика интерфейса — какие экраны и кнопки используются (PostHog).",
      ],
    },
    {
      h: "Зачем",
      p: [
        "Чтобы вы могли войти и играть, чтобы игра помнила ваш прогресс, чтобы защищать игру от обмана и ферм аккаунтов и чтобы улучшать интерфейс.",
      ],
    },
    {
      h: "Кому передаём",
      p: [
        "Мы не продаём данные. Передаём только то, без чего не работают функции: Telegram и Google — для входа, PostHog — для статистики интерфейса, сети блокчейна — для операций, которые вы сами совершаете.",
      ],
    },
    {
      h: "Хранение и удаление",
      p: [
        "Данные хранятся на сервере игры, пока существует аккаунт. Чтобы удалить аккаунт и данные, напишите игровому боту @yupland_heroes_bot в Telegram.",
      ],
    },
  ],
};

const EN: Doc = {
  title: "YupLand Heroes Privacy Policy",
  updated: "Updated October 30, 2026",
  sections: [
    {
      h: "What we collect",
      p: [
        "Telegram sign-in — your Telegram user id and username.",
        "Google sign-in — your Google account id and email address.",
        "Device — a random browser label, an anonymous browser fingerprint (hash), your network (IP) address and browser name. Used to protect the game from mass account creation.",
        "Game — progress, inventory, balances and the history of in-game actions and purchases.",
        "Wallets — NEAR, Solana or Ethereum wallet addresses, if you connect them. Blockchain transactions are public by the nature of blockchains.",
        "Interface analytics — which screens and buttons are used (PostHog).",
      ],
    },
    {
      h: "Why",
      p: [
        "To let you sign in and play, to keep your progress, to protect the game from cheating and account farms, and to improve the interface.",
      ],
    },
    {
      h: "Who we share it with",
      p: [
        "We do not sell data. We share only what features need: Telegram and Google for sign-in, PostHog for interface analytics, blockchain networks for transactions you make yourself.",
      ],
    },
    {
      h: "Storage and deletion",
      p: [
        "Data is stored on the game server while the account exists. To delete your account and data, message the game bot @yupland_heroes_bot on Telegram.",
      ],
    },
  ],
};

function DocBlock({ doc, lang }: { doc: Doc; lang: "ru" | "en" }) {
  return (
    <article lang={lang} className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{doc.title}</h1>
        <p className="text-xs text-muted-foreground">{doc.updated}</p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.h} className="space-y-1.5">
          <h2 className="text-sm font-semibold">{s.h}</h2>
          {s.p.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-muted-foreground">
              {line}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-10 bg-background px-4 py-8 text-foreground">
      <DocBlock doc={RU} lang="ru" />
      <hr className="border-border" />
      <DocBlock doc={EN} lang="en" />
    </main>
  );
}
