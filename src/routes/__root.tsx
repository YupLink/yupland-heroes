import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query";
import { Toaster } from "@/components/ui/sonner";
import { CreditNoticesWatcher } from "@/components/CreditNoticesWatcher";
import { SessionSync } from "@/components/SessionSync";
import { NearConnectorBridge } from "@/components/NearConnectorBridge";
import { TgGuard } from "@/components/TgGuard";
import { VersionProvider } from "@/lib/versionCheck";
import { VersionBanner } from "@/components/VersionBanner";
import { PwaSetup } from "@/components/Pwa";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { BetaGate } from "@/components/BetaGate";

import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient-gold">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Этот мешочек оказался пустым. Вернитесь на главную.
        </p>
        <div className="mt-6">
          <Link
            to="/home"
            className="inline-flex items-center justify-center rounded-full gradient-gold px-5 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "YupLink" },
      {
        name: "description",
        content:
          "Погашение NFT в сети NEAR: открой свой мешочек и получи награду в одном из токенов экосистемы Golden Darai.",
      },
      { name: "theme-color", content: "#0a0a0f" },
      // PWA / iOS standalone — открытие с «Домой» как отдельное приложение.
      { name: "application-name", content: "YupLink" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "YupLink" },
      { property: "og:title", content: "YupLink" },
      {
        property: "og:image",
        content: "https://service.yupland.io/yuplink-logo.png",
      },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "640" },
      { property: "og:image:height", content: "478" },
      { property: "og:url", content: "https://service.yupland.io" },
      { property: "og:site_name", content: "YupLink" },
      {
        name: "twitter:image",
        content: "https://service.yupland.io/yuplink-logo.png",
      },
      {
        property: "og:description",
        content:
          "Случайная или фиксированная награда, погашение один раз. NEAR · Golden Darai.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/yuplink-logo.png" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon-2.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

// Polyfill `process` для библиотек ожидающих Node-style global
// (near-seed-phrase → bip39 → tweetnacl, secrets.js-grempe).
// Выполняется ДО загрузки bundle через inline-script.
const PROCESS_POLYFILL = `
if(typeof window!=='undefined'){
  if(typeof window.process==='undefined'){
    window.process={env:{NODE_ENV:'production'},platform:'browser',version:'v22.0.0',versions:{node:'22.0.0'},browser:true,nextTick:function(cb){setTimeout(cb,0)}};
  }
  if(typeof window.global==='undefined'){window.global=window;}
}`;

// ПОЛИФИЛЛЫ для старых webview (MIUI/Xiaomi/старый Android Chromium, старый Safari):
// бандл и библиотеки зовут reportError(Chrome95), Object.hasOwn(93), .at(92),
// crypto.randomUUID(92), Object.fromEntries(73), queueMicrotask(71), replaceAll(85),
// flat/flatMap(69). Без них старый вебвью падал белым экраном («e.replaceAll is not a
// function» и т.п.). Инлайн ДО бандла (чанки async → этот скрипт при парсинге раньше).
// Всё на ES5-синтаксисе, чтобы сам полифилл не упал. См. [[target-device-xiaomi-13t]].
const OLDWEBVIEW_POLYFILL = `(function(){try{
var g=(typeof globalThis!=="undefined")?globalThis:(typeof window!=="undefined"?window:this);
if(typeof globalThis==="undefined"){try{g.globalThis=g;}catch(e){}}
if(!Object.hasOwn){Object.defineProperty(Object,"hasOwn",{value:function(o,k){return Object.prototype.hasOwnProperty.call(o,k);},configurable:true,writable:true});}
if(!Object.fromEntries){Object.fromEntries=function(it){var o={},a=Array.isArray(it)?it:Array.prototype.slice.call(it);for(var i=0;i<a.length;i++){o[a[i][0]]=a[i][1];}return o;};}
function __at(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return (n<0||n>=this.length)?undefined:this[n];}
if(!Array.prototype.at){Object.defineProperty(Array.prototype,"at",{value:__at,configurable:true,writable:true});}
if(!String.prototype.at){Object.defineProperty(String.prototype,"at",{value:__at,configurable:true,writable:true});}
if(!Array.prototype.flat){Object.defineProperty(Array.prototype,"flat",{value:function(d){d=d===undefined?1:(Number(d)||0);var f=function(a,dd){return a.reduce(function(acc,v){return acc.concat((Array.isArray(v)&&dd>0)?f(v,dd-1):[v]);},[]);};return f(this,d);},configurable:true,writable:true});}
if(!Array.prototype.flatMap){Object.defineProperty(Array.prototype,"flatMap",{value:function(cb,ta){return Array.prototype.map.call(this,cb,ta).flat();},configurable:true,writable:true});}
if(!String.prototype.replaceAll){Object.defineProperty(String.prototype,"replaceAll",{value:function(a,b){return Object.prototype.toString.call(a)==="[object RegExp]"?this.replace(a,b):this.split(a).join(b);},configurable:true,writable:true});}
if(typeof queueMicrotask!=="function"){try{g.queueMicrotask=function(cb){Promise.resolve().then(cb);};}catch(e){}}
if(typeof reportError!=="function"){try{g.reportError=function(err){setTimeout(function(){throw err;},0);};}catch(e){}}
if(typeof crypto!=="undefined"&&crypto&&!crypto.randomUUID){try{crypto.randomUUID=function(){return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16);});};}catch(e){}}
}catch(e){}})();`;

// Юпик идёт, как только догрузилась его анимация, — без кода игры (на медленном
// канале он грузится десятки секунд). Только отметка на заставке: стили и
// раскладку не трогает (инцидент 13.10 с отложенными стилями — см. память).
const EARLY_YUPIK_WALK = `document.addEventListener("load",function(e){var t=e.target;if(t&&t.classList&&t.classList.contains("game-load-state__runner--walking")&&t.naturalWidth>0){var s=t.closest(".game-load-state");if(s)s.setAttribute("data-walk-ready","true")}},true);`;

// Reveal the server-rendered splash before the game hydrates.
const EARLY_TG_READY = `(function(){try{if(!document.querySelector('.game-load-state--fullscreen'))return;var tg=window.Telegram&&window.Telegram.WebApp;if(tg&&tg.ready)tg.ready();}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <script dangerouslySetInnerHTML={{ __html: OLDWEBVIEW_POLYFILL }} />
        <script dangerouslySetInnerHTML={{ __html: PROCESS_POLYFILL }} />
        <script dangerouslySetInnerHTML={{ __html: EARLY_YUPIK_WALK }} />
        {/*
          Telegram Mini Apps SDK. Без этого скрипта window.Telegram.WebApp
          не существует — мы не можем понять, что юзер открыт внутри TG,
          и отправляем его подключать кошелёк внутри TG, где HOT и наш
          сервис живут в разных Mini App-песочницах и не могут общаться.
          С SDK platform известна → WalletModal открывает внешний браузер.
        */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <HeadContent />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: EARLY_TG_READY }} />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <VersionProvider>
        <VersionBanner />
        <PwaSetup />
        <SessionSync />
        <NearConnectorBridge />
        <TgGuard />
        <BetaGate>
          <Outlet />
        </BetaGate>
        <MaintenanceGate />
        <CreditNoticesWatcher />
        <Toaster />
      </VersionProvider>
    </QueryClientProvider>
  );
}
