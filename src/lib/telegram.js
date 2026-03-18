async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    throw new Error("Telegram is not configured yet.");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram error ${response.status}: ${body}`);
  }

  return response.json();
}

async function listTelegramChats(botToken) {
  if (!botToken) {
    throw new Error("Telegram bot token is missing.");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram error ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const updates = Array.isArray(payload.result) ? payload.result : [];
  const chats = new Map();

  for (const update of updates) {
    const candidate =
      update.message?.chat ||
      update.channel_post?.chat ||
      update.edited_message?.chat ||
      update.edited_channel_post?.chat ||
      update.callback_query?.message?.chat;

    if (!candidate?.id) {
      continue;
    }

    chats.set(String(candidate.id), {
      id: String(candidate.id),
      type: candidate.type || "unknown",
      title: candidate.title || candidate.username || candidate.first_name || "Chat sem nome",
      username: candidate.username || "",
    });
  }

  return [...chats.values()];
}

module.exports = {
  listTelegramChats,
  sendTelegramMessage,
};
