# SecureHabbo Telegram Monitor

Projeto inicial para monitorar suas listings na SecureHabbo / Immutable zkEVM e avisar no Telegram quando aparecer uma listing mais barata do que a sua.

## O que esta pronto

- Le a carteira `0xea869164a6d5fc0b52c347562e08e82e503bcd48`.
- Busca suas listings ativas na Immutable zkEVM.
- Agrupa por item usando o `productCode`.
- Consulta o mercado da SecureHabbo para o mesmo item.
- Permite marcar no painel web quais itens devem ser monitorados.
- Envia alerta no Telegram quando outra carteira lista mais barato do que a sua menor listing daquele item.
- Guarda estado local para nao repetir o mesmo alerta sem mudanca de preco/listing.

## O que nao esta entrando agora

- WhatsApp: sem WhatsApp Business API ou outra integracao oficial, eu nao recomendo prometer isso como algo estavel. Da para forcar com automacao nao oficial, mas quebra facil e pode bloquear conta.
- Comparacao entre moedas diferentes: nesta primeira versao o alerta compara o mesmo item e a mesma moeda da sua listing para evitar falso positivo.

## Como rodar

1. Abra o arquivo `.env`.
2. Preencha:

```env
TELEGRAM_BOT_TOKEN=seu_token_do_bot
TELEGRAM_CHAT_ID=seu_chat_id
```

3. Rode:

```powershell
node src/server.js
```

4. Abra:

```text
http://localhost:3000
```

5. No painel:
- clique em `Atualizar agora`
- ative os itens que voce quer monitorar
- clique em `Testar Telegram`

## Como pegar o chat id

1. Crie o bot no BotFather.
2. Envie qualquer mensagem para o bot no Telegram.
3. Abra no navegador:

```text
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

4. Copie o `chat.id` da conversa e cole no `.env`.
