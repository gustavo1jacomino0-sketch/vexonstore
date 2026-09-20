export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function normalizeItems(items, catalog) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw new HttpError(400, 'Carrinho inválido.');
  const seen = new Set(); let total = 0;
  const result = items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^p-[a-z0-9-]{1,100}$/.test(item.id) || seen.has(item.id)) throw new HttpError(400, 'Produto inválido ou repetido.');
    seen.add(item.id);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new HttpError(400, 'Quantidade inválida (máximo de 20 por produto).');
    const product = Object.hasOwn(catalog, item.id) ? catalog[item.id] : null;
    if (!product?.active || !Number.isSafeInteger(product.price_cents) || product.price_cents <= 0) throw new HttpError(400, 'Produto indisponível.');
    total += product.price_cents * item.quantity;
    return { id: item.id, title: product.name, quantity: item.quantity, unit_price: product.price_cents / 100, currency_id: 'BRL' };
  });
  if (!Number.isSafeInteger(total) || total > 10000000) throw new HttpError(400, 'Total excede o limite permitido.');
  return { items: result, total };
}
export async function readJson(req, limit = 16384) {
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Envie JSON.');
  if (Number(req.headers.get('content-length')) > limit) throw new HttpError(413, 'Requisição muito grande.');
  const reader = req.body?.getReader(); if (!reader) throw new HttpError(400, 'Requisição vazia.');
  const parts = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new HttpError(413, 'Requisição muito grande.'); } parts.push(value); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'JSON inválido.'); }
}
export function checkoutUrl(value, mode) {
  try {
    const url = new URL(value), host = mode === 'production' ? 'www.mercadopago.com.br' : 'sandbox.mercadopago.com.br';
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.username || url.password || !url.pathname.startsWith('/checkout/')) throw Error();
    return url.href;
  } catch { throw new HttpError(502, 'Endereço de pagamento inválido.'); }
}
export async function verifySignature(req, secret, now = Date.now()) {
  const signature = req.headers.get('x-signature') || '', requestId = req.headers.get('x-request-id') || '';
  const ids = new URL(req.url).searchParams.getAll('data.id');
  if (ids.length !== 1 || !/^[a-zA-Z0-9]{1,80}$/.test(ids[0]) || !/^[a-zA-Z0-9-]{1,150}$/.test(requestId)) throw new HttpError(401, 'Assinatura inválida.');
  const pairs = signature.split(',').map(part => part.trim().split('='));
  const times = pairs.filter(([k]) => k === 'ts'), hashes = pairs.filter(([k]) => k === 'v1');
  if (times.length !== 1 || hashes.length !== 1 || !/^\d{10,13}$/.test(times[0][1]) || !/^[a-f0-9]{64}$/i.test(hashes[0][1])) throw new HttpError(401, 'Assinatura inválida.');
  const ts = times[0][1], stamp = ts.length === 13 ? Number(ts) : Number(ts) * 1000;
  if (Math.abs(now - stamp) > 15 * 60 * 1000) throw new HttpError(401, 'Notificação expirada.');
  const id = ids[0].toLowerCase();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(hashes[0][1].match(/../g), part => parseInt(part, 16));
  if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`id:${id};request-id:${requestId};ts:${ts};`))) throw new HttpError(401, 'Assinatura inválida.');
  return id;
}
export async function sha256(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
export function json(data, status = 200, headers = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }); }
export function failure(error, headers = {}) {
  const status = error instanceof HttpError ? error.status : 503;
  if (status >= 500) console.error('vexon_request_failed', { status });
  return json({ error: error instanceof HttpError ? error.message : 'Serviço temporariamente indisponível. Tente novamente.' }, status, headers);
}
