// Раскадровка всех экранов проекта — для дизайнера. Список составлен по
// коду (реально существующие роуты/вкладки/модалки), без скриншотов —
// это чек-лист МЕСТ, куда их нужно вставить руками (у агента нет браузера/
// скриншот-тула). Каждый лист = один кадр для реального скрина интерфейса.
import { createFileRoute } from "@tanstack/react-router";
import {
  ImagePlus,
  Wallet,
  DoorOpen,
  Layers,
  Gift,
  Users,
  Search,
  LogIn,
  Milestone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/screens")({
  head: () => ({
    meta: [
      { title: "Раскадровка экранов — YupLink" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Чек-лист всех экранов/модалок проекта для скриншотинга.",
      },
    ],
  }),
  component: ScreensPage,
});

type Leaf = { title: string; note?: string };
type Item = { title: string; note?: string; children?: Leaf[] };
type Section = { icon: LucideIcon; title: string; route?: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    icon: Wallet,
    title: "Вход и кошелёк",
    items: [
      { title: "/ — стартовый экран", note: "гость и уже подключённый — разный вид" },
      { title: "/home — лендинг YupLink", note: "hero, «как это работает», FAQ" },
      {
        title: "Модалка подключения кошелька",
        note: "выбор способа",
        children: [
          { title: "Список локальных кошельков / войти" },
          { title: "Создание нового — сид-фраза + проверка" },
          { title: "Импорт — вставить сид/приватный ключ" },
        ],
      },
      {
        title: "/wallet — мой кошелёк",
        note: "вкладки Активы / NFT / История / dApps",
        children: [
          { title: "Форма отправки (получатель+сумма → превью → отправка)" },
          { title: "Панель получения (QR + адрес)" },
          { title: "Настройки: PIN/пароль, автоблок, показать сид/ключ" },
        ],
      },
      { title: "/wallet/connect", note: "подтверждение подключения стороннего dApp" },
      { title: "/wallet/sign", note: "подтверждение подписи транзакции" },
      { title: "/wallet/sign-message", note: "подтверждение подписи сообщения" },
      { title: "/wallet/docs", note: "техническая документация — не приоритет для дизайна" },
    ],
  },
  {
    icon: DoorOpen,
    title: "Прихожая · онбординг",
    route: "/hallway",
    items: [
      { title: "Главная — Юпик", note: "уровень, EXP-бар, тап-пул осознанности" },
      { title: "Марафон 30 дней", note: "календарь дней + клейм награды" },
      { title: "Инвентарь фишек (прихожая)" },
      { title: "Магазин", note: "офферы за Telegram Stars" },
      { title: "Обучающий тур", note: "coach-overlay, пошаговый (5 шагов)" },
      { title: "Модалка «Открыть сундук»", note: "с показом приза" },
      { title: "Экран/модалка «Выпуститься в игру»" },
    ],
  },
  {
    icon: Layers,
    title: "Фишки — игровой хаб",
    route: "/chips",
    items: [
      { title: "Дом", note: "обзор: энергия, инвентарь, быстрые кнопки" },
      {
        title: "Инвентарь фишек",
        children: [
          { title: "Сетка + фильтры (коллекция / уровень / номер)" },
          { title: "Детальная карточка фишки", note: "статы, апгрейд, герой" },
          { title: "История фишки (лог событий)" },
          { title: "Крафт — выбор жертв для апгрейда" },
        ],
      },
      {
        title: "Мои паки",
        children: [{ title: "Модалка открытия пака (анимация reveal)" }],
      },
      {
        title: "Коллекции",
        children: [
          { title: "Список коллекций" },
          { title: "Детали коллекции (сетка шаблонов)" },
          { title: "Все мои экземпляры одного шаблона" },
        ],
      },
      { title: "Магазин", note: "покупка паков — карточки + выбор кол-ва" },
      {
        title: "Маркет",
        children: [
          { title: "Список лотов + фильтры/сортировка" },
          { title: "Карточка лота / подтверждение покупки" },
          { title: "Создание листинга (выбор фишки + цена)" },
        ],
      },
      {
        title: "Стейк (майнинг билетов)",
        children: [
          { title: "Слоты — пусто / занято / заблокировано" },
          { title: "Пикер фишки для слота" },
        ],
      },
      {
        title: "PvP",
        children: [
          { title: "Вкладки Все / Мои / История" },
          { title: "Модалка создания боя (выбор фишек)" },
          { title: "Модалка присоединения к бою" },
          { title: "Экран результата боя (разбор по парам)" },
        ],
      },
      {
        title: "Босс (еженедельный)",
        children: [
          { title: "Карточка босса (HP, награды по местам)" },
          { title: "Сборка отряда (5 слотов + резерв)" },
          { title: "Ручной бой (поле боя + лог раундов)" },
          { title: "Экран результата боя" },
          { title: "Турнирный лидерборд (неделя + история)" },
        ],
      },
      {
        title: "Рейд (локации)",
        children: [
          { title: "Выбор локации" },
          { title: "Полная карта (развилки, узлы, туман войны)" },
          { title: "Экран босса локации" },
          { title: "Открытие сундука на карте" },
          { title: "Лидерборд локации" },
        ],
      },
      {
        title: "Мистик-инвентарь",
        note: "боксы, артефакты, герои",
        children: [
          { title: "Сетка: боксы (счётчик ×N) + предметы" },
          { title: "Модалка открытия бокса (анимация приза)" },
          { title: "Детальная карточка артефакта/героя" },
        ],
      },
      { title: "Попап «Купить энергию»", note: "паки энергии + тест-начисление админу" },
      { title: "Попап «Ввести NFT»", note: "обмен NFT на фишку/бокс" },
    ],
  },
  {
    icon: Gift,
    title: "Мои NFT",
    route: "/my-nfts",
    items: [
      { title: "Вкладка «Дропы»", note: "карточки: доступно / частично / погашено" },
      { title: "Модалка открытия дроп-пака", note: "ожидание → анимация → результат" },
      { title: "Вкладка «Билеты»", note: "события с таймерами" },
      { title: "Вкладка «Лайки»", note: "голосование + покупка" },
      { title: "Модалка вывода NFT/токена" },
    ],
  },
  {
    icon: Users,
    title: "Рефералы",
    route: "/referrals",
    items: [
      { title: "Задания", note: "статусы: выполнено / на проверке / загрузка" },
      { title: "Ссылки-приглашения", note: "TG и веб, копирование" },
      { title: "Статистика + список приглашённых" },
    ],
  },
  {
    icon: Search,
    title: "Поиск по кошельку",
    route: "/lookup",
    items: [
      { title: "Результат поиска", note: "найдено / не найдено" },
      { title: "Админ-блок алертов по маркету" },
    ],
  },
  {
    icon: LogIn,
    title: "Вход по реферальной ссылке",
    route: "/join",
    items: [{ title: "Экран авторизации через Telegram → прихожая" }],
  },
  {
    icon: Milestone,
    title: "Роадмап",
    route: "/roadmap",
    items: [{ title: "Публичная витрина прогресса", note: "уже готова, для справки" }],
  },
  {
    icon: ShieldCheck,
    title: "Админка",
    route: "/admin/*",
    items: [
      { title: "Дропы", note: "4 режима создания + список" },
      { title: "Фишки", note: "вкладки: Коллекции / Паки / Склад / Мистик / Артефакты / Герои" },
      { title: "Лайки", note: "кандидаты / экономика / стейкинг" },
      { title: "Прихожая — конфиг" },
      { title: "Задания" },
      { title: "Билеты за NFT" },
      { title: "Магазин билетов", note: "+ распределение $DARAI" },
      { title: "Рейд-локации", note: "drill-down редактор" },
      { title: "Минт NFT" },
      { title: "Батч-раздача NFT (CSV)" },
      { title: "Журнал выплат" },
      { title: "Роадмап (админ)" },
      { title: "Аукцион" },
      { title: "Кошельки", note: "свой + аудит кошельков юзеров" },
    ],
  },
];

function countLeaves(sections: Section[]): number {
  let n = 0;
  for (const s of sections)
    for (const it of s.items) n += it.children ? it.children.length : 1;
  return n;
}

function Placeholder() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] text-muted-foreground/70">
      <ImagePlus className="h-3 w-3" />
      скрин не добавлен
    </span>
  );
}

function ScreensPage() {
  const total = countLeaves(SECTIONS);
  return (
    <div className="min-h-screen bg-background px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            <span className="text-gradient-gold">Раскадровка экранов</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Чек-лист всех страниц, вкладок, модалок и оверлеев проекта —
            составлен по коду. Каждый пункт с меткой{" "}
            <span className="inline-flex items-center gap-1 align-middle text-[11px] text-muted-foreground/80">
              <ImagePlus className="h-3 w-3" /> скрин не добавлен
            </span>{" "}
            — это отдельный кадр, куда нужно вставить реальный скриншот
            интерфейса (не рисовать заново, не имитировать).
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70">
            Если по ходу съёмки найдётся состояние экрана, которого нет в
            списке — допиши отдельным пунктом, не пропускай. Всего листов:{" "}
            <b className="text-foreground">{total}</b>.
          </p>
        </header>

        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20">
                  <section.icon className="h-[18px] w-[18px]" />
                </span>
                <h2 className="font-display text-lg font-bold">{section.title}</h2>
                {section.route && (
                  <span className="rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {section.route}
                  </span>
                )}
              </div>

              <div className="space-y-2 border-l-2 border-border/40 pl-4">
                {section.items.map((item) => (
                  <div key={item.title}>
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-card px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{item.title}</span>
                        {item.note && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {item.note}
                          </span>
                        )}
                      </div>
                      {!item.children && <Placeholder />}
                    </div>
                    {item.children && (
                      <div className="mt-2 space-y-1.5 border-l-2 border-border/30 py-1 pl-4">
                        {item.children.map((leaf) => (
                          <div
                            key={leaf.title}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card/60 px-3 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px]">{leaf.title}</span>
                              {leaf.note && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {leaf.note}
                                </span>
                              )}
                            </div>
                            <Placeholder />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
