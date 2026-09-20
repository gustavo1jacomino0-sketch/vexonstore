# Vexon Store — remodelagem visual

## Como usar

1. Faça uma cópia de segurança da pasta atual do projeto.
2. Extraia este ZIP e abra a pasta `vexon-store-remodelado` no VS Code.
3. Para atualizar seu repositório existente, copie o conteúdo dessa pasta para a pasta do projeto. Preserve a pasta `.git` que já existe no seu computador.
4. Abra `index.html` com o Live Server para conferir o resultado antes de publicar.

## Alterações

- Novo banner editorial com um card flutuante em perspectiva 3D.
- Identidade preta e laranja, gradientes discretos e novas superfícies.
- Cards com inclinação suave ao mover o mouse em computadores.
- Botões com relevo, novas bordas, espaçamentos e estados de foco.
- Visual atualizado nas categorias, autenticação, carrinho e páginas de retorno.
- Ajustes de layout para celular e respeito à preferência de movimento reduzido.

As alterações estão em `css/redesign.css`, `js/visual-effects.js` e nos HTMLs. Os arquivos originais `js/auth.js`, `js/shop.js`, `js/supabase-config.js`, `js/password-toggle.js` e as funções de pagamento não foram modificados.

## Verificação e limites

Foram verificadas a sintaxe dos scripts, as referências locais das dez páginas e a preservação dos arquivos de lógica existentes. A renderização visual e as interações em navegador não foram validadas neste ambiente, porque o navegador de testes não estava disponível. Nenhuma operação foi executada no Supabase ou Mercado Pago e nenhum site foi publicado.

Esta entrega trata somente do visual. As pendências de pedidos, validação de preços, modo de testes do checkout, recuperação de senha e transferência do carrinho apontadas na análise anterior continuam sem alterações.
