# Immutable zkEVM Telegram Monitor

Monitor para acompanhar suas listings na Immutable zkEVM e avisar no Telegram quando aparecer uma listing mais barata do que a sua.

## O que esta pronto

- Le a carteira `0xea869164a6d5fc0b52c347562e08e82e503bcd48`.
- Busca suas listings ativas direto na API da Immutable zkEVM.
- Agrupa por item usando o `productCode`.
- Consulta o floor do mesmo item pela busca de stacks da Immutable, sem depender da SecureHabbo.
- Permite marcar no painel quais itens devem ser monitorados.
- Envia alerta no Telegram quando outra carteira lista mais barato do que a sua menor listing daquele item.
- Guarda estado para nao repetir o mesmo alerta sem mudanca real.
- Publica o dashboard por GitHub Pages e roda o monitor 24h por GitHub Actions.

## O que nao entra agora

- WhatsApp: sem WhatsApp Business API ou outra integracao oficial, nao vale prometer isso como algo estavel.
- Comparacao entre moedas diferentes: o alerta compara o mesmo item na mesma moeda para evitar falso positivo.

## Como rodar localmente

1. Preencha o arquivo `.env`:

```env
TELEGRAM_BOT_TOKEN=seu_token_do_bot
TELEGRAM_CHAT_ID=seu_chat_id
```

2. Rode:

```powershell
node src/server.js
```

3. Abra:

```text
http://localhost:3000
```

## Como pegar o chat id

1. Abra o bot no Telegram.
2. Envie qualquer mensagem para ele.
3. Abra no navegador:

```text
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

4. Copie o `chat.id` e cole no `.env`.
