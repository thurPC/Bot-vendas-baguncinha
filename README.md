# Bot-vendas-baguncinha

Bot de vendas da Baguncinha: catalogo no Discord, Pix automatico, pedido pra staff e entrega pro cliente.

## Fluxo

1. Cliente escolhe o produto (`/loja` ou catalogo publicado)
2. Bot gera Pix (Mercado Pago)
3. Aguarda o pagamento
4. Webhook confirma o Pix
5. Staff recebe o pedido no canal admin
6. Staff clica em Entregar, cola o codigo/licenca
7. Bot envia a entrega na DM do cliente

Prazo padrao: **50 minutos** apos o Pix confirmado.

## Comandos

- `/loja` — abre o catalogo (so pra quem usou)
- `/catalogo` — publica o catalogo no canal (staff)
- `/meuspedidos` — lista seus pedidos
- `/pedido id:` — consulta um pedido

## Variaveis de ambiente

Copie `.env.example` e preencha no Render:

- `TOKEN` — token do bot
- `CLIENT_ID` — application id
- `GUILD_ID` — id do servidor
- `OWNER_ID` — seu Discord id
- `ADMIN_CHANNEL_ID` — canal privado de pedidos
- `ADMIN_ROLE_ID` — cargo avisado em pedido novo
- `PORT` — porta HTTP (Render usa 10000)
- `PUBLIC_URL` — URL publica do servico, ex. `https://bot-vendas.onrender.com`
- `MERCADOPAGO_ACCESS_TOKEN` — token de producao ou teste
- `MERCADOPAGO_WEBHOOK_SECRET` — secret do webhook (opcional, recomendado)
- `PAYER_EMAIL` — email usado no pagador do Pix

No painel do Mercado Pago, o webhook deve apontar para:

```
https://SEU-SERVICO/webhook/mercadopago
```

## Produtos

Edite `PRODUTOS` em `index.js` pra mudar nome, preco (em centavos) e texto. Precos atuais:

- Discord Nitro 1 mes — R$ 24,90
- Discord Nitro 3 meses — R$ 64,90
- 2 Boosts de servidor — R$ 19,90

## Start

```
npm install
npm start
```
