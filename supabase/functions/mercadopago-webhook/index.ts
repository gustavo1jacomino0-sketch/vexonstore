import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("OK", { status: 200 });

  try {
    const body = await req.json();
    console.log("Notificação Mercado Pago:", JSON.stringify(body));

    if (body?.type !== "payment") return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const paymentId = body?.data?.id;
    if (!paymentId) return new Response(JSON.stringify({ received: true, ignored: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");

    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const payment = await response.json();

    if (!response.ok) {
      console.error("Erro ao consultar pagamento:", payment);
      return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("Pagamento Mercado Pago:", {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
      transaction_amount: payment.transaction_amount,
      payment_type_id: payment.payment_type_id,
      date_approved: payment.date_approved,
    });

    // Atualização da tabela de pedidos fica para quando o schema definitivo for criado.
    return new Response(JSON.stringify({ received: true, payment_id: payment.id, status: payment.status }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("mercadopago-webhook:", error);
    return new Response(JSON.stringify({ received: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
