// MVP AI-помощника: принимает текст заявки, просит нейросеть разобрать её и возвращает карточку.
// Запуск: npm start (ключ берётся из файла .env, в коде его нет).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { anonymize, restore, logEvents } = require("./anonymize");
const bitrix = require("./bitrix");

const KEY = process.env.LLM_API_KEY;
const BASE = (process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const MODELS = (process.env.LLM_MODEL || "google/gemma-4-31b-it:free").split(",").map((s) => s.trim()).filter(Boolean);
const PORT = Number(process.env.PORT) || 3100;
const PROMPT = fs.readFileSync(path.join(__dirname, process.env.PROMPT_FILE || "system_prompt.md"), "utf8");
const FIELDS = ["company", "summary", "lead_type", "key_data", "missing_data", "next_step", "reply_draft", "needs_human", "human_reason"];

async function askModel(text) {
  const errors = [];
  for (let round = 0; round < 2; round++) {
    let limited = false;
    for (const model of MODELS) {
      try {
        const r = await fetch(`${BASE}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 900,
            messages: [{ role: "system", content: PROMPT }, { role: "user", content: text }],
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (r.status === 401) throw new Error("Ключ нейросети не принят (HTTP 401). Проверьте LLM_API_KEY в .env.");
        if (!r.ok) { limited = limited || r.status === 429; errors.push(`${model}: HTTP ${r.status}`); continue; }
        const data = await r.json();
        const content = data.choices?.[0]?.message?.content || "";
        const card = parseCard(content);
        if (card) { console.log(`Ответила модель ${model}`); return card; }
        errors.push(`${model}: ответ не похож на JSON`);
      } catch (e) {
        if (String(e.message).includes("HTTP 401")) throw e;
        errors.push(`${model}: ${e.message}`);
      }
    }
    if (!limited) break;
    await new Promise((res) => setTimeout(res, 4000));
  }
  throw new Error("Все модели недоступны: " + errors.join("; "));
}

function parseCard(content) {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const card = {};
    for (const f of FIELDS) card[f] = obj[f] ?? "не указано";
    return card;
  } catch { return null; }
}

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type + "; charset=utf-8" });
  res.end(body);
}

http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    return send(res, 200, "text/html", fs.readFileSync(path.join(__dirname, "public", "index.html")));
  }
  if (req.method === "POST" && req.url === "/api/process") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      try {
        const { name = "", contact = "", text = "" } = JSON.parse(body);
        if (!text.trim() || !name.trim() || !contact.trim()) return send(res, 400, "application/json", JSON.stringify({ error: "Заполните имя, контакт и текст заявки" }));
        if (!KEY) return send(res, 500, "application/json", JSON.stringify({ error: "Не задан LLM_API_KEY в файле .env" }));
        // 1. Маскируем персональные данные. Имя и контакт из формы в нейросеть не отправляются вообще.
        const masked = anonymize(text, [name]);
        logEvents(Date.now().toString(36), masked.events);
        // 2. Нейросеть видит только текст с метками.
        const cardMasked = await askModel("[Служебно: имя и контакт клиента уже получены через форму и скрыты от вас. Не запрашивай их и не добавляй в missing_data.]\n\n" + masked.text);
        // 3. Возвращаем реальные данные в карточку для менеджера.
        const card = restore(cardMasked, masked.map);
        const result = { card, sent_to_ai: masked.text, masked_labels: Object.keys(masked.map), bitrix: { status: "не подключён" } };
        // 4. Лид в Битрикс24 и уведомление менеджеру.
        if (bitrix.enabled()) {
          try {
            const leadId = await bitrix.createLead({ name, contact, card, text });
            result.bitrix = { status: "лид создан", lead_id: leadId };
            try { await bitrix.notifyManager({ leadId, card, name }); result.bitrix.notified = true; }
            catch (e) { result.bitrix.notified = false; result.bitrix.notify_error = e.message; }
          } catch (e) { result.bitrix = { status: "ошибка", error: e.message }; }
        }
        send(res, 200, "application/json", JSON.stringify(result));
      } catch (e) {
        console.error(e.message);
        send(res, 502, "application/json", JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  send(res, 404, "text/plain", "Не найдено");
}).listen(PORT, () => console.log(`Откройте http://localhost:${PORT}`));
