// Битрикс24: создание лида и уведомление менеджеру через входящий вебхук (адрес в .env, B24_URL).
const URL_BASE = (process.env.B24_URL || "").replace(/\/?$/, "/");
const NOTIFY_USER = process.env.B24_NOTIFY_USER_ID || "1";
const enabled = () => Boolean(process.env.B24_URL);

async function call(method, body) {
  const r = await fetch(`${URL_BASE}${method}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(`${method}: ${data.error_description || data.error || "HTTP " + r.status}`);
  return data.result;
}

async function createLead({ name, contact, card, text }) {
  const isEmail = /@/.test(contact);
  const fields = {
    TITLE: `Заявка (${card.lead_type}): ${card.company !== "не указано" ? card.company : name}`,
    NAME: name,
    COMMENTS:
      `Тип лида: ${card.lead_type}\nСуть: ${card.summary}\nНе хватает: ${[].concat(card.missing_data).join(", ")}\n` +
      `Следующий шаг: ${card.next_step}\nНужен человек: ${card.needs_human ? "да (" + card.human_reason + ")" : "нет"}\n` +
      `\nЧерновик ответа:\n${card.reply_draft}\n\nИсходная заявка:\n${text}`,
    SOURCE_ID: "WEB",
  };
  if (isEmail) fields.EMAIL = [{ VALUE: contact, VALUE_TYPE: "WORK" }];
  else fields.PHONE = [{ VALUE: contact, VALUE_TYPE: "WORK" }];
  return call("crm.lead.add", { fields });
}

async function notifyManager({ leadId, card, name }) {
  const flag = card.needs_human ? " ТРЕБУЕТСЯ ЧЕЛОВЕК." : "";
  return call("im.notify", {
    USER_ID: NOTIFY_USER,
    MESSAGE: `Новая заявка #${leadId} от ${name}. Тип: ${card.lead_type}.${flag} Шаг: ${card.next_step}`,
  });
}

module.exports = { enabled, createLead, notifyManager };
