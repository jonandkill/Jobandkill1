const CONNECTORS = ["먼저", "이와 함께", "확인한 뒤", "마지막으로"];

const STRESS_FALLBACKS = {
  unknown_method: {
    difficulty: "처음에는 업무에 필요한 방법과 판단 기준을 충분히 알지 못했습니다",
    impact: "방법을 확인하지 않은 채 진행하면 업무 결과의 정확도가 떨어질 수 있다고 판단했습니다",
  },
  time_pressure: {
    difficulty: "정해진 시간 안에 업무를 마쳐야 해 작업 순서와 속도를 함께 관리해야 했습니다",
    impact: "대응이 늦어지면 다음 업무까지 지연될 수 있다고 판단했습니다",
  },
  workload: {
    difficulty: "여러 업무가 동시에 겹쳐 우선순위를 정하는 일이 쉽지 않았습니다",
    impact: "처리 순서를 놓치면 업무 누락이나 지연으로 이어질 수 있다고 판단했습니다",
  },
  long_duration: {
    difficulty: "한 단계에 예상보다 많은 시간이 걸려 전체 업무 흐름을 유지하기 어려웠습니다",
    impact: "같은 방식을 반복하면 후속업무까지 늦어질 수 있다고 판단했습니다",
  },
  no_helper: {
    difficulty: "바로 도움을 받을 사람이 없어 필요한 기준과 방법을 스스로 확인해야 했습니다",
    impact: "확인 없이 혼자 판단하면 잘못된 방식이 반복될 수 있다고 판단했습니다",
  },
  no_reward: {
    difficulty: "즉각적인 보상이나 인정이 없어도 맡은 업무를 끝까지 이어가야 했습니다",
    impact: "눈앞의 보상보다 맡은 역할과 완료 기준을 지키는 것이 중요하다고 판단했습니다",
  },
  new_environment: {
    difficulty: "처음 접한 환경과 업무 기준에 익숙하지 않아 판단과 작업에 시간이 필요했습니다",
    impact: "환경과 기준을 충분히 이해하지 못하면 같은 문제가 반복될 수 있다고 판단했습니다",
  },
  frequent_change: {
    difficulty: "업무 방식과 기준이 바뀌어 기존 방법을 그대로 적용하기 어려웠습니다",
    impact: "변경사항을 정확히 확인하지 않으면 혼선이나 재작업이 생길 수 있다고 판단했습니다",
  },
};

const ACTION_FALLBACKS = {
  "시키는 대로 하기": "먼저 안내받은 기준과 순서를 확인한 뒤 그대로 적용했습니다",
  "직접 해보기": "설명으로 끝내지 않고 직접 수행하며 부족한 부분을 확인했습니다",
  "찾아보기": "관련 자료와 기존 사례를 찾아 필요한 기준을 확인했습니다",
  "관찰하기": "경험자의 작업 순서와 세부 동작을 관찰해 제 방식과 비교했습니다",
  "인사하기": "함께 일하는 사람에게 먼저 다가가 관계를 만들고 필요한 내용을 물었습니다",
  "전화하기": "정확한 방법을 확인하기 위해 관련 담당자에게 직접 전화했습니다",
  "확인하기": "작업 전후의 기준과 결과를 다시 확인했습니다",
  "정리하기": "확인한 내용을 작업 순서에 맞게 정리했습니다",
  "검색하기": "필요한 정보를 검색해 현재 상황에 적용할 수 있는 방법을 찾았습니다",
  "물어보기": "정확히 모르는 부분을 질문해 필요한 기준과 방법을 확인했습니다",
  "질문 목록 만들기": "모르는 부분을 질문 목록으로 정리해 빠짐없이 확인했습니다",
  "시도하기": "확인한 방법을 실제 업무에 적용해 보았습니다",
  "체크하기": "적용 과정과 결과를 단계별로 체크했습니다",
  "메모하기": "문제의 현상과 확인한 내용을 메모해 다음 작업에 활용했습니다",
  "보고하기": "확인한 문제와 조치 내용을 담당자에게 보고했습니다",
  "일부러 참여하기": "업무를 익히기 위해 관련 작업에 적극적으로 참여했습니다",
  "비교해 보기": "기존 방식과 새로 확인한 방법을 비교해 차이를 점검했습니다",
  "찾아가기": "경험이 많은 사람을 직접 찾아가 구체적인 방법을 물었습니다",
  "문서화하기": "확인한 기준과 작업 순서를 문서로 정리했습니다",
  "저장하기": "다시 확인할 수 있도록 기록과 자료를 저장했습니다",
  "흐름도 그리기": "업무의 판단 기준과 순서를 흐름도로 그려 정리했습니다",
  "재차 시도하기": "첫 시도의 부족한 점을 바꿔 다시 시도했습니다",
  "공유하기": "검증한 방법과 결과를 동료에게 공유했습니다",
  "표준화하기": "누구나 같은 순서로 수행할 수 있도록 기준을 표준화했습니다",
  "체계화하기": "반복해서 사용할 수 있도록 확인·실행·점검 순서를 체계화했습니다",
  "시스템 구축하기": "같은 문제가 반복되지 않도록 관리 절차를 구축했습니다",
  "검토해 보완하기": "적용 결과를 검토하고 부족한 부분을 보완했습니다",
  "피드백하기": "적용 과정에서 확인한 개선점을 구체적으로 피드백했습니다",
  "개선점 찾기": "작업 결과를 비교해 다음에 바꿀 개선점을 찾았습니다",
  "재시도 결과 확인하기": "바꾼 방법으로 다시 수행한 뒤 결과가 달라졌는지 확인했습니다",
};

const ACTION_CUES = /물어|질문|요청|확인|기록|정리|비교|관찰|반복|연습|공유|보고|문서|전화|검색|찾아|적용|수정|시도|제작|점검|준비/;
const EMOTION_CUES = /당황|부담|조바심|두려|막막|부끄|답답|힘들|숨고 싶|뿌듯|자신감/;
const IMPACT_CUES = /지연|불량|품질|안전|사고|마찰|재작업|누락|중단|영향/;

function clean(value, max = 5000) {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function collapseRepeatedPhrases(value) {
  const normalized = clean(value, 12000);
  if (!normalized) return "";
  const tokens = normalized.split(" ");
  for (let size = Math.min(20, Math.floor(tokens.length / 2)); size >= 5; size -= 1) {
    const seen = new Map();
    let index = 0;
    while (index + size <= tokens.length) {
      const key = tokens.slice(index, index + size).join(" ").replace(/[.!?]/g, "");
      const first = seen.get(key);
      if (first !== undefined && index - first >= size) {
        tokens.splice(index, size);
        continue;
      }
      if (first === undefined) seen.set(key, index);
      index += 1;
    }
  }
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeSurface(value) {
  return collapseRepeatedPhrases(value)
    .replace(/다음으로/g, "이와 함께")
    .replace(/이후에는/g, "그 뒤에는")
    .replace(/이후/g, "그 뒤")
    .replace(/개발\s*운영/g, "개발·운영")
    .replace(/피드백\s*반영/g, "피드백 반영")
    .replace(/시간\s*투자/g, "시간 투자")
    .replace(/그\s*후/g, "그 후")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([.!?]){2,}/g, "$1")
    .trim();
}

function feedbackLoopSentence(value) {
  const text = normalizeSurface(value);
  if (!/커리큘럼/.test(text) || !/피드백/.test(text) || !/(적용|반영)/.test(text)) return "";
  const source = /내담자/.test(text) ? "내담자" : /수강생/.test(text) ? "수강생" : "";
  const destination = /다음\s*내담자/.test(text) ? "다음 내담자에게" : /다음\s*수강생/.test(text) ? "다음 수강생에게" : "다음 운영에";
  return source
    ? `커리큘럼을 개발·운영하며 ${source}의 피드백을 받은 뒤 ${destination} 적용했습니다.`
    : `커리큘럼을 개발·운영하며 피드백을 받은 뒤 ${destination} 적용했습니다.`;
}

function polishTail(value, kind = "body") {
  let text = normalizeSurface(value).replace(/[.!?\s]+$/g, "");
  if (!text) return "";
  const feedbackLoop = feedbackLoopSentence(text);
  if (feedbackLoop) return feedbackLoop;

  if (kind === "result") {
    text = text.replace(/^(그 결과\s*)+/, "").replace(/\b잘됐다\b/g, "").replace(/\s+/g, " ").trim();
    const studentIncrease = text.match(/(?:수강생(?:\s*수)?)(?:이|가)?\s*(?:늘어남|증가(?:함|했음)?)/);
    if (studentIncrease) {
      const remainder = text.replace(studentIncrease[0], "").replace(/^[,·\s]+|[,·\s]+$/g, "");
      const feedback = /피드백\s*반영/.test(remainder) ? "수강생 피드백을 반영했고, " : "";
      return `그 결과 ${feedback}수강생이 늘었습니다.`;
    }
    if (!text) return "";
  }
  if (kind === "learning") {
    text = text.replace(/^(이 경험을 통해\s*)+/, "").trim();
    if (/^시간 투자$/.test(text)) return "이 경험을 통해 더 나은 결과를 만들기 위해 필요한 시간을 투자해야 한다는 점을 배웠습니다.";
  }

  text = text.replace(/([가-힣A-Za-z0-9]+)\s+피드백\s+반영$/, "$1 피드백을 반영");

  const endings = [
    [/어려웠음$/, "어려웠습니다"], [/힘들었음$/, "힘들었습니다"], [/알게\s*됨$/, "알게 됐습니다"],
    [/늘어남$/, "늘었습니다"], [/줄어듦$/, "줄었습니다"], [/좋아짐$/, "좋아졌습니다"],
    [/했음$/, "했습니다"], [/였음$/, "였습니다"], [/받음$/, "받았습니다"], [/됨$/, "됐습니다"],
    [/적용$/, "적용했습니다"], [/반영$/, "반영했습니다"], [/확인$/, "확인했습니다"], [/진행$/, "진행했습니다"],
    [/공유$/, "공유했습니다"], [/정리$/, "정리했습니다"], [/비교$/, "비교했습니다"], [/검토$/, "검토했습니다"],
    [/증가$/, "증가했습니다"], [/감소$/, "감소했습니다"],
  ];
  for (const [pattern, replacement] of endings) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }
  if (/잘됐다$/.test(text)) text = text.replace(/잘됐다$/, "결과가 좋아졌습니다");
  return sentence(text);
}

export function polishEssayFragment(value, kind = "body") {
  const surface = normalizeSurface(value);
  if (!surface) return "";
  const feedbackLoop = feedbackLoopSentence(surface);
  if (feedbackLoop && !/[.!?]\s+/.test(surface)) {
    const additions = [feedbackLoop];
    if (/수강생(?:\s*수)?(?:이|가)?\s*(?:늘어남|증가)/.test(surface)) additions.push(polishTail("수강생 늘어남", "result"));
    if (/시간\s*투자/.test(surface)) additions.push(polishTail("시간 투자", "learning"));
    return unique(additions.filter(Boolean)).join(" ");
  }
  const parts = surface
    .replace(/\s+(그 결과|이 경험을 통해|이를 위해|그러나|하지만|그 뒤)\s+/g, ". $1 ")
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((item) => {
      const slot = /^그 결과/.test(item) ? "result" : /^이 경험을 통해/.test(item) ? "learning" : kind;
      const polished = polishTail(item, slot);
      const additions = [polished];
      if (slot !== "result" && /수강생(?:\s*수)?(?:이|가)?\s*(?:늘어남|증가)/.test(item)) additions.push(polishTail("수강생 늘어남", "result"));
      if (slot !== "learning" && /시간\s*투자/.test(item)) additions.push(polishTail("시간 투자", "learning"));
      return additions;
    })
    .filter(Boolean);
  return unique(parts).join(" ");
}

function wordSet(value) {
  const words = normalizeSurface(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [];
  return new Set(words.map((word) => word
    .replace(/(?:했습니다|하였습니다|됐습니다|되었습니다|입니다|였습니다|습니다)$/g, "")
    .replace(/(?:에게|에서|으로|과|와|은|는|이|가|을|를|의|에|로)$/g, ""))
    .filter((word) => word.length >= 2));
}

function similarity(left, right) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.min(a.size, b.size);
}

export function mergeUniqueNarratives(values) {
  const accepted = [];
  for (const value of values) {
    for (const item of sourceSentences(normalizeSurface(value))) {
      const key = normalizeSurface(item).replace(/[.!?\s]/g, "");
      if (!key) continue;
      const duplicate = accepted.some((prior) => {
        const priorKey = normalizeSurface(prior).replace(/[.!?\s]/g, "");
        const overlap = similarity(prior, item);
        const shortClaim = Math.min(wordSet(prior).size, wordSet(item).size) <= 4;
        return priorKey === key || (Math.min(priorKey.length, key.length) >= 18 && (priorKey.includes(key) || key.includes(priorKey))) || overlap >= (shortClaim ? 0.66 : 0.86);
      });
      if (!duplicate) accepted.push(sentence(item));
    }
  }
  return accepted.join(" ");
}

function withoutEnding(value) {
  return clean(value).replace(/[.!?\s]+$/g, "");
}

function sentence(value) {
  const text = clean(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function withLead(value, lead) {
  const text = withoutEnding(value);
  if (!text) return "";
  if (/^(당시|특히|처음에는|이대로라면|먼저|이와 함께|확인한 뒤|그 뒤|마지막으로|피드백을 받은 뒤)/.test(text)) {
    return sentence(text);
  }
  return sentence(`${lead} ${text}`);
}

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = clean(value).replace(/[.!?\s]/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceSentences(value) {
  return normalizeSurface(value)
    .split(/(?<=[.!?]|다\.)\s+|\n+/)
    .map((item) => clean(item, 1400))
    .filter((item) => item.length >= 8);
}

function connectSentences(values) {
  const items = unique(values.map((value) => sentence(value)).filter(Boolean));
  return items.map((value, index) => {
    if (/^(먼저|이와 함께|확인한 뒤|그 뒤|마지막으로|피드백을 받은 뒤)/.test(value)) return value;
    const lead = index === 0 ? "먼저" : index === items.length - 1 && items.length > 1 ? "마지막으로" : "이와 함께";
    return `${lead} ${value}`;
  }).join(" ");
}

/**
 * ST 분류명은 질문을 고르는 데만 사용한다. 최종 문장은 사용자가 입력한
 * 장면·조건·부족함·감정·영향만으로 만든다.
 */
export function composeSituationNarrative(project, options = {}) {
  const evidence = project?.situationEvidence && typeof project.situationEvidence === "object"
    ? project.situationEvidence
    : {};
  const selected = Array.isArray(project?.selectedStress)
    ? project.selectedStress.filter((id) => id && id !== "none")
    : [];
  const source = sourceSentences(project?.experience);
  const fallbacks = selected.map((id) => STRESS_FALLBACKS[id]).filter(Boolean).slice(0, 3);
  const fallback = fallbacks[0];
  const allowGuidedFallback = Boolean(options?.allowGuidedFallback);
  const scene = clean(evidence.scene) || (allowGuidedFallback && selected.length ? clean(source[0]) : "");
  const constraint = clean(evidence.constraint) || (allowGuidedFallback ? clean(source.find((item) => /\d/.test(item))) : "");
  const enteredDifficulty = clean(evidence.difficulty);
  const guidedDifficulties = allowGuidedFallback && !enteredDifficulty
    ? fallbacks.map((item) => clean(item?.difficulty)).filter(Boolean)
    : [];
  const difficulty = enteredDifficulty || guidedDifficulties[0] || "";
  const emotion = clean(evidence.emotion) || (allowGuidedFallback ? clean(source.find((item) => EMOTION_CUES.test(item))) : "");
  const impact = clean(evidence.impact || project?.cognitiveAppraisal) || (allowGuidedFallback ? clean(source.find((item) => IMPACT_CUES.test(item)) || fallback?.impact) : "");
  const structured = [scene, constraint, difficulty, emotion, impact].some(Boolean);

  const secondaryDifficulties = allowGuidedFallback && enteredDifficulty
    ? fallbacks.slice(1).map((item) => clean(item?.difficulty)).filter(Boolean)
    : [];
  const difficultyParts = enteredDifficulty
    ? [withLead(enteredDifficulty, "특히"), ...secondaryDifficulties.map((value, index) => withLead(value, index === 0 ? "게다가" : "여기에"))]
    : guidedDifficulties.map((value, index) => withLead(value, index === 0 ? "특히" : index === 1 ? "게다가" : "여기에"));
  const parts = unique([
    scene ? sentence(scene) : "",
    constraint ? withLead(constraint, "당시") : "",
    ...difficultyParts,
    emotion ? withLead(emotion, "처음에는") : "",
    impact ? withLead(impact, "이대로라면") : "",
  ]);

  const warnings = [];
  if (allowGuidedFallback && selected.length && (!clean(evidence.scene) || !clean(evidence.difficulty))) warnings.push("선택한 상황을 바탕으로 일반 문장을 구성했습니다. 실제 장면·조건을 입력하면 더 구체적인 초안이 됩니다.");
  if (selected.length && !scene) warnings.push("선택한 어려움이 발생한 실제 장면을 입력해 주세요.");
  if (selected.length && !constraint) warnings.push("시간·거리·횟수·인원·무게 등 확인 가능한 조건이 있다면 보완해 주세요.");
  if (selected.length && !difficulty) warnings.push("무엇을 몰랐거나 어떤 부분이 부족했는지 구체화해 주세요.");
  if (selected.length && !emotion) warnings.push("당시 실제로 느낀 부담이나 감정을 본인의 말로 입력해 주세요.");
  if (selected.length && !impact) warnings.push("그대로 두었을 때 생길 지연·품질·안전 영향을 입력해 주세요.");

  return {
    text: parts.join(" "),
    warnings,
    structured,
    completion: [scene, constraint, difficulty, emotion, impact].filter(Boolean).length,
  };
}

function stepBody(step) {
  const target = withoutEnding(step?.target);
  const behavior = clean(step?.behavior);
  const first = sentence([target, behavior].filter(Boolean).join(" "));
  return unique([
    first,
    sentence(step?.feedback),
    sentence(step?.adjustment),
    sentence(step?.outcome),
  ]).join(" ");
}

/**
 * 행동 모드명은 문장에 쓰지 않는다. 순서와 사용자가 적은 대상·행동·피드백·
 * 수정·결과만 연결한다.
 */
export function composeActionNarrative(project, options = {}) {
  const steps = Array.isArray(project?.actionSteps)
    ? project.actionSteps
      .filter((step) => step && typeof step === "object" && [step.behavior, step.feedback, step.adjustment, step.outcome].some((value) => clean(value)))
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    : [];

  if (!steps.length) {
    const legacy = polishEssayFragment(project?.actionDetail, "action");
    const allowGuidedFallback = Boolean(options?.allowGuidedFallback);
    const selected = Array.isArray(project?.selectedActions) ? project.selectedActions : [];
    const selectedFallbacks = selected
      .map((id) => ACTION_FALLBACKS[String(id).slice(String(id).indexOf(":") + 1)])
      .filter(Boolean)
      .slice(0, 5);
    const inferred = sourceSentences(polishEssayFragment(project?.experience, "action")).filter((item) => ACTION_CUES.test(item)).slice(0, 5);
    const guided = allowGuidedFallback && !legacy ? connectSentences(selectedFallbacks.length ? selectedFallbacks : inferred) : "";
    return {
      text: legacy || guided,
      warnings: selected.length && !legacy
        ? [guided ? "선택한 행동을 문장으로 자동 구성했습니다. 대상·방법·피드백을 입력하면 더 현장감 있게 바뀝니다." : "선택한 행동을 누구에게·무엇을·어떻게 했는지 입력해 주세요."]
        : allowGuidedFallback && guided ? ["경험 원문에서 행동 문장을 찾아 자동으로 연결했습니다. 실제 순서를 확인해 주세요."] : [],
      structured: false,
      completion: legacy || guided ? 1 : 0,
    };
  }

  const parts = steps.map((step, index) => {
    const body = stepBody(step);
    if (/^(먼저|이와 함께|확인한 뒤|그 뒤|마지막으로|피드백을 받은 뒤)/.test(body)) return body;
    let connector = CONNECTORS[Math.min(index, 2)];
    if (steps.length > 1 && index === steps.length - 1) connector = CONNECTORS[3];
    if (step.phase === "feedback" && index > 0 && index < steps.length - 1) connector = "피드백을 받은 뒤";
    return `${connector} ${body}`;
  });

  const warnings = [];
  if (!steps.some((step) => clean(step.target))) warnings.push("질문한 사람·확인한 자료·적용한 현장 등 행동 대상을 보완해 주세요.");
  if (!steps.some((step) => clean(step.feedback) || clean(step.adjustment))) warnings.push("받은 피드백과 바꾼 점을 입력하면 해결 과정이 더 분명해집니다.");
  if (!steps.some((step) => clean(step.outcome)) && !clean(project?.result)) warnings.push("재시도나 적용 후 달라진 점을 입력해 주세요.");

  return {
    text: parts.join(" "),
    warnings,
    structured: true,
    completion: steps.length,
  };
}

const THINKING_FALLBACKS = {
  logical: {
    cues: /비교|대안|기준|분류|우선|원인|패턴|선택/,
    contextual: "받은 피드백과 기존 운영 내용을 비교해 다음 과정에 반영할 내용을 정했습니다",
    generic: "확인한 방법들을 비교해 적용 기준을 세우고 가장 적합한 방법을 선택했습니다",
  },
  creative: {
    cues: /(기존|현재).*(활용|응용|결합|재사용|보완)|간소화|바꾸어 적용/,
    contextual: "커리큘럼 전체를 새로 만드는 대신 기존 운영 내용에 피드백을 반영해 다음 과정에 적용했습니다. 기존 운영에서 활용할 수 있는 부분은 유지하고 피드백이 필요한 부분만 보완해 다음 내담자에게 적용하는 데 집중했습니다",
    generic: "기존 방식에서 활용할 부분은 유지하고 필요한 부분만 보완해 적용했습니다",
  },
  critical: {
    cues: /피드백|의견|경청|확인|사실|검토|질문|보고/,
    contextual: "피드백을 개인적인 평가로만 받아들이지 않고 운영 과정에서 확인할 정보로 경청한 뒤, 다음에 반영할 내용을 정했습니다. 의견을 듣는 데 그치지 않고 실제 커리큘럼에서 바꿀 수 있는 내용으로 옮겼습니다",
    generic: "상황을 감정적으로 단정하지 않고 확인할 사실과 필요한 행동을 구분해 실행했습니다",
  },
};

export function inferThinkingIds(project) {
  const source = normalizeSurface(`${project?.experience || ""} ${project?.actionDetail || ""} ${project?.result || ""}`);
  const contextualFeedback = /피드백|의견/.test(source) && /반영|적용/.test(source);
  return ["critical", "logical", "creative"].filter((id) => {
    if (id === "critical" && contextualFeedback) return true;
    if (id === "creative" && /커리큘럼/.test(source) && /다음\s*(?:내담자|수강생|운영|과정)/.test(source) && /반영|적용/.test(source)) return true;
    return THINKING_FALLBACKS[id]?.cues.test(source);
  }).slice(0, 2);
}

export function composeThinkingNarrative(project) {
  const selected = Array.isArray(project?.selectedThinking) ? project.selectedThinking.filter((id) => THINKING_FALLBACKS[id]) : [];
  const evidence = project?.thinkingEvidence && typeof project.thinkingEvidence === "object" ? project.thinkingEvidence : {};
  const source = normalizeSurface(`${project?.experience || ""} ${project?.actionDetail || ""}`);
  const contextualFeedback = /커리큘럼/.test(source) && /피드백/.test(source) && /반영|적용/.test(source);
  // 추천 문장은 사용자가 카드를 선택한 뒤에만 확정 근거가 된다. 원문 단서만으로
  // 비교·재구성·경청 행동을 최종 문장에 자동 삽입하지 않는다.
  const ids = selected;
  const parts = ids.map((id) => {
    const entered = clean(evidence[id]);
    if (entered) return /(?:습니다|했습니다|정했습니다|옮겼습니다)[.!?]?$/.test(entered)
      ? sentence(entered)
      : polishEssayFragment(entered, "action");
    const fallback = THINKING_FALLBACKS[id];
    if (!fallback) return "";
    return sentence(contextualFeedback ? fallback.contextual : fallback.generic);
  }).filter(Boolean);
  const warnings = [];
  if (selected.length && selected.some((id) => !clean(evidence[id]))) warnings.push("선택한 판단 방식은 실제로 수행했다는 확인으로 문장화했습니다. 비교 대상·판단 기준·적용 내용을 입력하면 더 구체적으로 바뀝니다.");
  return { text: mergeUniqueNarratives(parts), warnings, selected: ids, provenance: selected.length ? "selection" : "none" };
}

export function composeExperienceNarrative(project) {
  const text = polishEssayFragment(project?.experience, "experience");
  if (!text) return "";
  const workplace = clean(project?.workplace);
  const role = clean(project?.experienceRole);
  if (!workplace && !role) return text;
  const opening = workplace && role
    ? `${workplace}에서 ${role}로 업무를 수행한 경험이 있습니다.`
    : workplace ? `${workplace}에서 업무를 수행한 경험이 있습니다.` : `${role}로 업무를 수행한 경험이 있습니다.`;
  return mergeUniqueNarratives([opening, text]);
}

export function composeResultNarrative(project) {
  return polishEssayFragment(project?.result, "result");
}

export function composeLearningNarrative(project) {
  const text = polishEssayFragment(project?.learning, "learning");
  if (!text) return "";
  return /^이 경험을 통해/.test(text) ? text : `이 경험을 통해 ${withoutEnding(text)}.`;
}

export function composeContextNarrative(project) {
  const situation = composeSituationNarrative(project, { allowGuidedFallback: false });
  const thinking = composeThinkingNarrative(project, { allowGuidedFallback: true });
  const action = composeActionNarrative(project, { allowGuidedFallback: true });
  const experienceParts = sourceSentences(composeExperienceNarrative(project));
  const embeddedResult = experienceParts.filter((item) => /^그 결과|수강생(?:\s*수)?이?\s*늘|증가했습니다|감소했습니다|좋아졌습니다/.test(item)).join(" ");
  const embeddedLearning = experienceParts.filter((item) => /^이 경험을 통해|배웠습니다/.test(item)).join(" ");
  const experience = experienceParts.filter((item) => !embeddedResult.includes(item) && !embeddedLearning.includes(item)).join(" ");
  const text = mergeUniqueNarratives([
    experience,
    situation.text,
    thinking.text,
    action.text,
    mergeUniqueNarratives([composeResultNarrative(project), embeddedResult]),
    mergeUniqueNarratives([composeLearningNarrative(project), embeddedLearning]),
  ]);
  return {
    text,
    situation,
    thinking,
    action,
    warnings: [...situation.warnings, ...thinking.warnings, ...action.warnings],
    provenance: thinking.provenance === "selection" || (Array.isArray(project?.selectedStress) && project.selectedStress.some((id) => id !== "none")) || (Array.isArray(project?.selectedActions) && project.selectedActions.length) ? "selection" : thinking.provenance === "inferred" ? "inferred" : "input",
  };
}

export function narrativeMissingLabels(project) {
  const situation = composeSituationNarrative(project);
  const action = composeActionNarrative(project);
  return [...situation.warnings, ...action.warnings];
}
