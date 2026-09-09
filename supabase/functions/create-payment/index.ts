import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SITE_URL = "https://vexonstore.vercel.app";
const SUPABASE_URL = "https://npivsnxqvoezopfckxne.supabase.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { items, payer, external_reference } = await req.json();
    if (!Array.isArray(items) || !items.length) throw new Error("Nenhum produto foi enviado.");

    const normalizedItems = items.map((item: any) => {
      const quantity = Math.floor(Number(item?.quantity ?? 0));
      const unit_price = Number(item?.unit_price ?? 0);
      const title = String(item?.title ?? "").trim();
      if (!title || quantity < 1 || !Number.isFinite(unit_price) || unit_price <= 0) throw new Error("Um ou mais produtos possuem dados inválidos.");
      return { id: String(item.id ?? ""), title: title.slice(0, 256), quantity, unit_price: Number(unit_price.toFixed(2)), currency_id: "BRL" };
    });

    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");

    const preference = {
      items: normalizedItems,
      payer: payer?.email ? { email: String(payer.email).trim(), name: String(payer.name ?? "Cliente Vexon").trim().slice(0, 120) } : undefined,
      external_reference: String(external_reference ?? `VEXON-${Date.now()}`).slice(0, 256),
      back_urls: {
        success: `${SITE_URL}/pages/pagamento-sucesso.html`,
        failure: `${SITE_URL}/pages/pagamento-falhou.html`,
        pending: `${SITE_URL}/pages/pagamento-pendente.html`,
      },
      auto_return: "approved",
      notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,
      // Não restringimos os meios de pagamento aqui.
      // O Checkout Pro disponibiliza os meios habilitados para a conta, incluindo Pix
      // (bank_transfer), cartões e saldo Mercado Pago.
      // O próprio Mercado Pago determina quais métodos estão disponíveis para o comprador.
    };

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(preference),
    });
    const data = await response.json();

    if (!response.ok) return new Response(JSON.stringify({ error: "Erro ao criar pagamento no Mercado Pago.", details: data }), { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ id: data.id, init_point: data.init_point, sandbox_init_point: data.sandbox_init_point }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("create-payment:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
