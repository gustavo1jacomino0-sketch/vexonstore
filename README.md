# Vexon Store

Vexon Store para Vercel/GitHub com Supabase Auth e Mercado Pago Checkout Pro via Supabase Edge Functions.

## Estrutura

```text
vexon-store/
├── index.html
├── auth.html
├── pages/
├── css/
├── js/
├── assets/
└── supabase/
    ├── config.toml
    └── functions/
        ├── create-payment/index.ts
        └── mercadopago-webhook/index.ts
```

## Supabase

O frontend usa apenas a URL pública e a Publishable key em `js/supabase-config.js`.
Nunca coloque `service_role` ou o Access Token do Mercado Pago no frontend.

No Supabase Edge Functions Secrets, configure:

```text
MERCADOPAGO_ACCESS_TOKEN=SEU_ACCESS_TOKEN_PRIVADO
```

Deploy:

```bash
supabase functions deploy create-payment
supabase functions deploy mercadopago-webhook
```

O webhook usa `verify_jwt = false`, pois é chamado pelo Mercado Pago.

## Mercado Pago

Fluxo:

```text
Carrinho → create-payment → Checkout Pro → webhook → Supabase
```

Retornos:

```text
https://vexonstore.vercel.app/pages/pagamento-sucesso.html
https://vexonstore.vercel.app/pages/pagamento-falhou.html
https://vexonstore.vercel.app/pages/pagamento-pendente.html
```

Webhook:

```text
https://npivsnxqvoezopfckxne.supabase.co/functions/v1/mercadopago-webhook
```

A preferência não exclui tipos de pagamento. Assim, o Checkout Pro mantém os meios disponíveis para a conta, incluindo cartões, saldo Mercado Pago e Pix. No Brasil, o Pix é identificado pelo tipo `bank_transfer`.

**Importante sobre o Pix:** o Mercado Pago informa que o Pix no Checkout Pro só é exibido quando a conta recebedora possui uma Chave Pix cadastrada. Portanto, o código já está preparado para manter os métodos atuais + Pix; se o Pix não aparecer no ambiente de teste, verifique a configuração da Chave Pix na conta do Mercado Pago usada como recebedora.
