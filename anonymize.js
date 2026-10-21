// Слой анонимизации: заменяет персональные данные метками перед отправкой в нейросеть
// и возвращает их обратно в ответе. Словарь меток живёт только в памяти на время одного запроса.
const fs = require("fs");
const path = require("path");

const PATTERNS = [
  ["EMAIL", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["ТЕЛЕФОН", /(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g],
  ["ИНН", /\b\d{12}\b|\b\d{10}\b/g],
];

function anonymize(text, knownNames = []) {
  const map = {};
  const counters = {};
  const events = [];
  const put = (type, value) => {
    for (const [label, v] of Object.entries(map)) if (v === value) return label;
    counters[type] = (counters[type] || 0) + 1;
    const label = `[${type}_${counters[type]}]`;
    map[label] = value;
    events.push({ type, label });
    return label;
  };
  let out = text;
  for (const [type, re] of PATTERNS) out = out.replace(re, (m) => put(type, m));
  // Имя и фамилия из формы: ищем слова целиком и по основе (Иван, Ивана, Ивану).
  for (const full of knownNames) {
    for (const word of String(full).split(/\s+/).filter((w) => w.length >= 3)) {
      const stem = word.length > 4 ? word.slice(0, -1) : word;
      const re = new RegExp(`(^|[^\\p{L}])(${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\p{L}*)`, "giu");
      out = out.replace(re, (m, pre, w) => pre + put("ИМЯ", w));
    }
  }
  return { text: out, map, events };
}

function restore(value, map) {
  if (typeof value === "string") {
    return Object.entries(map).reduce((s, [label, real]) => s.split(label).join(real), value);
  }
  if (Array.isArray(value)) return value.map((v) => restore(v, map));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restore(v, map)]));
  }
  return value;
}

// Журнал в CSV: только время, номер запроса, тип данных и метка. Самих значений в журнале нет.
function logEvents(requestId, events) {
  if (!events.length) return;
  const file = path.join(__dirname, "logs", "anonymization_log.csv");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "время,запрос,тип,метка\n");
  const t = new Date().toISOString();
  fs.appendFileSync(file, events.map((e) => `${t},${requestId},${e.type},${e.label}`).join("\n") + "\n");
}

module.exports = { anonymize, restore, logEvents };
