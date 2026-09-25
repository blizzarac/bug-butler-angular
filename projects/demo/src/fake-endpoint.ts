/** Answers POST {path} in the browser so the demo works without a server. Logs what would have been sent. */
export function installFakeEndpoint(path: string): void {
  const realFetch = window.fetch.bind(window);
  let counter = 1287;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (new URL(url, location.href).pathname !== path || init?.method !== 'POST') return realFetch(input, init);
    const form = init.body as FormData;
    const report = JSON.parse(await (form.get('report') as Blob).text());
    console.info('[demo] Bug report that would be sent:', report, form.getAll('screenshots'), form.getAll('attachments'));
    await new Promise((r) => setTimeout(r, 600));
    const key = `QA-${counter++}`;
    return new Response(JSON.stringify({ key, url: `https://example.atlassian.net/browse/${key}` }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
