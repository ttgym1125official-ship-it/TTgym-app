// Google カレンダーの iCal（.ics）から、指定した日（日本時間）の予定を取り出す。
// 毎週・毎日などの繰り返し（RRULE の FREQ / INTERVAL / BYDAY / UNTIL / COUNT）、除外日（EXDATE）、
// 繰り返しの一部だけ変えた予定（RECURRENCE-ID）、キャンセル（STATUS:CANCELLED）に対応する。

const JST = 9 * 3600 * 1000;
const DAY = 86400000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const unescape = v => String(v || "").replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

function lines(text) {
  // 75文字で折り返された行（次の行が空白で始まる）をつなぐ
  return String(text || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

// "DTSTART;TZID=Asia/Tokyo:20261111T100000" → { ms: UTCミリ秒, allDay }
// TZID 付き・Z なしは日本時間とみなす（TTGYM のカレンダーは日本時間）
function parseDate(prop, value) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h == null || /VALUE=DATE(;|$)/.test(prop)) return { ms: Date.UTC(+y, +mo - 1, +d) - JST, allDay: true };
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return { ms: z ? utc : utc - JST, allDay: false };
}

export function parseIcs(text) {
  const events = [];
  let ev = null;
  for (const line of lines(text)) {
    if (line === "BEGIN:VEVENT") { ev = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (ev?.start) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const prop = line.slice(0, i), value = line.slice(i + 1);
    const name = prop.split(";")[0].toUpperCase();
    if (name === "DTSTART") ev.start = parseDate(prop, value);
    else if (name === "DTEND") ev.end = parseDate(prop, value);
    else if (name === "SUMMARY") ev.summary = unescape(value);
    else if (name === "LOCATION") ev.location = unescape(value);
    else if (name === "DESCRIPTION") ev.description = unescape(value).slice(0, 300);
    else if (name === "UID") ev.uid = value.trim();
    else if (name === "STATUS") ev.status = value.trim().toUpperCase();
    else if (name === "RRULE") ev.rrule = Object.fromEntries(value.split(";").map(kv => kv.split("=")));
    else if (name === "EXDATE") for (const v of value.split(",")) { const d = parseDate(prop, v.trim()); if (d) ev.exdates.push(d.ms); }
    else if (name === "RECURRENCE-ID") ev.recurrenceId = parseDate(prop, value)?.ms ?? null;
  }
  return events;
}

// 繰り返しの予定のうち、[from, to) に始まる回の開始時刻（UTCミリ秒）
function occurrences(ev, from, to) {
  const start = ev.start.ms;
  if (!ev.rrule) return start >= from && start < to ? [start] : [];
  const r = ev.rrule;
  const freq = (r.FREQ || "").toUpperCase();
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const until = r.UNTIL ? parseDate("", r.UNTIL)?.ms ?? Infinity : Infinity;
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const byday = r.BYDAY ? r.BYDAY.split(",").map(d => WEEKDAYS.indexOf(d.slice(-2))).filter(n => n >= 0) : null;
  const out = [];
  let n = 0;
  const startJst = new Date(start + JST);
  const timeOfDay = start - (Date.UTC(startJst.getUTCFullYear(), startJst.getUTCMonth(), startJst.getUTCDate()) - JST);
  const dayIndex = ms => Math.floor((ms + JST) / DAY);
  const firstDay = dayIndex(start);
  // 日ごとに見ていく（数年先までの繰り返しでも、対象の日を過ぎたら止める）
  for (let day = firstDay; ; day++) {
    const t = day * DAY - JST + timeOfDay;
    if (t >= to || t > until || n >= count) break;
    const d = new Date(day * DAY);
    const diff = day - firstDay;
    let hit = false;
    if (freq === "DAILY") hit = diff % interval === 0;
    else if (freq === "WEEKLY") {
      // 何週目かは、最初の回の週（日曜はじまり）から数える。隔週（INTERVAL=2）などに使う
      const firstDow = new Date(firstDay * DAY).getUTCDay();
      const weekNo = Math.floor((day - (firstDay - firstDow)) / 7);
      hit = (byday || [firstDow]).includes(d.getUTCDay()) && weekNo % interval === 0;
    } else if (freq === "MONTHLY") {
      hit = d.getUTCDate() === new Date(firstDay * DAY).getUTCDate()
        && ((d.getUTCFullYear() - startJst.getUTCFullYear()) * 12 + d.getUTCMonth() - startJst.getUTCMonth()) % interval === 0;
    } else if (freq === "YEARLY") {
      hit = d.getUTCDate() === startJst.getUTCDate() && d.getUTCMonth() === startJst.getUTCMonth();
    } else hit = diff === 0;
    if (!hit) continue;
    n++;
    if (t >= from && !ev.exdates.includes(t)) out.push(t);
    if (day - firstDay > 3660) break;
  }
  return out;
}

const hhmm = ms => new Date(ms + JST).toISOString().slice(11, 16);

// date: "2026-11-11"（日本時間の日付）→ その日の予定（時間順）
export function eventsOn(events, date) {
  const from = Date.parse(`${date}T00:00:00Z`) - JST;
  const to = from + DAY;
  // 繰り返しの一部だけ変更・キャンセルした回
  const overrides = new Map();
  for (const ev of events) if (ev.recurrenceId != null) overrides.set(`${ev.uid}|${ev.recurrenceId}`, ev);
  const out = [];
  for (const ev of events) {
    if (ev.recurrenceId != null) {
      if (ev.status !== "CANCELLED" && ev.start.ms < to && (ev.end?.ms ?? ev.start.ms + 1) > from) out.push({ ev, start: ev.start.ms });
      continue;
    }
    if (ev.status === "CANCELLED") continue;
    for (const t of occurrences(ev, from, to)) {
      if (overrides.has(`${ev.uid}|${t}`)) continue;
      out.push({ ev, start: t });
    }
  }
  return out
    .map(({ ev, start }) => {
      const len = ev.end ? ev.end.ms - ev.start.ms : 0;
      return {
        summary: ev.summary || "（タイトルなし）", allDay: ev.start.allDay,
        start: ev.start.allDay ? "" : hhmm(start), end: ev.start.allDay || !len ? "" : hhmm(start + len),
        location: ev.location || "", description: ev.description || "",
      };
    })
    .sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
}
