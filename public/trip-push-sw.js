/* Push-only worker: no page, API or scoring caches. */
self.addEventListener('push', event => {
 let payload = {}; try { payload = event.data?.json() ?? {}; } catch {}
 const url = typeof payload.url === 'string' && /^\/golf-trips\/[0-9a-f-]{36}#momentum$/i.test(payload.url) ? payload.url : '/golf-trips';
 event.waitUntil(self.registration.showNotification(typeof payload.title === 'string' ? payload.title.slice(0,80) : 'The Maroon', {
  body: typeof payload.body === 'string' ? payload.body.slice(0,180) : 'Your round has an update.',
  icon: '/icons/mm-192.png', tag: payload.tag, data: { url }
 }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil((async () => {
  const url = new URL(event.notification.data?.url ?? '/golf-trips', self.location.origin);
  if (url.origin !== self.location.origin) return;
  const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing = windows.find(client => new URL(client.url).pathname === url.pathname);
  if (existing) { await existing.navigate(url.href); return existing.focus(); }
  return self.clients.openWindow(url.href);
 })());
});
