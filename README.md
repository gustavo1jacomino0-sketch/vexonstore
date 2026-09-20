# Vexon Store — visual remodelado e revisão de segurança

**Leia `SEGURANCA-E-INSTALACAO.md` antes de substituir a versão publicada.**
O checkout agora depende da migração SQL e dos Secrets indicados nesse guia. Enviar somente os HTMLs não ativa as proteções do pagamento.

O visual e os efeitos 3D foram preservados. As alterações de segurança incluem validação da sessão no servidor, catálogo de preços confiável, webhook assinado, pedidos com RLS, consulta real do status, endurecimento dos dados locais, recuperação de senha e cabeçalhos HTTP.

## Arquivos

- `index.html`, `auth.html`, `pages/`, `css/`, `js/`, `assets/`: site.
- `supabase/functions/`: funções de checkout e webhook, utilitários e catálogo.
- `supabase/migrations/202609200001_security.sql`: tabelas e permissões novas, com prefixo `vexon_`.
- `vercel.json`: build, pasta pública e cabeçalhos.
- `scripts/`: build e validação locais, não publicados.
- `tests/security.test.mjs`: testes de entradas maliciosas e funções com serviços simulados.

## Verificação local

Use Node.js 22.18 ou superior (testado com Node 24):

```sh
npm run check
npm test
npm run build
```

Não é necessário instalar dependências para esses comandos. Sirva `dist/` com Live Server após o build. Na Vercel, publique apenas `dist/`, respeitando `vercel.json`.

O Supabase JS 2.116.0 está incluído localmente em `js/vendor/`, com a licença, sem carregar JavaScript de um CDN em cada visita. A chave `sb_publishable_...` do frontend é pública por definição; as chaves privadas ficam somente nos Secrets das Edge Functions.

## Preços e produtos

O catálogo autoritativo é `supabase/functions/_shared/catalog.json`: preços em centavos e `active` para disponibilidade. Foram importados os 33 produtos dos HTMLs originais; confirme preço e disponibilidade reais antes de ativar vendas. Não há controle de estoque ou cálculo de frete neste pacote.

Ao alterar catálogo: rode `npm run build`, publique o site e publique novamente `create-payment`. Preços, nomes e imagens do carrinho vêm da cópia estática do catálogo; os valores cobrados sempre são recalculados pelo servidor. Descrições, imagens de vitrine e preços riscados promocionais ainda devem ser editados no HTML quando necessário.

Não use as páginas de retorno como comprovante de venda. Elas consultam o pedido com a sessão do comprador; parâmetros da URL não confirmam pagamento.
