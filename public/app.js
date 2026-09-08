import { evaluateProgram } from "./rules.js";

const byId = (id) => document.getElementById(id);
const formIds = ["current-grade", "track-filter", "keyword", "university-filter", "qualification", "score-k", "score-m", "score-e", "score-h", "score-t1", "score-t2", "type-t1", "type-t2"];
const storageKey = "jobnkill-susi-intake-v1";
const compareKey = "jobnkill-susi-compare-v1";
let catalog = null;
let evaluations = [];
let compareIds = JSON.parse(localStorage.getItem(compareKey) || "[]");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function setScoreOptions() {
  document.querySelectorAll("select.score").forEach((select) => {
    select.innerHTML = '<option value="">미입력</option>' + Array.from({ length: 9 }, (_, index) => `<option value="${index + 1}">${index + 1}등급</option>`).join("");
  });
}

function restoreForm() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  for (const id of formIds) {
    if (saved[id] !== undefined && byId(id)) byId(id).value = saved[id];
  }
}

function saveForm() {
  const state = {};
  for (const id of formIds) if (byId(id)) state[id] = byId(id).value;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function getInput() {
  return {
    k: byId("score-k").value,
    m: byId("score-m").value,
    e: byId("score-e").value,
    h: byId("score-h").value,
    t1: byId("score-t1").value,
    t2: byId("score-t2").value,
    t1Type: byId("type-t1").value,
    t2Type: byId("type-t2").value
  };
}

function typeLabel(value) {
  return ({ social: "사회", science: "과학", vocational: "직업" })[value] || "";
}

function scoreText(value) {
  return value ? `${value}등급` : "미입력";
}

function verdictRank(status) {
  return ({ "no-min": 0, pass: 1, missing: 2, fail: 3, reference: 4 })[status] ?? 9;
}

function currentPrograms() {
  const track = byId("track-filter").value;
  const university = byId("university-filter").value;
  const keyword = byId("keyword").value.trim().toLowerCase();
  return catalog.programs.filter((item) => {
    const trackOk = track === "전체" || item.track === track;
    const universityOk = university === "전체" || item.university === university;
    const haystack = `${item.university} ${item.campus} ${item.track} ${item.variant} ${item.groupName}`.toLowerCase();
    return trackOk && universityOk && (!keyword || haystack.includes(keyword));
  });
}

function sourceFor(item) {
  return catalog.sources.find((source) => source.key === item.sourceKey);
}

function renderResults() {
  const input = getInput();
  evaluations = currentPrograms().map((program) => ({ program, evaluation: evaluateProgram(program, input) }))
    .sort((a, b) => verdictRank(a.evaluation.status) - verdictRank(b.evaluation.status) || a.program.sortOrder - b.program.sortOrder);

  const counts = evaluations.reduce((acc, item) => {
    acc[item.evaluation.status] = (acc[item.evaluation.status] || 0) + 1;
    return acc;
  }, {});
  const readyText = byId("track-filter").value === "논술"
    ? `입력 기준 충족 ${counts.pass || 0}개 · 수능최저 없음 ${counts["no-min"] || 0}개 · 추가 입력 ${counts.missing || 0}개`
    : `검색 결과 ${evaluations.length}개 · 자동판정 ${evaluations.filter((item) => item.program.calculationReady).length}개`;
  byId("result-summary").textContent = readyText;

  if (!evaluations.length) {
    byId("results").innerHTML = '<div class="empty-state"><div><b>조건에 맞는 자료가 없습니다</b><span>검색어나 대학 선택을 바꿔보세요.</span></div></div>';
    return;
  }

  byId("results").innerHTML = evaluations.map(({ program, evaluation }) => {
    const source = sourceFor(program);
    const isAdded = compareIds.includes(program.id);
    const seat = program.seats ? `${program.seats.toLocaleString("ko-KR")}명` : "세부 모집단위 확인";
    return `<article class="result-card" data-program-id="${escapeHtml(program.id)}">
      <div class="result-card-top">
        <div class="result-card-title">
          <div class="university-line"><h3>${escapeHtml(program.university)}</h3><span class="campus-tag">${escapeHtml(program.campus)}</span><span class="track-tag">${escapeHtml(program.track)}</span></div>
          <p>${escapeHtml(program.variant)} · ${escapeHtml(program.groupName)}</p>
        </div>
        <span class="verdict ${evaluation.status}">${escapeHtml(evaluation.label)}</span>
      </div>
      <div class="result-core">
        <div class="fact-block"><span>선발 방식 · 인원</span><b>${escapeHtml(program.selectionMethod)} · ${seat}</b></div>
        <div class="fact-block"><span>수능최저</span><b>${escapeHtml(program.csatRule)}</b></div>
      </div>
      <p class="calculation">${escapeHtml(evaluation.calculation)}</p>
      <div class="result-actions">
        <a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener">공식 모집요강 ${escapeHtml(program.sourcePages || "")}</a>
        <button class="compare-button ${isAdded ? "is-added" : ""}" data-compare-id="${escapeHtml(program.id)}" type="button">${isAdded ? "비교에서 빼기" : "비교 담기"}</button>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-compare-id]").forEach((button) => {
    button.addEventListener("click", () => toggleCompare(button.dataset.compareId));
  });
}

function toggleCompare(id) {
  if (compareIds.includes(id)) compareIds = compareIds.filter((item) => item !== id);
  else if (compareIds.length < 3) compareIds = [...compareIds, id];
  else {
    alert("비교는 최대 3개까지 담을 수 있습니다.");
    return;
  }
  localStorage.setItem(compareKey, JSON.stringify(compareIds));
  updateCompareCount();
  renderResults();
  renderComparison();
}

function updateCompareCount() {
  byId("compare-count").textContent = String(compareIds.length);
}

function renderComparison() {
  const selected = compareIds.map((id) => catalog.programs.find((item) => item.id === id)).filter(Boolean);
  if (!selected.length) {
    byId("comparison").innerHTML = '<div class="empty-state"><div><b>비교할 전형을 담아주세요</b><span>조건 판정 화면에서 최대 3개를 선택할 수 있습니다.</span></div></div>';
    return;
  }
  byId("comparison").innerHTML = selected.map((program) => {
    const evaluation = evaluateProgram(program, getInput());
    return `<article class="compare-card">
      <header><b>${escapeHtml(program.university)}</b><span>${escapeHtml(program.variant)} · ${escapeHtml(program.groupName)}</span></header>
      <dl>
        <div><dt>현재 판정</dt><dd>${escapeHtml(evaluation.label)}<br>${escapeHtml(evaluation.calculation)}</dd></div>
        <div><dt>모집인원</dt><dd>${program.seats ? `${program.seats.toLocaleString("ko-KR")}명` : "세부 모집단위 확인"}<br>${escapeHtml(program.seatsNote || "")}</dd></div>
        <div><dt>전형방법</dt><dd>${escapeHtml(program.selectionMethod)}</dd></div>
        <div><dt>지원자격</dt><dd>${escapeHtml(program.eligibility)}</dd></div>
        <div><dt>수능최저</dt><dd>${escapeHtml(program.csatRule)}</dd></div>
        <div><dt>고사일·시간</dt><dd>${escapeHtml(program.examDate || "모집단위별 확인")}${program.examMinutes ? ` · ${program.examMinutes}분` : ""}</dd></div>
        <div><dt>확인사항</dt><dd>${escapeHtml(program.notes || "최종 모집요강 확인")}</dd></div>
      </dl>
      <button class="remove-button" data-remove-id="${escapeHtml(program.id)}">비교에서 빼기</button>
    </article>`;
  }).join("");
  document.querySelectorAll("[data-remove-id]").forEach((button) => button.addEventListener("click", () => toggleCompare(button.dataset.removeId)));
}

function renderSources() {
  byId("source-list").innerHTML = catalog.sources.map((source) => {
    const programs = catalog.programs.filter((program) => program.sourceKey === source.key);
    const ready = programs.filter((program) => program.calculationReady).length;
    return `<article class="source-item">
      <div><h3>${escapeHtml(source.university)} ${escapeHtml(source.campus)}</h3><p>${escapeHtml(source.title)}<br>${escapeHtml(source.pages)} · 검수 ${escapeHtml(String(source.verifiedAt).slice(0, 10))} · 전형 묶음 ${programs.length}개 · 자동판정 ${ready}개</p></div>
      <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">원문 열기</a>
    </article>`;
  }).join("");
}

function switchView(view) {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".view-panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === `${view}-view`));
  if (view === "compare") renderComparison();
}

function reportRows() {
  return evaluations.slice(0, 8).map(({ program, evaluation }) => `<tr><td>${escapeHtml(program.university)}<br>${escapeHtml(program.variant)}</td><td>${escapeHtml(program.groupName)}</td><td>${escapeHtml(evaluation.label)}<br>${escapeHtml(evaluation.calculation)}</td><td>${escapeHtml(program.sourcePages || "")}</td></tr>`).join("");
}

function openReport() {
  const input = getInput();
  const passCount = evaluations.filter((item) => ["pass", "no-min"].includes(item.evaluation.status)).length;
  byId("report-content").innerHTML = `
    <p class="eyebrow">JOB&KILL 수시설계 · 2027학년도</p>
    <h2>수시 조건 점검 기본 보고서</h2>
    <p>생성일 ${new Date().toLocaleDateString("ko-KR")} · 공식 문서 검수일 ${escapeHtml(catalog.metadata.verifiedAt)}</p>
    <h3>1. 입력 조건</h3>
    <p>${escapeHtml(byId("current-grade").value)} · ${escapeHtml(byId("qualification").selectedOptions[0].textContent)} · 국어 ${scoreText(input.k)}, 수학 ${scoreText(input.m)}, 영어 ${scoreText(input.e)}, 한국사 ${scoreText(input.h)}, 탐구1 ${typeLabel(input.t1Type)} ${scoreText(input.t1)}, 탐구2 ${typeLabel(input.t2Type)} ${scoreText(input.t2)}</p>
    <h3>2. 확인 결과</h3>
    <p>현재 검색된 ${evaluations.length}개 전형 묶음 중 입력 기준 충족 또는 수능최저 미적용 항목은 ${passCount}개입니다. 이 수치는 합격 가능성이 아니라 공식 조건과 입력값의 일치 여부입니다.</p>
    <table class="report-table"><thead><tr><th>대학·전형</th><th>모집단위 묶음</th><th>판정 근거</th><th>요강 위치</th></tr></thead><tbody>${reportRows()}</tbody></table>
    <h3>3. 다음 확인</h3>
    <ul><li>정확한 모집단위가 현재 전형 묶음에 포함되는지 확인합니다.</li><li>원서접수 전 대학 입학처의 수정 공지와 최종 모집요강을 다시 확인합니다.</li><li>논술·면접·학생부 정성평가는 자동판정 결과와 분리해 준비 수준을 점검합니다.</li></ul>
    <h3>4. 유의사항</h3>
    <p>${escapeHtml(catalog.metadata.notice)} 본 보고서는 지원 자격의 최종 확인서나 합격 예측 자료가 아닙니다.</p>`;
  byId("report-dialog").showModal();
}

async function init() {
  setScoreOptions();
  const response = await fetch("/api/catalog", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("catalog unavailable");
  catalog = await response.json();

  const universities = [...new Set(catalog.programs.map((item) => item.university))].sort((a, b) => a.localeCompare(b, "ko"));
  byId("university-filter").innerHTML = '<option value="전체">전체 대학</option>' + universities.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  restoreForm();
  compareIds = compareIds.filter((id) => catalog.programs.some((item) => item.id === id)).slice(0, 3);

  byId("source-count").textContent = catalog.sources.length;
  byId("program-count").textContent = catalog.programs.length;
  byId("rule-count").textContent = catalog.programs.filter((item) => item.calculationReady).length;
  byId("storage-badge").textContent = catalog.storage === "postgresql" ? "Postgre" : "검수 파일";
  byId("verified-date").textContent = `공식 문서 최종 검수 ${catalog.metadata.verifiedAt}`;
  updateCompareCount();
  renderSources();
  renderResults();

  for (const id of formIds) {
    byId(id)?.addEventListener(id === "keyword" ? "input" : "change", () => { saveForm(); renderResults(); renderComparison(); });
  }
  document.querySelectorAll(".tab-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  byId("fill-example").addEventListener("click", () => {
    const example = { "score-k": "3", "score-m": "4", "score-e": "2", "score-h": "3", "score-t1": "2", "score-t2": "4", "type-t1": "social", "type-t2": "social" };
    Object.entries(example).forEach(([id, value]) => byId(id).value = value);
    saveForm(); renderResults(); renderComparison();
  });
  byId("reset-form").addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    byId("current-grade").value = "고3";
    byId("track-filter").value = "논술";
    byId("keyword").value = "";
    byId("university-filter").value = "전체";
    byId("qualification").value = "domestic";
    ["score-k", "score-m", "score-e", "score-h", "score-t1", "score-t2"].forEach((id) => byId(id).value = "");
    byId("type-t1").value = "social";
    byId("type-t2").value = "social";
    renderResults(); renderComparison();
  });
  byId("clear-compare").addEventListener("click", () => {
    compareIds = [];
    localStorage.setItem(compareKey, "[]");
    updateCompareCount(); renderResults(); renderComparison();
  });
  byId("open-report").addEventListener("click", openReport);
  byId("close-report").addEventListener("click", () => byId("report-dialog").close());
  byId("print-report").addEventListener("click", () => window.print());
  byId("report-dialog").addEventListener("click", (event) => {
    if (event.target === byId("report-dialog")) byId("report-dialog").close();
  });
}

init().catch(() => {
  byId("result-summary").textContent = "공식 자료를 불러오지 못했습니다.";
  byId("results").innerHTML = '<div class="empty-state"><div><b>자료 연결을 확인하고 있습니다</b><span>잠시 후 다시 열어주세요.</span></div></div>';
});
