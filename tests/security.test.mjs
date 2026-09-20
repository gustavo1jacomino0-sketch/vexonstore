import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {normalizeItems,readJson,checkoutUrl,verifySignature} from '../supabase/functions/_shared/security.mjs';
import {handle as checkout} from '../supabase/functions/create-payment/index.ts';
import {handle as webhook} from '../supabase/functions/mercadopago-webhook/index.ts';
import catalog from '../supabase/functions/_shared/catalog.json' with {type:'json'};
const user='12345678-1234-4123-8123-123456789012',order='12345678-1234-4123-8123-123456789013',key='12345678-1234-4123-8123-123456789014';
const id=Object.keys(catalog)[0],product=catalog[id],item={id,quantity:2};
const settings={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',MP_ENVIRONMENT:'test',MP_COLLECTOR_ID:'456',MERCADOPAGO_ACCESS_TOKEN:'private-test',MERCADOPAGO_WEBHOOK_SECRET:'webhook-test',CHECKOUT_ENABLED:'true'};
const env=name=>settings[name];
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const req=(body={items:[item],request_id:key},headers={})=>new Request('https://example.supabase.co/functions/v1/create-payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer good-token',Origin:'https://vexonstore.vercel.app',...headers},body:JSON.stringify(body)});
test('server ignores client price, title and currency',()=>{
 const got=normalizeItems([{...item,unit_price:.01,title:'Fake',currency_id:'USD'}],catalog);
 assert.equal(got.total,product.price_cents*2);assert.equal(got.items[0].title,product.name);assert.equal(got.items[0].currency_id,'BRL');
});
for(const quantity of [-1,0,1.5,21,Infinity,'2',null])test('reject quantity '+quantity,()=>assert.throws(()=>normalizeItems([{id,quantity}],catalog)));
test('reject unknown / prototype / duplicate / oversized carts',()=>{
 for(const items of [[{id:'__proto__',quantity:1}],[{id:'p-unknown',quantity:1}],[item,item],Array(31).fill(item)])assert.throws(()=>normalizeItems(items,catalog));
});
test('body limits and malformed JSON',async()=>{
 await assert.rejects(()=>readJson(new Request('https://a.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)})));
 await assert.rejects(()=>readJson(new Request('https://a.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})));
 await assert.rejects(()=>readJson(new Request('https://a.test',{method:'POST',body:'{}'})));
});
test('checkout URL allowlist blocks javascript, credentials, suffix domains and wrong mode',()=>{
 for(const url of ['javascript:alert(1)','https://www.mercadopago.com.br.evil.test/checkout/v1','https://user@www.mercadopago.com.br/checkout/v1','http://www.mercadopago.com.br/checkout/v1','https://sandbox.mercadopago.com.br/checkout/v1'])assert.throws(()=>checkoutUrl(url,'production'));
 assert.match(checkoutUrl('https://www.mercadopago.com.br/checkout/v1?pref_id=a','production'),/^https:/);
});
function mock(overrides={}){
 const calls=[];
 const fetcher=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;calls.push({url,body,options});
  if(url.endsWith('/auth/v1/user'))return response({id:user,email:'verified@example.test',role:'authenticated'},overrides.authStatus||200);
  if(url.includes('rpc/vexon_claim_checkout'))return response(overrides.claim||{id:order});
  if(url.endsWith('/checkout/preferences'))return response({id:'pref1',collector_id:456,init_point:'https://www.mercadopago.com.br/checkout/v1?pref_id=1',sandbox_init_point:'https://sandbox.mercadopago.com.br/checkout/v1?pref_id=1'});
  if(url.includes('/v1/payments/'))return response({id:123,collector_id:456,live_mode:false,currency_id:'BRL',external_reference:order,transaction_amount:product.price_cents*2/100,status:'approved',date_last_updated:new Date().toISOString(),...overrides.payment},overrides.paymentStatus||200);
  if(url.includes('vexon_orders?')&&options.method==='PATCH')return response([{id:order}]);
  if(url.includes('vexon_orders?'))return response([{id:order,total_cents:product.price_cents*2,live_mode:false}]);
  if(url.includes('rpc/vexon_apply_payment'))return response({status:'paid'});
  throw Error('Unexpected URL '+url);
 };
 return {calls,fetcher};
}
test('anonymous and expired sessions cannot create payments',async()=>{
 for(const headers of [{Authorization:''},{Authorization:'Bearer expired'}]){
  const m=mock({authStatus:401});const result=await checkout(req(undefined,headers),env,m.fetcher);assert.equal(result.status,401);assert(!m.calls.some(c=>c.url.includes('/rest/')||c.url.includes('mercadopago.com')));
 }
});
test('untrusted origins blocked before provider calls',async()=>{const m=mock();assert.equal((await checkout(req(undefined,{Origin:'https://evil.test'}),env,m.fetcher)).status,403);assert.equal(m.calls.length,0);});
test('checkout uses authenticated email and catalog; returns only environment-selected URL',async()=>{
 const m=mock();const result=await checkout(req({items:[{...item,unit_price:.01}],request_id:key,payer:{email:'attacker@example.test'},external_reference:'fake'}),env,m.fetcher);
 assert.equal(result.status,200);const resultBody=await result.json();assert.equal(resultBody.order_id,order);assert.match(resultBody.checkout_url,/sandbox/);
 const preference=m.calls.find(c=>c.url.endsWith('/checkout/preferences')).body;
 assert.equal(preference.payer.email,'verified@example.test');assert.equal(preference.external_reference,order);assert.equal(preference.items[0].unit_price,product.price_cents/100);
 assert.equal(result.headers.get('Access-Control-Allow-Origin'),'https://vexonstore.vercel.app');
});
test('production never prefers sandbox URL',async()=>{const m=mock();const result=await checkout(req(),n=>n==='MP_ENVIRONMENT'?'production':env(n),m.fetcher);assert.match((await result.json()).checkout_url,/\/\/www\.mercadopago/);});
test('rate limit and idempotency conflict prevent provider requests',async()=>{
 for(const [error,status] of [['rate_limit',429],['processing',409],['conflict',409]]){const m=mock({claim:{error}});assert.equal((await checkout(req(),env,m.fetcher)).status,status);assert(!m.calls.some(c=>c.url.includes('api.mercadopago')));}
});
test('duplicate checkout reuses same stored URL',async()=>{const m=mock({claim:{id:order,checkout_url:'https://sandbox.mercadopago.com.br/checkout/v1?pref_id=1'}});assert.equal((await checkout(req(),env,m.fetcher)).status,200);assert(!m.calls.some(c=>c.url.includes('api.mercadopago')));});
function signed({ts=String(Math.floor(Date.now()/1000)),dataId='123',bodyId='123',secret=settings.MERCADOPAGO_WEBHOOK_SECRET,signature}={}){
 const requestId='request-123';const hash=signature||createHmac('sha256',secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
 return new Request(`https://example.supabase.co/functions/v1/mercadopago-webhook?data.id=${dataId}`,{method:'POST',headers:{'Content-Type':'application/json','x-request-id':requestId,'x-signature':`ts=${ts},v1=${hash}`},body:JSON.stringify({type:'payment',data:{id:bodyId},status:'approved'})});
}
test('valid HMAC accepted',async()=>assert.equal(await verifySignature(signed(),settings.MERCADOPAGO_WEBHOOK_SECRET),'123'));
test('forged, expired and mismatched notifications never update DB',async()=>{
 for(const options of [{secret:'wrong'},{ts:'1000000000'},{bodyId:'999'}]){const m=mock();const result=await webhook(signed(options),env,m.fetcher);assert(result.status>=400);assert.equal(m.calls.length,0);}
});
for(const payment of [{transaction_amount:.01},{collector_id:999},{live_mode:true},{currency_id:'USD'},{status:'FAKE'}])test('payment mismatch '+JSON.stringify(payment),async()=>{
 const m=mock({payment});assert((await webhook(signed(),env,m.fetcher)).status>=400);assert(!m.calls.some(c=>c.url.includes('vexon_apply_payment')));
});
test('valid notification persists provider-confirmed status',async()=>{const m=mock();assert.equal((await webhook(signed(),env,m.fetcher)).status,200);assert.equal(m.calls.find(c=>c.url.includes('vexon_apply_payment')).body.p_status,'approved');});
test('upstream failures return non-2xx to allow provider retries, without secret details',async()=>{const m=mock({paymentStatus:500});const result=await webhook(signed(),env,m.fetcher);assert.equal(result.status,502);assert(!(await result.text()).includes('private-test'));});
