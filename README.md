# Bot-vendas-baguncinha

Bot de vendas da Baguncinha: catalogo no Discord, Pix automatico, entregas automaticas ou pela staff, cupons, cargos temporarios, feedbacks, tickets e logs completos.

## Fluxo

1. Cliente escolhe o produto (`/loja` ou catalogo publicado)
2. Pode aplicar um cupom de desconto no modal de compra
3. Bot gera Pix (Mercado Pago)
4. Webhook confirma o Pix
5. Se o produto for **automatico** e houver estoque, o bot entrega na hora; senao avisa a staff
6. Staff clica em Entregar, cola o codigo/licenca (modo staff)
7. Bot envia a entrega na DM do cliente, concede cargo temporario (se configurado) e pede avaliacao
8. Cliente avalia pelo botao na DM ou por `/feedback`

Prazo padrao: **2 horas** apos o Pix confirmado.

## Comandos

Loja e cliente:

- `/loja` — abre o catalogo (so pra quem usou)
- `/catalogo` — publica o catalogo no canal (staff, exige Gerenciar Mensagens)
- `/meuspedidos` — lista seus pedidos
- `/pedido id:` — consulta um pedido
- `/feedback id: nota: comentario:` — avalia um pedido entregue
- `/avaliacoes produto:` — media e comentarios de um produto
- `/ticket assunto:` — abre um ticket de atendimento

Staff (exigem Gerenciar Servidor):

- `/estoque adicionar produto: conteudo:` — adiciona itens (um por linha)
- `/estoque listar` — mostra o estoque
- `/estoque remover produto: id:` — remove um item
- `/cupom criar codigo: tipo: valor: usos: dias: minimo: publicar:` — `publicar` (padrao sim) envia o cupom ao canal de cupons
- `/cupom listar` / `/cupom remover codigo:` / `/cupom publicar`
- `/canais exportar` — JSON com categorias e canais deste servidor
- `/canais colar arquivo:` — cola a estrutura (mesmo nome) em outro servidor
- `/categoria canal nome: categoria-existente: nova-categoria:` — cria canal em categoria nova ou existente
- `/produto listar`
- `/produto editar produto: modo: cargo: cargo-dias: preco: disponivel:`
- `/configuracao loja` — painel unico (banner, SMTP, PIX, categoria de tickets, publicar loja)
- `/gerenciar produto` — painel do produto (nome, preco, estoque, cargo, cupons, variante, apagar)
- `/config ver`
- `/config canal-logs canal:` / `/config canal-feedback canal:` / `/config categoria-ticket categoria:`
- `/painel-ticket` — publica o painel de abertura de tickets
- `/logs quantidade:` — logs de vendas recentes
- `/relatorio` — resumo de vendas

## Recursos

- **Entrega automatica**: defina o produto como `modo: auto` (`/produto editar`) e abasteca o estoque (`/estoque adicionar`). Se acabar o estoque, o pedido cai no fluxo da staff automaticamente.
- **Entrega semi-automatica**: produtos `modo: semi` sao entregues pela staff pelo botao **Entregar**.
- **Cupons**: percentual ou valor fixo, com limite de usos, validade em dias e compra minima. O codigo e opcional no modal de compra.
- **Cargos temporarios**: defina `cargo` e `cargo-dias` no produto. O cargo e dado na entrega e removido automaticamente ao expirar (mesmo apos reiniciar, pois fica salvo).
- **Feedbacks**: apos a entrega o cliente recebe um botao de avaliacao na DM. As avaliacoes vao para o canal de feedback e/ou sao vistas com `/avaliacoes`.
- **Tickets**: use `/painel-ticket` num canal. O botao abre um canal privado com o cliente e a staff; o botao **Fechar ticket** trava o canal e o renomeia.
- **Logs completos**: pedido criado, cupom aplicado, pagamento, entrega, cancelamento, expiracao, prazo estourado, cargos e tickets. Todos vao para o canal definido em `/config canal-logs` (nunca para o canal da lojinha) e ficam salvos em `data/store.json` + `data/loja.db`.
- **Engrenagem so para staff**: o botao ⚙️ nao aparece na vitrine publica; so a staff ve no painel efemero do produto.
- **Carrinho automatico**: ao gerar o Pix, o bot envia o QR na DM, abre um canal privado **seu-carrinho** (so o comprador) e um botao **Ir ao carrinho**. No Pix aprovado, um GIF de 6s aparece so nesse canal.
- **Fechar ticket apaga o canal**.
- **Nome PIX publico**: `/config pix-nome` — o app do banco mostra o nome da loja, nao seu nome completo.
- **Entrega DM ou e-mail**: o cliente escolhe onde receber. SMTP em `/config smtp`.
- **Categorias**: `/categoria criar` e seletor na vitrine e no atendimento. `/categoria canal` cria canal Discord em categoria nova ou ja existente.
- **Cupons no canal**: ao criar (`/cupom criar` ou painel do produto) o painel em <#cupons> e atualizado, a menos que `publicar: false` / `nao`.
- **Estrutura de canais**: `/canais exportar` neste servidor e `/canais colar` no outro; nomes iguais nao sao duplicados.
- **Banner**: `top`, `bottom`, `thumbnail`, `float` (`/config banner-posicao` e `/produto editar`).
- **Instrucoes do produto**: campo no extra do produto (ex: acesse o site X e cole o codigo).
- **Logo no QR**: `assets/qr-logo.png` vai no centro do QR Code.

## Variaveis de ambiente

Copie `.env.example` e preencha no Render:

- `TOKEN` — token do bot
- `CLIENT_ID` — application id
- `GUILD_ID` — id do servidor
- `OWNER_ID` — seu Discord id
- `ADMIN_CHANNEL_ID` — canal privado de pedidos
- `ADMIN_ROLE_ID` — cargo avisado em pedido novo e que acessa os tickets
- `PORT` — porta HTTP (Render usa 10000)
- `PUBLIC_URL` — URL publica do servico, ex. `https://bot-vendas.onrender.com`
- `MERCADOPAGO_ACCESS_TOKEN` — token de producao ou teste
- `MERCADOPAGO_WEBHOOK_SECRET` — secret do webhook (opcional, recomendado)
- `PAYER_EMAIL` — email usado no pagador do Pix

No painel do Mercado Pago, o webhook deve apontar para:

```
https://SEU-SERVICO/webhook/mercadopago
```

## Permissoes do bot

Para os recursos internos funcionarem, o bot precisa de:

- **Gerenciar Cargos**, com o cargo do bot acima do cargo temporario na hierarquia
- **Gerenciar Canais**, para criar e travar tickets
- **Enviar Mensagens** nos canais de logs e feedback

O cargo em `ADMIN_ROLE_ID` e adicionado automaticamente aos novos tickets.

## Produtos

Os produtos ficam em `PRODUTOS` no `index.js`, mas tambem podem ser ajustados em tempo de execucao com `/produto editar` (preco, modo, disponibilidade e cargo temporario). Os ajustes ficam salvos em `data/store.json`.

Precos iniciais:

- Discord Nitro 1 mes — R$ 24,90
- Discord Nitro 3 meses — R$ 64,90
- 2 Boosts de servidor — R$ 19,90

## Problemas de "Missing Access" (50001)

No plano free do Render nao da pra abrir shell. O proprio bot imprime o diagnostico ao iniciar:
basta reiniciar o servico e olhar os logs (aba **Logs**). Ele mostra o dono do token, se o
`CLIENT_ID` confere e em quais servidores o bot esta.

Se quiser rodar na mao em outro lugar, existe tambem:

```
npm run diagnostico
```

Causas mais comuns:

1. O bot nao foi convidado pro servidor (ou foi convidado o app errado).
2. O convite nao tinha o escopo `applications.commands`.

Convite correto (reconvide mesmo se o bot ja aparece no servidor, pra liberar os comandos):

```
https://discord.com/oauth2/authorize?client_id=SEU_CLIENT_ID&scope=bot%20applications.commands&permissions=8
```

3. `TOKEN` de uma aplicacao e `CLIENT_ID` de outra. O diagnostico detecta.

## Start

```
npm install
npm start
```
