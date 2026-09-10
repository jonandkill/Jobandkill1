import {
  POST_STATUSES,
  SAFETY_BOUNDARY,
  articleToMarkdown,
  auditArticle,
  buildArticle,
  createCopyBlocks,
  createImagePlan,
  createPublishPackage,
  createQueueRecord,
  createTableOfContents,
  generateTitleCandidates,
  inferBlogCategory,
} from "./core.mjs";

const FORM_STORAGE_KEY = "jobandkill.naver-blog-studio.v2";
const LEGACY_FORM_STORAGE_KEY = "jobandkill.naver-blog-studio.v1";
const QUEUE_STORAGE_KEY = "jobandkill.naver-blog-studio.queue.v1";
const MAX_QUEUE_ITEMS = 30;

const form = document.querySelector("#draft-form");
const preview = document.querySelector("#article-preview");
const auditList = document.querySelector("#audit-list");
const scoreValue = document.querySelector("#score-value");
const scoreRing = document.querySelector("#score-ring");
const status = document.querySelector("#status");
const saveState = document.querySelector("#save-state");
const emptyState = document.querySelector("#empty-state");
const resultState = document.querySelector("#result-state");
const blockQueue = document.querySelector("#block-queue");
const currentBlockName = document.querySelector("#current-block-name");
const titleCandidates = document.querySelector("#title-candidates");
const imagePlanList = document.querySelector("#image-plan");
const reviewOutput = document.querySelector("#review-output");
const speedInput = document.querySelector("#review-speed");
const speedLabel = document.querySelector("#speed-label");
const reviewToggle = document.querySelector("#review-toggle");
const importInput = document.querySelector("#import-file");
const toast = document.querySelector("#toast");
const openNaverButton = document.querySelector("#open-naver");
const finalChecks = [...document.querySelectorAll("[data-final-check]")];
const queueSchedule = document.querySelector("#queue-schedule");
const queueCount = document.querySelector("#queue-count");
const queueEmpty = document.querySelector("#queue-empty");
const postQueue = document.querySelector("#post-queue");
const primaryKeywordInput = form.elements.namedItem("primaryKeyword");
const topicInput = form.elements.namedItem("topic");
const draftInput = form.elements.namedItem("draft");
const compositionModeInputs = [...form.querySelectorAll('[name="compositionMode"]')];
const composeLabel = document.querySelector("#compose-label");
const composeHint = document.querySelector("#compose-hint");
const draftHelp = document.querySelector("#draft-help");
const formError = document.querySelector("#form-error");
const composeButton = document.querySelector("#compose-button");
const generationStatus = document.querySelector("#generation-status");
const serverStatus = document.querySelector("#server-status");
const accessToken = document.querySelector("#access-token");
const generatedImagePanel = document.querySelector("#generated-image-panel");
let requestController = null;
let inputRevision = 0;
let generatedImage = null;
let generationMetadata = null;

let article = null;
let audit = null;
let copyBlocks = [];
let imagePlans = [];
let titleCandidateValues = [];
let queuedPosts = [];
let currentSectionIndex = 0;
let reviewTimer = null;
let reviewPosition = 0;
let reviewPaused = true;
let saveTimer = null;
let toastTimer = null;
let activeInput = null;

function announce(message, tone = "info") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function compositionMode() {
  return form.elements.namedItem("compositionMode")?.value === "restructure" ? "restructure" : "generate";
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = "";
  form.querySelectorAll('[aria-invalid="true"]').forEach((control) => control.removeAttribute("aria-invalid"));
}

function showFormError(message, control) {
  clearFormError();
  formError.textContent = message;
  formError.hidden = false;
  control?.setAttribute("aria-invalid", "true");
  control?.focus();
  formError.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
  announce(message, "error");
}

function updateCompositionModeUi() {
  const mode = compositionMode();
  const generating = mode === "generate";
  composeLabel.textContent = generating ? "키워드로 본문 생성" : "기존 원고 재구성";
  composeHint.textContent = generating ? "대표 키워드 하나만 필수" : "대표 키워드와 기존 원고 필요";
  draftHelp.textContent = generating
    ? "비워도 됩니다. 메모·초안·검증 자료를 넣으면 생성 본문에 우선 반영합니다."
    : "입력한 원고를 보존하면서 제목·목차·문단·이미지 계획으로 재구성합니다.";
  draftInput.setAttribute("aria-required", String(!generating));
  form.dataset.mode = mode;
  clearFormError();
}

async function checkServer() {
  try {
    const response = await fetch("/api/config", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("unavailable");
    const config = await response.json();
    serverStatus.textContent = config.configured ? "AI 작성 서버 연결됨 · 생성 결과는 검수 후 사용하세요." : "AI 작성 서버 연결이 필요합니다. 관리자 설정 후 키워드 작성이 가능합니다.";
    serverStatus.dataset.state = config.configured ? "ready" : "error";
    document.querySelector("#access-token-field").hidden = !config.authorizationRequired;
  } catch {
    serverStatus.textContent = "AI 작성 서버 연결이 필요합니다. 현재 서버 상태를 확인할 수 없습니다. 기존 원고 재구성은 이용할 수 있습니다.";
    serverStatus.dataset.state = "error";
  }
}

function cardImage(card) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서 정보 카드를 그릴 수 없습니다.");
  const wrap = (text, font) => {
    ctx.font = font;
    const lines = [];
    for (const paragraph of String(text || "").split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (ctx.measureText(line + char).width > 900) { lines.push(line); line = char; }
        else line += char;
      }
      lines.push(line);
    }
    return lines;
  };
  const title = wrap(String(card.title || "").slice(0, 120), 'bold 48px sans-serif');
  const original = String(card.body || "");
  const excerpt = original.length > 600;
  const body = wrap(excerpt ? original.slice(0, 600) + "…" : original, '32px sans-serif');
  canvas.height = Math.max(1080, 330 + title.length * 66 + body.length * 52);
  ctx.fillStyle = ["#edf4fa", "#f4f1e9", "#edf5ef"][Number(card.order || 0) % 3];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#315c77"; ctx.font = 'bold 24px sans-serif';
  ctx.fillText(`본문 정보 카드 · ${card.order || ""}`, 90, 96);
  let y = 180;
  ctx.fillStyle = "#172e42"; ctx.font = 'bold 48px sans-serif';
  for (const line of title) { ctx.fillText(line, 90, y); y += 66; }
  y += 40; ctx.font = '32px sans-serif';
  for (const line of body) { ctx.fillText(line, 90, y); y += 52; }
  ctx.font = '24px sans-serif'; ctx.fillStyle = "#435b6c";
  ctx.fillText(excerpt ? "AI 초안 일부 발췌 · 게시 전 사실 확인 필요" : "AI 초안 기반 · 게시 전 사실 확인 필요", 90, canvas.height - 65);
  return { kind: "card", dataUrl: canvas.toDataURL("image/png"), altText: `${card.title}: ${original}` };
}

function renderGeneratedImage(value, error = "") {
  generatedImagePanel.replaceChildren();
  const images = (Array.isArray(value) ? value : value ? [value] : []).slice(0, 8);
  generatedImagePanel.hidden = !images.length && !error;
  if (generatedImagePanel.hidden) return;
  const heading = document.createElement("h3");
  heading.textContent = `다운로드 가능한 이미지 ${images.length}개 / 기본 구성 8개`;
  generatedImagePanel.append(heading);
  const grid = document.createElement("div"); grid.className = "generated-gallery";
  images.forEach((image, index) => {
    if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image?.dataUrl || "")) {
      error += " 이미지 파일 형식이 올바르지 않습니다."; return;
    }
    const figure = document.createElement("figure");
    const img = document.createElement("img"); img.src = image.dataUrl;
    img.alt = image.altText || "생성 이미지"; img.loading = "lazy";
    const link = document.createElement("a"); link.href = image.dataUrl;
    link.download = `${safeFilename()}-${index + 1}.${image.dataUrl.startsWith("data:image/jpeg") ? "jpg" : image.dataUrl.startsWith("data:image/webp") ? "webp" : "png"}`;
    link.textContent = `${index + 1}. ${image.kind === "card" ? "정보 카드" : "AI 그림"} 내려받기`;
    link.className = "button ghost"; figure.append(img, link); grid.append(figure);
  });
  generatedImagePanel.append(grid);
  if (error) {
    const note = document.createElement("p"); note.textContent = error;
    note.setAttribute("role", "status"); generatedImagePanel.append(note);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function serializeForm() {
  const values = Object.fromEntries(new FormData(form).entries());
  delete values.accessToken;
  values.generateImages = String(form.elements.namedItem("generateImages").checked);
  return values;
}

function hydrateForm(values = {}) {
  for (const [key, value] of Object.entries(values)) {
    const control = form.elements.namedItem(key);
    if (!control || typeof value !== "string") continue;
    if (key === "accessToken") continue;
    if (control.type === "checkbox") control.checked = value === "true";
    else control.value = value;
  }
}

function persistDraft() {
  try {
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ version: 2, form: serializeForm() }));
    saveState.textContent = "이 기기에 저장됨";
    saveState.dataset.state = "saved";
  } catch {
    saveState.textContent = "저장하지 못함";
    saveState.dataset.state = "error";
  }
}

function scheduleSave() {
  saveState.textContent = "저장 중…";
  saveState.dataset.state = "saving";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persistDraft, 450);
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY) || localStorage.getItem(LEGACY_FORM_STORAGE_KEY);
    const saved = JSON.parse(raw || "null");
    if (!saved?.form) return;
    hydrateForm(saved.form);
    saveState.textContent = "저장된 초안 복원됨";
    saveState.dataset.state = "saved";
  } catch {
    saveState.textContent = "새 초안";
  }
}

function restoreQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || "[]");
    queuedPosts = Array.isArray(saved) ? saved.slice(0, MAX_QUEUE_ITEMS) : [];
  } catch {
    queuedPosts = [];
  }
  renderQueue();
}

function persistQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queuedPosts.slice(0, MAX_QUEUE_ITEMS)));
    return true;
  } catch {
    announce("게시 대기열을 이 기기에 저장하지 못했습니다.", "error");
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderParagraphs(text = "") {
  return text
    .split(/\n\s*\n/u)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function renderArticle() {
  if (!article) return;
  const toc = createTableOfContents(article);
  preview.innerHTML = `
    <header class="preview-header">
      ${article.category ? `<span class="eyebrow">${escapeHtml(article.category)}</span>` : ""}
      <h1>${escapeHtml(article.title)}</h1>
      <p class="meta-description">${escapeHtml(article.metaDescription || "도입부를 입력하면 설명문이 표시됩니다.")}</p>
      <div class="preview-meta">
        ${article.author ? `<span>${escapeHtml(article.author)}</span>` : ""}
        ${article.audience ? `<span>독자 · ${escapeHtml(article.audience)}</span>` : ""}
      </div>
    </header>
    <div class="preview-body">
      ${renderParagraphs(article.intro)}
      ${toc.length ? `<nav class="toc-box" aria-label="목차"><h2>이 글에서 확인할 내용</h2><ol>${toc.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ol></nav>` : ""}
      ${article.sections.map((section, index) => `
        <section id="preview-section-${index}" class="preview-section${index === currentSectionIndex ? " is-current" : ""}" tabindex="-1">
          <div class="section-heading-row">
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h2>${escapeHtml(section.heading)}</h2>
          </div>
          ${renderParagraphs(section.paragraphs.join("\n\n"))}
        </section>
      `).join("")}
      ${article.cta ? `<aside class="cta-box"><strong>다음 행동</strong>${renderParagraphs(article.cta)}</aside>` : ""}
      ${article.sources.length ? `
        <section class="sources-box">
          <h2>참고자료</h2>
          <ol>${article.sources.map((source) => `<li>${source.url ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>` : escapeHtml(source.label)}</li>`).join("")}</ol>
        </section>
      ` : ""}
      ${article.tagLine ? `<p class="tag-line">${escapeHtml(article.tagLine)}</p>` : ""}
    </div>
  `;
}

function renderAudit() {
  if (!audit) return;
  scoreValue.textContent = String(audit.score);
  scoreRing.style.setProperty("--score", `${audit.score * 3.6}deg`);
  auditList.innerHTML = audit.checks.map((check) => `
    <li class="audit-item" data-status="${check.status}">
      <span class="audit-icon" aria-hidden="true">${check.status === "pass" ? "✓" : "!"}</span>
      <span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span>
    </li>
  `).join("");
}

function renderTitleCandidates(input) {
  titleCandidateValues = generateTitleCandidates(input);
  titleCandidates.innerHTML = titleCandidateValues.map((candidate, index) => `
    <li>
      <button class="title-option" type="button" data-title-index="${index}" aria-pressed="${candidate === article.title}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span><strong>${escapeHtml(candidate)}</strong><small>${candidate === article.title ? "현재 적용됨" : "제목으로 적용"}</small></span>
      </button>
    </li>
  `).join("");
}

function renderCopyQueue() {
  if (!article) return;
  copyBlocks = createCopyBlocks(article);
  blockQueue.innerHTML = copyBlocks.map((block) => `
    <li>
      <button class="block-button" type="button" data-copy-id="${block.id}">
        <span><strong>${escapeHtml(block.label)}</strong><small>${block.type === "section" ? "Alt+3으로 현재 소제목 복사" : escapeHtml(block.shortcut || "선택하여 복사")}</small></span>
        <span aria-hidden="true">복사</span>
      </button>
    </li>
  `).join("");
  updateCurrentBlockLabel();
}

function renderImagePlan(requestedCount) {
  if (!article) return;
  imagePlans = createImagePlan(article, requestedCount);
  imagePlanList.innerHTML = imagePlans.map((plan, index) => `
    <li class="image-plan-item">
      <span class="image-plan-index">${String(plan.order).padStart(2, "0")}</span>
      <div>
        <strong>${escapeHtml(plan.placement)}</strong>
        <small>${escapeHtml(plan.purpose)}</small>
        <p>${escapeHtml(plan.brief)}</p>
        <p class="image-plan-alt"><strong>대체텍스트</strong> · ${escapeHtml(plan.altText)}</p>
      </div>
      <button class="image-copy-button" type="button" data-image-index="${index}">복사</button>
    </li>
  `).join("");
}

function updateCurrentBlockLabel() {
  const sections = copyBlocks.filter((block) => block.type === "section");
  const current = sections[currentSectionIndex];
  currentBlockName.textContent = current ? `${currentSectionIndex + 1}/${sections.length} · ${current.label}` : "소제목 없음";
}

function resetFinalChecks() {
  finalChecks.forEach((check) => {
    check.checked = false;
  });
  updateFinalGate();
}

function updateFinalGate() {
  const checkedCount = finalChecks.filter((check) => check.checked).length;
  const ready = Boolean(article) && checkedCount === finalChecks.length;
  openNaverButton.disabled = !ready;
  openNaverButton.textContent = ready ? "네이버 열기 · 직접 발행" : `${finalChecks.length - checkedCount}개 확인 후 네이버 열기`;
}

function refreshArticle(input, { resetChecks = true } = {}) {
  stopReview();
  activeInput = { ...input };
  article = buildArticle(input);
  audit = auditArticle(article, { targetLength: input.targetLength });
  currentSectionIndex = 0;
  renderArticle();
  renderAudit();
  renderTitleCandidates(input);
  renderCopyQueue();
  renderImagePlan(input.imageCount);
  if (resetChecks) resetFinalChecks();
}

async function compose() {
  if (requestController) return;
  clearFormError();
  const rawInput = serializeForm();
  const mode = compositionMode();
  if (!rawInput.primaryKeyword?.trim()) {
    showFormError("대표 키워드를 입력하면 바로 본문을 만들 수 있습니다.", primaryKeywordInput);
    return;
  }
  if (mode === "restructure" && !rawInput.draft?.trim()) {
    showFormError("기존 원고 재구성 방식에서는 원고를 입력해 주세요.", draftInput);
    return;
  }

  let input = {
        ...rawInput,
        compositionMode: "restructure",
        topic: rawInput.topic?.trim() || rawInput.primaryKeyword.trim(),
        category: rawInput.category || inferBlogCategory(rawInput),
      };
  let payload = null;
  if (mode === "generate") {
    const revision = inputRevision;
    requestController = new AbortController();
    const timeout = window.setTimeout(() => requestController?.abort(), 180000);
    composeButton.disabled = true;
    form.setAttribute("aria-busy", "true");
    generationStatus.hidden = false;
    generationStatus.textContent = rawInput.generateImages === "true" ? "키워드에 맞는 본문과 AI 그림 2장, 정보 카드 6장을 생성 중입니다. 최대 3분 정도 걸릴 수 있습니다." : "키워드에 맞는 본문을 생성 중입니다.";
    try {
      const headers = { "Content-Type": "application/json" };
      if (accessToken.value.trim()) headers.Authorization = `Bearer ${accessToken.value.trim()}`;
      const response = await fetch("/api/generate", {
        method: "POST", headers,
        body: JSON.stringify({ ...rawInput, generateImages: rawInput.generateImages === "true" }),
        signal: requestController.signal,
      });
      if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("AI 작성 서버 연결이 필요합니다. 정적 사이트만으로는 키워드에 맞는 새 글을 작성할 수 없습니다.");
      payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message || "본문 생성에 실패했습니다. 입력은 보존되었습니다.");
      if (revision !== inputRevision) throw new Error("생성 중 입력이 바뀌어 이전 요청 결과를 적용하지 않았습니다. 현재 입력으로 다시 생성해 주세요.");
      input = { ...rawInput, ...payload.articleInput, compositionMode: "generate" };
      if (!payload.articleInput?.draft?.trim()) throw new Error("서버가 유효한 본문을 반환하지 않았습니다. 입력은 보존되었습니다.");
    } catch (error) {
      showFormError(error.name === "AbortError" ? "요청이 취소되었거나 제한 시간을 초과했습니다. 입력은 보존되었습니다. 과금 여부를 확인한 뒤 다시 시도해 주세요." : error.message || "작성 서버에 연결하지 못했습니다. 입력은 보존되었습니다.");
      return;
    } finally {
      window.clearTimeout(timeout);
      requestController = null;
      composeButton.disabled = false;
      form.removeAttribute("aria-busy");
      generationStatus.hidden = true;
    }
  }

  if (!input.draft?.trim()) {
    showFormError("본문을 만들지 못했습니다. 대표 키워드를 다시 확인해 주세요.", primaryKeywordInput);
    return;
  }

  persistDraft();
  refreshArticle(input);
  generatedImage = payload ? [...(payload.images || (payload.image ? [payload.image] : []))] : null;
  let cardError = "";
  if (Array.isArray(payload?.cards)) {
    try { generatedImage.push(...payload.cards.slice(0, 6).map(cardImage)); }
    catch { cardError = "정보 카드 변환에 실패했습니다. 본문과 AI 그림은 보존했습니다."; }
  }
  generationMetadata = payload ? { warnings: payload.warnings, usage: payload.usage, imageError: payload.imageError } : null;
  renderGeneratedImage(generatedImage, cardError || payload?.imageError || (mode === "generate" && rawInput.generateImages === "true" && !generatedImage ? "본문은 생성되었으나 이미지가 반환되지 않았습니다. 아래 배치안은 실제 이미지가 아닙니다." : ""));
  const generationNotice = document.querySelector("#generation-notice");
  generationNotice.hidden = mode !== "generate";
  const reserve = Number(payload?.usage?.reservedKrw);
  const cumulativeReserve = Number(payload?.usage?.budget?.reservedKrw);
  generationNotice.textContent = mode === "generate" ? [
    "AI 초안입니다. 실시간 검색·독립적인 사실 검증을 수행한 결과가 아닙니다.",
    ...(Array.isArray(payload?.warnings) ? payload.warnings.filter((item) => typeof item === "string") : []),
    ...(Number.isFinite(reserve) ? [`이번 요청 예산 예약액 ${reserve.toLocaleString("ko-KR")}원 (실제 청구액과 다를 수 있음).`] : []),
    ...(Number.isFinite(cumulativeReserve) ? [`누적 예산 예약액 ${cumulativeReserve.toLocaleString("ko-KR")}원.`] : []),
  ].join(" ") : "";
  emptyState.hidden = true;
  resultState.hidden = false;
  const message = mode === "generate"
    ? `대표 키워드로 본문 ${audit.metrics.textLength.toLocaleString("ko-KR")}자를 생성했습니다. 내용을 확인해 주세요.`
    : `기존 원고를 게시 준비 묶음으로 재구성했습니다. 형식 점검 점수는 ${audit.score}점입니다.`;
  announce(message, "success");
  showToast(mode === "generate" ? "본문 생성 완료" : "원고 재구성 완료");
  resultState.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
}

async function copyText(text, label) {
  if (!text) {
    announce(`${label}에 복사할 내용이 없습니다.`, "error");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    announce(`${label}을 클립보드에 복사했습니다.`, "success");
    showToast(`${label} 복사 완료`);
    return true;
  } catch {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.append(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    announce(copied ? `${label}을 복사했습니다.` : `${label}을 복사하지 못했습니다.`, copied ? "success" : "error");
    if (copied) showToast(`${label} 복사 완료`);
    return copied;
  }
}

async function copyRichPackage() {
  if (!article) return announce("먼저 초안을 구성해 주세요.", "error");
  const publishPackage = createPublishPackage(article, serializeForm());
  try {
    if (typeof ClipboardItem !== "function" || !navigator.clipboard?.write) throw new Error("rich clipboard unavailable");
    const item = new ClipboardItem({
      "text/plain": new Blob([publishPackage.plainText], { type: "text/plain" }),
      "text/html": new Blob([publishPackage.richHtml], { type: "text/html" }),
    });
    await navigator.clipboard.write([item]);
    announce("제목·목차·본문 서식을 한 번에 복사했습니다.", "success");
    showToast("서식 포함 복사 완료");
  } catch {
    await copyText(publishPackage.plainText, "게시용 전체 글");
  }
}

function findBlock(id) {
  if (id === "section-current") return copyBlocks.filter((block) => block.type === "section")[currentSectionIndex];
  return copyBlocks.find((block) => block.id === id);
}

function copyBlock(id) {
  const block = findBlock(id);
  if (!block) return announce("선택한 구역이 없습니다.", "error");
  return copyText(block.text, block.label);
}

function selectSection(direction) {
  const sections = copyBlocks.filter((block) => block.type === "section");
  if (!sections.length) return;
  currentSectionIndex = (currentSectionIndex + direction + sections.length) % sections.length;
  renderArticle();
  updateCurrentBlockLabel();
  document.querySelector(`#preview-section-${currentSectionIndex}`)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "center",
  });
}

function download(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilename() {
  return (article?.title || "naver-blog-draft")
    .replace(/[\\/:*?"<>|]/gu, "")
    .replace(/\s+/gu, "-")
    .slice(0, 64);
}

function exportBundle() {
  if (!article) return announce("먼저 초안을 구성해 주세요.", "error");
  const input = serializeForm();
  const bundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    form: input,
    articleInput: activeInput,
    generationMetadata,
    generatedImages: generatedImage,
    article,
    publishPackage: createPublishPackage(article, input),
  };
  download(`${safeFilename()}.json`, JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  announce("게시 준비 묶음을 JSON으로 저장했습니다.", "success");
}

function exportMarkdown() {
  if (!article) return announce("먼저 초안을 구성해 주세요.", "error");
  download(`${safeFilename()}.md`, articleToMarkdown(article), "text/markdown;charset=utf-8");
  announce("블로그 글을 Markdown 문서로 저장했습니다.", "success");
}

async function importBundle(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed?.form || typeof parsed.form !== "object") throw new Error("invalid bundle");
    hydrateForm(parsed.form);
    persistDraft();
    inputRevision += 1;
    requestController?.abort();
    updateCompositionModeUi();
    const storedInput = parsed.articleInput?.draft ? parsed.articleInput : parsed.article ? {
      ...parsed.form,
      title: parsed.article.title,
      draft: [parsed.article.intro, ...(parsed.article.sections || []).map((section) => `## ${section.heading}\n\n${section.paragraphs.join("\n\n")}`)].filter(Boolean).join("\n\n"),
    } : null;
    if (storedInput) {
      refreshArticle(storedInput);
      resultState.hidden = false;
      emptyState.hidden = true;
    }
    generatedImage = Array.isArray(parsed.generatedImages) ? parsed.generatedImages.slice(0, 8) : null;
    renderGeneratedImage(generatedImage);
    generationMetadata = parsed.generationMetadata || null;
    const notice = document.querySelector("#generation-notice");
    notice.hidden = !generationMetadata;
    notice.textContent = generationMetadata ? ["저장된 AI 초안입니다. 사실·출처는 독립 검증되지 않았습니다.", ...(Array.isArray(generationMetadata.warnings) ? generationMetadata.warnings.filter((item) => typeof item === "string") : [])].join(" ") : "";
    announce("저장된 자료를 불러왔습니다. AI를 호출하거나 비용을 발생시키지 않았습니다.", "success");
  } catch {
    announce("이 도구에서 저장한 올바른 JSON 파일인지 확인해 주세요.", "error");
  } finally {
    importInput.value = "";
  }
}

function formatImagePlan(plan) {
  return [
    `[이미지 ${plan.order}] ${plan.placement}`,
    `용도: ${plan.purpose}`,
    `제작 지시: ${plan.brief}`,
    `대체텍스트: ${plan.altText}`,
  ].join("\n");
}

function updateSpeed() {
  speedLabel.textContent = `${speedInput.value}ms/글자`;
}

function stopReview() {
  window.clearTimeout(reviewTimer);
  reviewTimer = null;
  reviewPaused = true;
  reviewPosition = 0;
  reviewOutput.textContent = article ? "검수 재생을 누르면 글이 이곳에 순서대로 표시됩니다." : "초안을 구성하면 검수 재생을 사용할 수 있습니다.";
  reviewToggle.textContent = "검수 재생";
}

function scheduleReviewStep() {
  if (reviewPaused || !article) return;
  if (reviewPosition >= article.fullText.length) {
    reviewPaused = true;
    reviewToggle.textContent = "다시 재생";
    announce("검수 재생이 끝났습니다.", "success");
    return;
  }
  reviewPosition += 1;
  reviewOutput.textContent = article.fullText.slice(0, reviewPosition);
  reviewOutput.scrollTop = reviewOutput.scrollHeight;
  reviewTimer = window.setTimeout(scheduleReviewStep, Number(speedInput.value));
}

function toggleReview() {
  if (!article) return announce("먼저 초안을 구성해 주세요.", "error");
  if (!reviewPaused) {
    reviewPaused = true;
    window.clearTimeout(reviewTimer);
    reviewToggle.textContent = "계속 재생";
    announce("검수 재생을 잠시 멈췄습니다.");
    return;
  }
  if (reviewPosition >= article.fullText.length) reviewPosition = 0;
  if (reviewPosition === 0) reviewOutput.textContent = "";
  reviewPaused = false;
  reviewToggle.textContent = "일시정지";
  announce("앱 안에서 검수 재생 중입니다.");
  scheduleReviewStep();
}

function queueDateLabel(value) {
  if (!value) return "발행 시각 미정";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "발행 시각 미정";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isDue(record) {
  if (!record.scheduledAt || record.status === "published") return false;
  const timestamp = new Date(record.scheduledAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function renderQueue() {
  queueCount.textContent = `${queuedPosts.length}건`;
  queueEmpty.hidden = queuedPosts.length > 0;
  postQueue.innerHTML = queuedPosts.map((record) => {
    const statusKey = POST_STATUSES[record.status] ? record.status : "review";
    const approveLabel = statusKey === "approved" ? "승인 취소" : "승인";
    return `
      <li class="queue-item" data-due="${isDue(record)}">
        <div class="queue-item-main">
          <strong>${escapeHtml(record.title || "제목 없는 글")}</strong>
          <div class="queue-meta">
            <span class="status-chip" data-status="${statusKey}">${escapeHtml(POST_STATUSES[statusKey])}</span>
            <span>${escapeHtml(queueDateLabel(record.scheduledAt))}</span>
            ${isDue(record) ? "<span>예정 시각 도달</span>" : ""}
          </div>
        </div>
        <div class="queue-actions">
          <button class="queue-action" type="button" data-queue-action="copy" data-queue-id="${escapeHtml(record.id)}">글 복사</button>
          ${statusKey !== "published" ? `<button class="queue-action" type="button" data-queue-action="approve" data-queue-id="${escapeHtml(record.id)}">${approveLabel}</button>` : ""}
          ${statusKey === "approved" ? `<button class="queue-action" type="button" data-queue-action="publish" data-queue-id="${escapeHtml(record.id)}">게시 완료 표시</button>` : ""}
          <button class="queue-action danger" type="button" data-queue-action="delete" data-queue-id="${escapeHtml(record.id)}">삭제</button>
        </div>
      </li>
    `;
  }).join("");
}

function addToQueue() {
  if (!article) return announce("먼저 초안을 구성해 주세요.", "error");
  const input = serializeForm();
  const record = createQueueRecord(article, {
    ...input,
    scheduledAt: queueSchedule.value,
    status: "review",
  });
  queuedPosts = [record, ...queuedPosts].slice(0, MAX_QUEUE_ITEMS);
  if (!persistQueue()) return;
  renderQueue();
  announce("게시 대기열에 검수 대기 상태로 저장했습니다.", "success");
  showToast("게시 대기열 저장 완료");
}

function updateQueueRecord(id, action) {
  const index = queuedPosts.findIndex((record) => record.id === id);
  if (index < 0) return;
  const current = queuedPosts[index];

  if (action === "copy") {
    return copyText(current.package?.plainText || "", "대기열 글");
  }
  if (action === "delete") {
    if (!window.confirm(`‘${current.title}’ 항목을 이 기기의 대기열에서 삭제할까요?`)) return;
    queuedPosts.splice(index, 1);
  } else if (action === "approve") {
    current.status = current.status === "approved" ? "review" : "approved";
    current.updatedAt = new Date().toISOString();
  } else if (action === "publish" && current.status === "approved") {
    current.status = "published";
    current.updatedAt = new Date().toISOString();
  } else {
    return;
  }

  persistQueue();
  renderQueue();
  announce(action === "delete" ? "대기열 항목을 삭제했습니다." : "대기열 상태를 변경했습니다.", "success");
}

function exportQueue() {
  if (!queuedPosts.length) return announce("저장할 대기열 항목이 없습니다.", "error");
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    posts: queuedPosts,
    notice: "이 파일은 게시 준비 정보입니다. 네이버 자동 발행 기능을 포함하지 않습니다.",
  };
  download("naver-blog-publish-queue.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  announce("게시 대기열을 JSON으로 저장했습니다.", "success");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  compose();
});

form.addEventListener("input", (event) => {
  inputRevision += 1;
  event.target.removeAttribute?.("aria-invalid");
  clearFormError();
  scheduleSave();
});
form.addEventListener("change", () => { inputRevision += 1; scheduleSave(); });
compositionModeInputs.forEach((control) => control.addEventListener("change", updateCompositionModeUi));

titleCandidates.addEventListener("click", (event) => {
  const button = event.target.closest("[data-title-index]");
  if (!button) return;
  const selected = titleCandidateValues[Number(button.dataset.titleIndex)];
  if (!selected) return;
  form.elements.namedItem("title").value = selected;
  persistDraft();
  refreshArticle({ ...(activeInput || serializeForm()), title: selected });
  announce("선택한 제목을 적용하고 게시 준비 묶음을 갱신했습니다.", "success");
});

blockQueue.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-id]");
  if (button) copyBlock(button.dataset.copyId);
});

imagePlanList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-image-index]");
  if (!button) return;
  const plan = imagePlans[Number(button.dataset.imageIndex)];
  if (plan) copyText(formatImagePlan(plan), `이미지 ${plan.order} 계획`);
});

postQueue.addEventListener("click", (event) => {
  const button = event.target.closest("[data-queue-action]");
  if (button) updateQueueRecord(button.dataset.queueId, button.dataset.queueAction);
});

finalChecks.forEach((check) => check.addEventListener("change", updateFinalGate));
speedInput.addEventListener("input", updateSpeed);

document.querySelector("#prev-section").addEventListener("click", () => selectSection(-1));
document.querySelector("#next-section").addEventListener("click", () => selectSection(1));
document.querySelector("#copy-all").addEventListener("click", () => copyText(article?.fullText || "", "전체 글"));
document.querySelector("#copy-rich").addEventListener("click", copyRichPackage);
document.querySelector("#copy-image-plan").addEventListener("click", () => {
  const text = imagePlans.map(formatImagePlan).join("\n\n");
  copyText(text, "이미지 계획 전체");
});
document.querySelector("#export-json").addEventListener("click", exportBundle);
document.querySelector("#export-md").addEventListener("click", exportMarkdown);
document.querySelector("#queue-add").addEventListener("click", addToQueue);
document.querySelector("#queue-export").addEventListener("click", exportQueue);
document.querySelector("#review-toggle").addEventListener("click", toggleReview);
document.querySelector("#review-stop").addEventListener("click", stopReview);
document.querySelector("#edit-source").addEventListener("click", () => {
  form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  (compositionMode() === "generate" ? primaryKeywordInput : draftInput).focus();
});
document.querySelector("#import-trigger").addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => {
  const [file] = importInput.files;
  if (file) importBundle(file);
});

openNaverButton.addEventListener("click", () => {
  if (openNaverButton.disabled || !article) return;
  window.open("https://blog.naver.com/", "_blank", "noopener,noreferrer");
  announce("네이버를 열었습니다. 복사한 글·이미지·공개 범위를 확인한 뒤 직접 발행해 주세요.", "success");
});

document.querySelector("#clear-draft").addEventListener("click", () => {
  if (!window.confirm("현재 입력한 초안을 비우고 새로 시작할까요?")) return;
  form.reset();
  inputRevision += 1;
  requestController?.abort();
  generatedImage = null;
  generationMetadata = null;
  renderGeneratedImage(null);
  localStorage.removeItem(FORM_STORAGE_KEY);
  article = null;
  audit = null;
  copyBlocks = [];
  imagePlans = [];
  titleCandidateValues = [];
  activeInput = null;
  stopReview();
  resetFinalChecks();
  resultState.hidden = true;
  emptyState.hidden = false;
  saveState.textContent = "새 초안";
  saveState.dataset.state = "";
  announce("새 초안을 시작합니다.");
  updateCompositionModeUi();
  primaryKeywordInput.focus();
});

document.addEventListener("keydown", (event) => {
  const tagName = event.target.tagName?.toLocaleLowerCase("en-US");
  const isTyping = ["input", "textarea", "select"].includes(tagName) || event.target.isContentEditable;

  if (event.altKey && article) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      selectSection(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    const shortcuts = {
      "1": "title",
      "2": "intro",
      "3": "section-current",
      "4": "body",
      "5": "tags",
      "6": "sources",
    };
    const id = shortcuts[event.key];
    if (id) {
      event.preventDefault();
      copyBlock(id);
      return;
    }
  }

  if (isTyping || resultState.hidden) return;
  if (event.key === " ") {
    event.preventDefault();
    toggleReview();
  } else if (event.key === "Escape") {
    stopReview();
  } else if (event.key === "[") {
    speedInput.value = String(Math.min(Number(speedInput.max), Number(speedInput.value) + Number(speedInput.step)));
    updateSpeed();
  } else if (event.key === "]") {
    speedInput.value = String(Math.max(Number(speedInput.min), Number(speedInput.value) - Number(speedInput.step)));
    updateSpeed();
  }
});

restoreDraft();
restoreQueue();
resetFinalChecks();
updateSpeed();
stopReview();
updateCompositionModeUi();
announce("대표 키워드 하나를 입력하고 ‘키워드로 본문 생성’을 누르세요.");
checkServer();

if (SAFETY_BOUNDARY.automaticPublishing || SAFETY_BOUNDARY.botDetectionEvasion) {
  throw new Error("Invalid content safety boundary");
}
