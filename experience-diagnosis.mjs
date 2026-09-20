const form = document.querySelector("#experience-form");
const steps = [...document.querySelectorAll(".ed-step")];
const indicators = [...document.querySelectorAll("[data-step-indicator]")];
const progressLabel = document.querySelector("#ed-progress-label");
const nextButton = document.querySelector("#ed-next");
const previousButton = document.querySelector("#ed-prev");
const createButton = document.querySelector("#ed-create");
const formError = document.querySelector("#ed-form-error");
const result = document.querySelector("#ed-result");
const resultText = document.querySelector("#ed-result-text");
const followUpList = document.querySelector("#ed-follow-up-list");
const copyButton = document.querySelector("#ed-copy");
const downloadButton = document.querySelector("#ed-download");
const toast = document.querySelector("#ed-toast");

let activeStep = 1;
let toastTimer = null;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clean(value = "") {
  return String(value).replace(/\r\n?/gu, "\n").replace(/\s+/gu, " ").trim();
}

function values() {
  return Object.fromEntries(new FormData(form).entries());
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function clearError() {
  formError.hidden = true;
  formError.textContent = "";
  form.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute("aria-invalid"));
}

function showError(message, control) {
  clearError();
  formError.textContent = message;
  formError.hidden = false;
  control?.setAttribute("aria-invalid", "true");
  control?.focus();
}

function requiredFieldsFor(stepNumber) {
  return [...steps.find((step) => Number(step.dataset.step) === stepNumber).querySelectorAll("[required]")];
}

function validateStep(stepNumber) {
  clearError();
  const empty = requiredFieldsFor(stepNumber).find((field) => !clean(field.value));
  if (!empty) return true;
  showError("필수 항목을 적어야 다음 단계로 이동할 수 있습니다.", empty);
  return false;
}

function renderStep({ focus = false } = {}) {
  steps.forEach((step) => {
    const current = Number(step.dataset.step) === activeStep;
    step.hidden = !current;
    step.classList.toggle("is-active", current);
  });
  indicators.forEach((indicator) => {
    indicator.classList.toggle("is-active", Number(indicator.dataset.stepIndicator) === activeStep);
  });
  progressLabel.value = `${activeStep} / 4 단계`;
  previousButton.hidden = activeStep === 1;
  nextButton.hidden = activeStep === 4;
  createButton.hidden = activeStep !== 4;

  if (focus) {
    const legend = steps.find((step) => Number(step.dataset.step) === activeStep).querySelector("legend");
    legend?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}

function nextStep() {
  if (!validateStep(activeStep)) return;
  activeStep += 1;
  renderStep({ focus: true });
}

function previousStep() {
  clearError();
  activeStep -= 1;
  renderStep({ focus: true });
}

function answerDraft(input) {
  const organization = clean(input.organization);
  const target = organization ? `${organization}의 ${clean(input.role)} 직무` : `${clean(input.role)} 직무`;
  const roleInExperience = clean(input.roleInExperience);
  const evidence = clean(input.evidence);
  const followUp = clean(input.followUp);
  const sections = [
    `# ${clean(input.experienceTitle)} | ${target} 답변 뼈대`,
    "## 1. 한 문장 결론",
    `저는 ${clean(input.experienceTitle)} 경험을 통해 ${target}에서 필요한 행동을 준비했습니다.`,
    "## 2. 상황",
    clean(input.situation),
    "## 3. 내가 맡은 역할과 행동",
    roleInExperience || "내 역할은 추가로 구체화합니다.",
    clean(input.action),
    "## 4. 확인 근거",
    evidence || "확인 가능한 기록·피드백·관찰이 있다면 이 부분에 추가합니다. 없는 수치나 성과는 만들지 않습니다.",
    "## 5. 지원 직무 연결",
    `${clean(input.connection)} 따라서 저는 ${target}에서 같은 방식으로 문제를 확인하고, 기준을 맞추며, 필요한 사람과 소통하는 데 이 경험을 활용하겠습니다.`,
    "## 6. 말하기 전 점검",
    "- 팀의 성과와 내 행동이 구분되어 있는가?",
    "- 확인할 수 없는 수치·평가·성과를 넣지 않았는가?",
    "- 첫 문장에서 질문에 대한 결론을 말했는가?",
    "- 지원 직무에서의 행동으로 연결했는가?",
  ];
  if (followUp) sections.push("## 예상 추가 질문", followUp);
  return sections.join("\n\n");
}

function renderFollowUps(input) {
  const prompts = [
    "그 상황에서 가장 먼저 확인한 기준은 무엇이었나요?",
    "다른 방법 대신 그 행동을 선택한 이유는 무엇인가요?",
    "팀 전체의 결과와 본인이 직접 한 일을 어떻게 구분할 수 있나요?",
    `이 경험을 ${clean(input.role)} 직무의 어떤 장면에서 활용하겠습니까?`,
  ];
  followUpList.replaceChildren(...prompts.map((prompt) => {
    const item = document.createElement("li");
    item.textContent = prompt;
    return item;
  }));
}

function createResult(event) {
  event.preventDefault();
  if (!validateStep(4)) return;
  const input = values();
  resultText.value = answerDraft(input);
  renderFollowUps(input);
  result.hidden = false;
  result.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  window.setTimeout(() => result.focus(), prefersReducedMotion() ? 0 : 350);
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(resultText.value);
    showToast("답변 뼈대를 복사했습니다.");
  } catch {
    resultText.focus();
    resultText.select();
    showToast("복사가 되지 않아 내용을 선택했습니다. 직접 복사해 주세요.");
  }
}

function downloadResult() {
  const content = resultText.value;
  const filename = `${clean(values().experienceTitle || "jobandkill-experience-diagnosis").replace(/[\\/:*?"<>|]/gu, "-")}.md`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  showToast("작성지를 문서로 저장했습니다.");
}

nextButton.addEventListener("click", nextStep);
previousButton.addEventListener("click", previousStep);
form.addEventListener("submit", createResult);
form.addEventListener("input", clearError);
copyButton.addEventListener("click", copyResult);
downloadButton.addEventListener("click", downloadResult);

renderStep();
