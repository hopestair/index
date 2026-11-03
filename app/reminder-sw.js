/*
 * 묵상 알림 서비스 워커 조각(src/modules/reminder/agent.ts와 짝). 빌드한 서비스 워커(sw.js)가 같은 주소에서 불러 쓴다.
 * 서버 없이 기기 안에서만: 앱이 기기 캐시 'dd-reminder'에 넣어 둔 알림 계획을 읽어,
 * 그날 시각이 지났고 아직 띄우지 않은 알림을 띄운다. 바깥으로 보내는 것은 없다.
 */
const DD_REMINDER_CACHE = 'dd-reminder';
const DD_REMINDER_FILE = 'dd-reminder.json';
const DD_REMINDER_KEEP = 40;

function ddReminderUrl() {
  return new URL(DD_REMINDER_FILE, self.registration.scope).href;
}

/** 기기 시간대의 오늘 'YYYY-MM-DD' */
function ddReminderToday(now) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function ddReminderShowDue() {
  const cache = await caches.open(DD_REMINDER_CACHE);
  const hit = await cache.match(ddReminderUrl());
  if (!hit) return;
  const plan = await hit.json();
  if (!plan || !plan.on || !Array.isArray(plan.items)) return;
  const now = Date.now();
  const today = ddReminderToday(now);
  const shown = Array.isArray(plan.shown) ? plan.shown : [];
  const due = plan.items.filter((i) => i.date === today && i.at <= now && !shown.includes(i.date)).pop();
  if (!due) return;
  plan.shown = [...shown, due.date].slice(-DD_REMINDER_KEEP);
  await cache.put(ddReminderUrl(), new Response(JSON.stringify(plan), { headers: { 'Content-Type': 'application/json' } }));
  await self.registration.showNotification(due.title, {
    body: due.body,
    tag: 'dd-reminder',
    lang: plan.lang,
    icon: 'pwa-192.png',
    data: { url: './#/m/verse' },
  });
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'dd-reminder') event.waitUntil(ddReminderShowDue().catch(() => undefined));
});

// 알림을 누르면 열려 있는 앱 창으로 가고, 없으면 오늘의 구절 화면을 연다
self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== 'dd-reminder') return;
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
