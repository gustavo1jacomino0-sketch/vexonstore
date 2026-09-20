# Segurança e instalação — Vexon Store

## O que foi corrigido

| Risco anterior | Alteração |
| --- | --- |
| Preço e comprador enviados pelo navegador eram aceitos | Servidor valida a sessão no Supabase, usa o e-mail autenticado, ignora preço/título do cliente e recalcula 33 produtos do catálogo local da função |
| Notificações sem autenticação | HMAC-SHA256 em `x-signature`, ID da query ligado ao corpo, timestamp com tolerância de 15 minutos; consulta independente à API do Mercado Pago |
| Pagamento sem vínculo persistente ao pedido | Pedido criado antes do checkout; ID gerado no banco; total, moeda, recebedor e ambiente conferidos antes de registrar pagamento |
| Repetição e concorrência | Chave por operação, reserva transacional, limite de cinco novos checkouts por usuário a cada dez minutos e atualização idempotente por pagamento/data |
| Acesso indevido ao banco | RLS e privilégios: comprador só lê colunas permitidas dos próprios pedidos; não insere, altera ou exclui pedidos/pagamentos; funções SQL só para `service_role` |
| Retorno “aprovado” sem prova | As três páginas consultam o status real do banco, sem confiar no parâmetro `status` da URL |
| Carrinho herdava conteúdo não confiável do navegador | Catálogo estático local, validação de IDs/quantidades, mapas sem protótipo, nenhum nome/imagem de produto vindo do localStorage |
| Carrinho de visitante duplicava quantidades | Mesclagem limitada, sem duplicação e limpeza dos dados de visitante após mesclar |
| Recuperação de senha sem conclusão | Formulário para nova senha, fluxo PKCE, verificação da sessão, tentativa de encerrar sessões após redefinir |
| Erros e logs com dados excessivos | Mensagens controladas; sem imprimir tokens, e-mails ou respostas completas do provedor |
| Scripts inline / dependência flutuante em CDN | Scripts locais, Supabase JS versionado e CSP sem `unsafe-inline` para JavaScript |
| Publicação podia expor arquivos internos | Build publica somente HTML, JS, CSS e assets; SQL, testes, documentação, `.env` e funções ficam fora de `dist/` |

## Ativação obrigatória, nesta ordem

1. Faça backup do projeto e do banco. Instale primeiro em um ambiente de testes. A migração cria `vexon_orders`, `vexon_payments` e funções `vexon_*`, sem alterar tabelas antigas. Se já existirem nomes iguais, revise o conflito; não apague tabelas para contornar o erro.
2. No SQL Editor do Supabase, execute **uma vez** `supabase/migrations/202609200001_security.sql`. Se usar migrations pela CLI, aplique pela CLI em vez do SQL Editor, para manter o histórico consistente.
3. Confira `supabase/functions/_shared/catalog.json`. Os valores foram copiados da vitrine existente e não foram validados comercialmente. Ajuste itens não disponíveis para `active: false`.
4. Em Edge Functions → Secrets, configure as variáveis abaixo. Nunca coloque os valores privados no frontend, no Git ou no chat.

| Secret | Valor / finalidade |
| --- | --- |
| `SITE_URL` | `https://vexonstore.vercel.app`, sem barra final; altere se usar domínio próprio |
| `MP_ENVIRONMENT` | `test` para testes; `production` somente depois da homologação |
| `MP_COLLECTOR_ID` | ID numérico da conta Mercado Pago recebedora correspondente ao Access Token |
| `MERCADOPAGO_ACCESS_TOKEN` | Token privado da conta/ambiente escolhido |
| `MERCADOPAGO_WEBHOOK_SECRET` | Chave secreta de assinatura gerada na configuração de Webhooks da aplicação Mercado Pago; não é o Access Token |
| `CHECKOUT_ENABLED` | `true` somente após catálogo, banco e Secrets estarem conferidos. Ausente ou outro valor bloqueia novas compras |
| `ALLOWED_ORIGINS` | Opcional: origens adicionais exatas separadas por vírgula, por exemplo a URL HTTPS de homologação. Não usar `*`. `SITE_URL` já é permitido |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são lidos apenas no runtime das funções e normalmente disponibilizados pelo Supabase. Confira sua disponibilidade no ambiente. Não substitua a chave pública do navegador pela `service_role`.

5. Publique as duas funções a partir da pasta do projeto:

```sh
supabase functions deploy create-payment
supabase functions deploy mercadopago-webhook
```

O `config.toml` usa `verify_jwt = false`: **isso não torna o checkout público**. O handler exige Bearer token e valida-o em `/auth/v1/user` antes de criar pedidos. No webhook a autenticação é feita pela assinatura HMAC. Não remova essas verificações do código.

6. No painel da aplicação Mercado Pago, configure Webhooks para eventos **payment** no ambiente escolhido:

```text
https://npivsnxqvoezopfckxne.supabase.co/functions/v1/mercadopago-webhook
```

Use notificações Webhooks assinadas, não IPN legado. Faça um pagamento de teste e confira o recebimento de `x-signature`, `x-request-id` e `data.id` na URL. A assinatura precisa ser homologada com a aplicação real. A janela de 15 minutos exige relógio correto e reentregas assinadas recentemente; se o provedor reenviar uma assinatura antiga, ela será rejeitada. Falhas de banco/provedor retornam erro para permitir novas tentativas.

7. Em Supabase Authentication, ajuste a URL do site e permita o redirecionamento exato `https://vexonstore.vercel.app/auth.html` (e a URL de homologação usada). Configure **mínimo de 12 caracteres também no servidor**: a validação do HTML sozinha não impede chamadas diretas. Revise limites de autenticação, política de sessões e SMTP. Confirmação de e-mail não foi ativada ou desativada por este pacote; mantenha a decisão apropriada ao seu projeto. O fluxo PKCE exige abrir o link de recuperação/confirmar no mesmo navegador que iniciou a solicitação.
8. Rode `npm test` e `npm run build`. Publique o projeto na Vercel com build `npm run build` e saída `dist`; remova overrides antigos dessas opções no painel, caso existam. Se usar outro domínio Supabase, atualize `js/supabase-config.js` e o `connect-src` em `vercel.json`.
9. Teste cadastro, login, logout, recuperação, carrinho entre categorias, pagamento pendente/aprovado/recusado e reembolso. Depois teste que duas contas não enxergam pedidos uma da outra. Só então troque os Secrets para produção e faça uma compra controlada.

## Comportamentos importantes

- Formas de pagamento não foram restringidas: Checkout Pro mantém os métodos da conta, como antes. `MP_ENVIRONMENT` decide a URL retornada; não há preferência automática por sandbox em produção.
- As preferências expiram após uma hora. O reuso do checkout é limitado a 55 minutos, evitando reabrir links quase expirados.
- Se houver timeout depois de reservar o pedido, a mesma chave fica bloqueada para não criar outra preferência por engano. Consulte `vexon_orders` e o painel Mercado Pago antes de liberar uma nova tentativa. Não marque `paid` manualmente apenas por informação trazida pelo cliente.
- Repetir o mesmo webhook não duplica pagamentos; eventos mais antigos não substituem estados recentes. Múltiplos pagamentos aprovados para um mesmo pedido levam a `review`, sem liberação automática.
- `paid` não dispara entrega ou baixa de estoque. A operação comercial ainda deve conferir pedido, estoque/frete e eventuais contestações no painel do provedor. Este pacote não adiciona um processo de expedição.
- A CSP permite estilos inline para preservar o design existente, mas bloqueia scripts inline, eventos HTML, frames e plugins. A chave de sessão continua no armazenamento do navegador por ser um site estático com Supabase Auth; proteção por cookie HttpOnly exigiria uma arquitetura de autenticação no servidor.
- A limitação do checkout é por usuário autenticado; não substitui proteção de infraestrutura contra tráfego abusivo. Rate limits de Auth e políticas de acesso do projeto precisam ser configurados no serviço. MFA para contas administrativas do Supabase, Mercado Pago e Vercel deve ser habilitado pelos responsáveis.
- Tabelas anteriores do seu Supabase e histórico remoto do Git não foram acessados. Revise RLS nelas separadamente. Se alguma credencial privada já foi publicada anteriormente, revogue-a; apagar o arquivo atual não remove o segredo do histórico.

## Evidências e limites da revisão

Foram executados testes locais de adulteração de preços, quantidades, IDs, URLs, sessões, origem e assinatura, com chamadas Supabase/Mercado Pago simuladas. A migração e as regras de acesso foram exercitadas em PostgreSQL local via PGlite, incluindo isolamento entre compradores, bloqueio de escrita, idempotência, eventos atrasados e reembolsos.

No Chromium local, com os cabeçalhos de produção aplicados pelo servidor de testes, foram verificados: bloqueio de JavaScript injetado pela CSP, tentativa de adulterar nomes/preços/imagens no localStorage, carrinho e favoritos, navegação pelas cinco categorias, layouts de 390 e 768 pixels, abas de autenticação, recusa de falsa aprovação por query string e bloqueio dos arquivos privados fora da saída pública. Esses testes não usam contas reais.

Também foi testada a recuperação com provedor simulado: exibição do formulário de nova senha após `PASSWORD_RECOVERY`, chamada de atualização, encerramento global das sessões e retorno ao login. Uma tentativa de login recusada restaura o botão corretamente.

Integridade do SDK local: Supabase JS 2.116.0, obtido de `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js`, SHA-256 `84ee9bf45695c1dd3ba1595b6bcfb0f09672434631351ffc8ebe9140545d5ff6`. A licença está em `js/vendor/SUPABASE-LICENSE.txt`.

Não foram usados tokens privados do usuário nem executadas migrações, publicações ou pagamentos em suas contas. Testes locais não são uma certificação de segurança nem substituem homologação com o Supabase e Mercado Pago reais.

Referências de configuração: [autenticação em Edge Functions](https://supabase.com/docs/guides/functions/auth), [cabeçalhos de segurança na Vercel](https://vercel.com/docs/cdn-security/security-headers). A documentação pública de assinatura do Mercado Pago não ficou acessível durante esta revisão; confirme o formato e o comportamento de reentrega na documentação/painel da aplicação ao homologar.
