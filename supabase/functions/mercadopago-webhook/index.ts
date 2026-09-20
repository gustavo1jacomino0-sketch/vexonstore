import { HttpError, verifySignature, readJson, uuid, json, failure } from '../_shared/security.mjs';
import { runtime } from '../_shared/runtime.mjs';

export async function handle(req: Request, env = (key: string) => Deno.env.get(key), fetcher = fetch) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
    const app = runtime(env, fetcher);
    const id = await verifySignature(req, app.required('MERCADOPAGO_WEBHOOK_SECRET'));
    const body = await readJson(req);
    if (String(body?.data?.id).toLowerCase() !== id) throw new HttpError(400, 'Identificador divergente.');
    if (body.type !== 'payment') return json({ received: true, ignored: true });
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'Pagamento inválido.');
    const payment = await app.mp(`/v1/payments/${id}`);
    if (String(payment.id) !== id || String(payment.collector_id) !== app.required('MP_COLLECTOR_ID') || payment.live_mode !== (app.mode === 'production') || payment.currency_id !== 'BRL') throw new HttpError(409, 'Pagamento não corresponde à integração.');
    if (!uuid(payment.external_reference)) return json({ received: true, ignored: true });
    const orders = await app.db(`vexon_orders?id=eq.${payment.external_reference}&select=id,total_cents,live_mode`), order = orders?.[0];
    if (!order) return json({ received: true, ignored: true });
    const cents = Math.round(Number(payment.transaction_amount) * 100);
    if (!Number.isSafeInteger(cents) || cents !== order.total_cents || payment.live_mode !== order.live_mode) throw new HttpError(409, 'Valor ou ambiente divergente.');
    const allowed = ['pending', 'in_process', 'authorized', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back', 'in_mediation'];
    if (!allowed.includes(payment.status) || !Number.isFinite(Date.parse(payment.date_last_updated))) throw new HttpError(502, 'Estado de pagamento inválido.');
    const refunded = Math.round(Number(payment.transaction_amount_refunded || 0) * 100);
    if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > cents) throw new HttpError(502, 'Reembolso inválido.');
    await app.db('rpc/vexon_apply_payment', 'POST', { p_order: order.id, p_payment: id, p_status: payment.status, p_updated: payment.date_last_updated, p_amount: cents, p_refunded: refunded, p_live: payment.live_mode });
    return json({ received: true });
  } catch (error) { return failure(error); }
}
if (import.meta.main) Deno.serve((req: Request) => handle(req));
