(() => {
  const script = document.currentScript;
  const endpoint = script?.dataset.endpoint;
  if (!endpoint) return;
  const consented = () => window.funnellensConsent === true || document.documentElement.dataset.funnellensConsent === 'true';
  const send = (event) => {
    if (!consented()) return;
    const payload = {
      eventId: crypto.randomUUID(),
      event,
      occurredAt: new Date().toISOString(),
      pageUrl: `${location.origin}${location.pathname}`,
      consentBasis: 'visitor_consent',
      properties: { referrerOrigin: document.referrer ? new URL(document.referrer).origin : '' },
    };
    fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  };
  if (consented()) send('page_view');
  document.addEventListener('click', (event) => {
    if (!consented()) return;
    const target = event.target instanceof Element ? event.target.closest('[data-funnellens-cta]') : null;
    if (target) send('cta_click');
  }, { passive: true });
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (consented() && form instanceof HTMLFormElement && form.matches('[data-funnellens-form]')) send('form_submission');
  }, true);
})();
