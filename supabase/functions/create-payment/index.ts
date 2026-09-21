import catalog from '../_shared/catalog.json' with { type: 'json' };
import { HttpError, normalizeItems, readJson, checkoutUrl, uuid, sha256, json, failure } from '../_shared/security.mjs';
import { runtime } from '../_shared/runtime.mjs';

function makeBlingSku(name: string) {
  const clean = String(name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  return clean ? `VEX-${clean}` : '';
}

async function assertBlingStock(items: Array<{ title: string; quantity: number }>, base: string, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(`${base}/functions/v1/bling-stock`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
  } catch (_) {
    throw new HttpError(503, 'Não foi possível confirmar o estoque. Tente novamente.');
  }

  if (!response.ok) throw new HttpError(503, 'Não foi possível confirmar o estoque. Tente novamente.');

  let data: any;
  try { data = await response.json(); } catch (_) {
    throw new HttpError(503, 'Não foi possível confirmar o estoque. Tente novamente.');
  }
  if (data?.ok !== true || !Array.isArray(data?.produtos)) {
    throw new HttpError(503, 'Não foi possível confirmar o estoque. Tente novamente.');
  }

  const bySku = new Map<string, number>();
  for (const row of data.produtos) {
    const sku = String(row?.sku || '').trim().toUpperCase();
    const qty = Number(row?.quantidade_disponivel);
    if (/^VEX-[A-Z0-9-]{1,120}$/.test(sku) && Number.isFinite(qty)) {
      bySku.set(sku, Math.max(0, Math.floor(qty)));
    }
  }

  for (const item of items) {
    const sku = makeBlingSku(item.title);
    const available = bySku.get(sku);
    if (!Number.isSafeInteger(available)) throw new HttpError(503, `Não foi possível confirmar o estoque de ${item.title}.`);
    if (available <= 0) throw new HttpError(409, `${item.title} está esgotado.`);
    if (item.quantity > available) throw new HttpError(409, `${item.title}: somente ${available} ${available === 1 ? 'unidade disponível' : 'unidades disponíveis'}.`);
  }
}

export async function handle(req: Request, env = (key: string) => Deno.env.get(key), fetcher = fetch) {
  let headers: Record<string, string> = {};
  try {
    const site = env('SITE_URL') || 'https://vexonstore.vercel.app';
    if (new URL(site).origin !== site || !site.startsWith('https://')) throw new HttpError(503, 'Configuração do serviço pendente.');
    const allowed = new Set([site, ...(env('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)]);
    const origin = req.headers.get('origin');
    if (origin && !allowed.has(origin)) throw new HttpError(403, 'Origem não permitida.');
    if (origin) headers = { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const app = runtime(env, fetcher), user = await app.user(req);
    if (!uuid(user.id)) throw new HttpError(401, 'Sessão inválida.');
    if (env('CHECKOUT_ENABLED') !== 'true') throw new HttpError(503, 'O checkout está em manutenção. Tente mais tarde.');
    app.required('MERCADOPAGO_ACCESS_TOKEN'); app.required('MERCADOPAGO_WEBHOOK_SECRET'); app.required('MP_COLLECTOR_ID');
    const body = await readJson(req);
    if (!uuid(body?.request_id)) throw new HttpError(400, 'Identificador da operação inválido.');
    const { items, total } = normalizeItems(body.items, catalog);
    items.sort((a, b) => a.id.localeCompare(b.id));
    await assertBlingStock(items, app.base, fetcher);
    const fingerprint = await sha256(JSON.stringify({ items, mode: app.mode }));
    const claim = await app.db('rpc/vexon_claim_checkout', 'POST', { p_user: user.id, p_key: body.request_id, p_hash: fingerprint, p_total: total, p_items: items, p_live: app.mode === 'production' });
    if (claim.error === 'rate_limit') throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
    if (claim.error) throw new HttpError(409, 'Esta operação já está em andamento ou expirou. Consulte o pedido antes de tentar outra compra.');
    if (claim.checkout_url) return json({ checkout_url: checkoutUrl(claim.checkout_url, app.mode), order_id: claim.id }, 200, headers);
    const orderId = claim.id;
    // One preference attempt per key. Uncertain provider results stay locked.
    const preference = await app.mp('/checkout/preferences', {
      method: 'POST', headers: { 'X-Idempotency-Key': orderId },
      body: JSON.stringify({ items, payer: { email: user.email }, external_reference: orderId,
        back_urls: { success: `${site}/pages/pagamento-sucesso.html`, failure: `${site}/pages/pagamento-falhou.html`, pending: `${site}/pages/pagamento-pendente.html` },
        auto_return: 'approved', notification_url: `${app.base}/functions/v1/mercadopago-webhook`,
        expires: true, expiration_date_to: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
    if (String(preference.collector_id) !== app.required('MP_COLLECTOR_ID')) throw new HttpError(502, 'Conta recebedora divergente.');
    const url = checkoutUrl(app.mode === 'production' ? preference.init_point : preference.sandbox_init_point, app.mode);
    const saved = await app.db(`vexon_orders?id=eq.${orderId}`, 'PATCH', { preference_id: String(preference.id), checkout_url: url });
    if (!saved?.length) throw new HttpError(503, 'Não foi possível registrar o checkout.');
    return json({ checkout_url: url, order_id: orderId }, 200, headers);
  } catch (error) { return failure(error, headers); }
}
if (import.meta.main) Deno.serve((req: Request) => handle(req));
