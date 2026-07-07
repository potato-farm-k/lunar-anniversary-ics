(function () {
  "use strict";

  const END_YEAR = 2072;
  const STORAGE_KEY = "lunar-anniversary-ics-items";
  const UTF8_ENCODER = new TextEncoder();
  const formatter = new Intl.DateTimeFormat("ko-KR-u-ca-dangi", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul"
  });

  const form = document.querySelector("#anniversary-form");
  const titleInput = document.querySelector("#title");
  const startYearInput = document.querySelector("#start-year");
  const monthInput = document.querySelector("#lunar-month");
  const dayInput = document.querySelector("#lunar-day");
  const listBody = document.querySelector("#anniversary-list");
  const previewList = document.querySelector("#preview-list");
  const previewCaption = document.querySelector("#preview-caption");
  const countEl = document.querySelector("#event-count");
  const downloadButton = document.querySelector("#download-ics");
  const clearButton = document.querySelector("#clear-all");

  const currentYear = new Date().getFullYear();
  startYearInput.value = Math.min(Math.max(currentYear, 1900), END_YEAR);

  let items = loadItems();
  let lastPreviewEvents = [];
  const lunarCache = new Map();

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      title: titleInput.value.trim(),
      startYear: Number(startYearInput.value),
      lunarMonth: Number(monthInput.value),
      lunarDay: Number(dayInput.value)
    };

    const message = validateItem(item);
    if (message) {
      alert(message);
      return;
    }

    const events = generateEvents(item);
    if (!events.length) {
      alert("선택한 음력 날짜로 생성할 수 있는 양력 날짜를 찾지 못했습니다.");
      return;
    }

    items.push(item);
    saveItems();
    titleInput.value = "";
    monthInput.value = "";
    dayInput.value = "";
    titleInput.focus();
    render(events, item.title);
  });

  listBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;

    items = items.filter((item) => item.id !== button.dataset.deleteId);
    saveItems();
    render([]);
  });

  downloadButton.addEventListener("click", () => {
    const allEvents = items.flatMap(generateEvents);
    if (!allEvents.length) return;

    const blob = new Blob([buildIcs(allEvents)], {
      type: "text/calendar;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lunar-anniversaries-until-2072.ics";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  clearButton.addEventListener("click", () => {
    if (!items.length) return;
    if (!confirm("누적 목록을 모두 비울까요?")) return;
    items = [];
    saveItems();
    render([]);
  });

  render();

  function validateItem(item) {
    if (!item.title) return "기념일 이름을 입력해 주세요.";
    if (!Number.isInteger(item.startYear) || item.startYear < 1900 || item.startYear > END_YEAR) {
      return "시작 음력 연도는 1900년부터 2072년 사이로 입력해 주세요.";
    }
    if (!Number.isInteger(item.lunarMonth) || item.lunarMonth < 1 || item.lunarMonth > 12) {
      return "음력 월은 1부터 12 사이로 입력해 주세요.";
    }
    if (!Number.isInteger(item.lunarDay) || item.lunarDay < 1 || item.lunarDay > 30) {
      return "음력 일은 1부터 30 사이로 입력해 주세요.";
    }
    return "";
  }

  function generateEvents(item) {
    const events = [];
    for (let lunarYear = item.startYear; lunarYear <= END_YEAR; lunarYear += 1) {
      const solar = findSolarDate(lunarYear, item.lunarMonth, item.lunarDay);
      if (!solar) continue;

      events.push({
        title: item.title,
        lunarYear,
        lunarMonth: item.lunarMonth,
        lunarDay: item.lunarDay,
        date: solar,
        uid: `${uidToken(item)}-${lunarYear}-${item.lunarMonth}-${item.lunarDay}@lunar-anniversary-ics`
      });
    }
    return events;
  }

  function findSolarDate(lunarYear, lunarMonth, lunarDay) {
    const key = `${lunarYear}-${lunarMonth}-${lunarDay}`;
    if (lunarCache.has(key)) return lunarCache.get(key);

    const cursor = new Date(Date.UTC(lunarYear, 0, 1));
    const last = new Date(Date.UTC(lunarYear + 1, 2, 15));

    while (cursor <= last) {
      const lunar = getLunarParts(cursor);
      if (
        lunar.relatedYear === lunarYear &&
        lunar.month === lunarMonth &&
        lunar.day === lunarDay &&
        !lunar.isLeapMonth
      ) {
        const found = toDateOnly(cursor);
        lunarCache.set(key, found);
        return found;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    lunarCache.set(key, null);
    return null;
  }

  function getLunarParts(date) {
    const parts = formatter.formatToParts(date);
    const yearPart = parts.find((part) => part.type === "relatedYear" || part.type === "year");
    const monthPart = parts.find((part) => part.type === "month");
    const dayPart = parts.find((part) => part.type === "day");
    const monthText = monthPart ? monthPart.value : "";

    return {
      relatedYear: Number(yearPart ? yearPart.value.replace(/\D/g, "") : NaN),
      month: Number((monthText.match(/\d+/) || [""])[0]),
      day: Number(dayPart ? dayPart.value.replace(/\D/g, "") : NaN),
      isLeapMonth: monthText.includes("윤")
    };
  }

  function toDateOnly(date) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate()
    };
  }

  function buildIcs(events) {
    const stamp = formatUtcTimestamp(new Date());
    const sorted = [...events].sort((a, b) => dateValue(a.date).localeCompare(dateValue(b.date)));
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Codex Practice//Lunar Anniversary ICS//KO",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ];

    sorted.forEach((event) => {
      const start = dateValue(event.date);
      const end = dateValue(addDays(event.date, 1));
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeIcs(event.uid)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `DESCRIPTION:${escapeIcs(`음력 ${event.lunarYear}년 ${event.lunarMonth}월 ${event.lunarDay}일`)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    return foldIcsLines(lines).join("\r\n") + "\r\n";
  }

  function render(previewEvents = lastPreviewEvents, previewTitle = "") {
    const rows = items.map((item) => {
      const count = generateEvents(item).length;
      return `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td>${item.lunarMonth}월 ${item.lunarDay}일</td>
          <td>${item.startYear}년-${END_YEAR}년</td>
          <td>${count}개</td>
          <td><button class="delete-button" type="button" data-delete-id="${item.id}">삭제</button></td>
        </tr>
      `;
    });

    listBody.innerHTML = rows.length
      ? rows.join("")
      : '<tr class="empty-row"><td colspan="5">아직 추가된 기념일이 없습니다.</td></tr>';

    const allEventCount = items.reduce((total, item) => total + generateEvents(item).length, 0);
    countEl.textContent = String(allEventCount);
    downloadButton.disabled = allEventCount === 0;

    lastPreviewEvents = previewEvents || [];
    previewCaption.textContent = previewTitle
      ? `${previewTitle}의 첫 8개 날짜입니다.`
      : "기념일을 추가하면 첫 8개 날짜가 표시됩니다.";

    previewList.innerHTML = lastPreviewEvents
      .slice(0, 8)
      .map((event) => `<li>${event.lunarYear}년 음력 ${event.lunarMonth}월 ${event.lunarDay}일 → ${formatKoreanDate(event.date)}</li>`)
      .join("");
  }

  function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function loadItems() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => !validateItem(item)) : [];
    } catch {
      return [];
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeIcs(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function foldIcsLines(lines) {
    return lines.flatMap((line) => {
      const chunks = [];
      let chunk = "";
      let chunkBytes = 0;

      for (const character of line) {
        const characterBytes = UTF8_ENCODER.encode(character).length;
        const byteLimit = chunks.length ? 74 : 75;

        if (chunk && chunkBytes + characterBytes > byteLimit) {
          chunks.push(chunks.length ? ` ${chunk}` : chunk);
          chunk = character;
          chunkBytes = characterBytes;
        } else {
          chunk += character;
          chunkBytes += characterBytes;
        }
      }

      chunks.push(chunks.length ? ` ${chunk}` : chunk);
      return chunks;
    });
  }

  function dateValue(date) {
    return `${date.year}${pad(date.month)}${pad(date.day)}`;
  }

  function formatKoreanDate(date) {
    return `${date.year}년 ${date.month}월 ${date.day}일`;
  }

  function addDays(date, amount) {
    const next = new Date(Date.UTC(date.year, date.month - 1, date.day + amount));
    return toDateOnly(next);
  }

  function formatUtcTimestamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function slug(value) {
    return encodeURIComponent(value.trim().toLowerCase())
      .replace(/%/g, "")
      .slice(0, 48) || "anniversary";
  }

  function uidToken(item) {
    return item.id ? slug(String(item.id)) : slug(item.title);
  }
})();
