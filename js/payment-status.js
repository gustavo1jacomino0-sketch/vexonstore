(() => {
  'use strict';
  const title=document.getElementById('payment-title'), text=document.getElementById('payment-message');
  const show=(a,b)=>{title.textContent=a;text.textContent=b;};
  const client=window.vexonSupabase;
  async function check(){
    if(!client)throw Error('unavailable');
    const {data:session,error:authError}=await client.auth.getUser();
    if(authError||!session.user){show('Entre para consultar','Acesse sua conta para consultar a confirmação do pedido.');return;}
    // URL parameters only identify a record. Neither status nor payment_id is proof.
    let last;try{last=sessionStorage.getItem('vexon_last_order');}catch(_){}
    const id=new URLSearchParams(location.search).get('external_reference')||last;
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id||'')){show('Pedido não identificado','Não foi possível identificar seu pedido. Entre em contato com a loja.');return;}
    const {data,error}=await client.from('vexon_orders').select('id,status,live_mode').eq('id',id).eq('user_id',session.user.id).maybeSingle();
    if(error)throw error;
    if(!data){show('Pedido não encontrado','Confira se você está na mesma conta usada na compra.');return;}
    const statuses={paid:['Pagamento confirmado','Recebemos a confirmação do pagamento. Obrigado pela compra!'],pending:['Aguardando confirmação','Seu pagamento ainda está sendo confirmado. Atualize a página em alguns instantes.'],rejected:['Pagamento não aprovado','Confira os dados no Mercado Pago antes de tentar novamente.'],cancelled:['Pagamento cancelado','O pagamento deste pedido foi cancelado.'],refunded:['Pagamento reembolsado','O pagamento deste pedido foi reembolsado.'],partially_refunded:['Reembolso parcial','Há um reembolso parcial associado ao seu pedido.'],charged_back:['Pagamento contestado','Entre em contato com a loja para acompanhar seu pedido.'],review:['Pedido em análise','Entre em contato com a loja para acompanhar seu pedido.']};
    const [heading,description]=statuses[data.status]||statuses.pending;
    show(heading,(data.live_mode?'':'Ambiente de testes. ')+description);
    if(data.status!=='pending')try{sessionStorage.removeItem('vexon_store_v2_checkout_'+session.user.id);}catch(_){}
  }
  check().catch(()=>show('Confirmação indisponível','Não foi possível consultar o pedido agora. Esta página não comprova pagamento; tente novamente em instantes.'));
})();
