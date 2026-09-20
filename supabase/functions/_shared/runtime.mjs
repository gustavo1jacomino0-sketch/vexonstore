import { HttpError } from './security.mjs';
export function runtime(env, fetcher = fetch) {
  function required(name) { const value = env(name); if (!value) throw new HttpError(503, 'Configuração do serviço pendente.'); return value; }
  const base = required('SUPABASE_URL');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)) throw new HttpError(503, 'Configuração do serviço pendente.');
  const mode = required('MP_ENVIRONMENT');
  if (!['test', 'production'].includes(mode)) throw new HttpError(503, 'Configuração do serviço pendente.');
  async function request(url, options = {}) { return fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  async function db(path, method = 'GET', body) {
    const key = required('SUPABASE_SERVICE_ROLE_KEY');
    const response = await request(`${base}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new HttpError(503, 'Não foi possível registrar a operação. Tente novamente.');
    return response.status === 204 ? null : response.json();
  }
  async function user(req) {
    const auth = req.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9_.-]+$/.test(auth) || auth.length > 8192) throw new HttpError(401, 'Entre na sua conta para continuar.');
    const response = await request(`${base}/auth/v1/user`, { headers: { apikey: required('SUPABASE_ANON_KEY'), Authorization: auth } });
    if (!response.ok) throw new HttpError(response.status >= 500 ? 503 : 401, 'Sessão inválida ou expirada. Entre novamente.');
    const data = await response.json();
    if (!data.id || !data.email || data.is_anonymous || data.role !== 'authenticated') throw new HttpError(401, 'Entre na sua conta para continuar.');
    return data;
  }
  async function mp(path, options = {}) {
    const response = await request(`https://api.mercadopago.com${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${required('MERCADOPAGO_ACCESS_TOKEN')}`, ...options.headers } });
    if (!response.ok) throw new HttpError(502, 'Não foi possível consultar o provedor de pagamento. Tente novamente.');
    return response.json();
  }
  return { required, base, mode, db, user, mp };
}
