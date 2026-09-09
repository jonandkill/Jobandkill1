export const SAFETY_BOUNDARY = Object.freeze({
  browserAutomation: false,
  simulatedTyping: false,
  automaticPublishing: false,
  botDetectionEvasion: false,
  credentialStorage: false,
  explicitHumanCopyRequired: true,
});

export const POST_STATUSES = Object.freeze({
  draft: "작성 중",
  review: "검수 대기",
  approved: "발행 승인",
  published: "게시 완료",
});

const HEADING_PATTERN = /^(?:#{1,3}\s+|(?:\d{1,2}[.)]|[①-⑳])\s*|(?:핵심|정리|요약|체크|결론|FAQ|자주 묻는 질문)\s*[:：])/u;
const BULLET_PATTERN = /^(?:[-*•]|\d+[.)]|[①-⑳])\s+/u;
const RISKY_CLAIM_PATTERN = /(무조건|100\s*%|완벽하게|반드시 합격|수익을? 보장|절대 손해|업계\s*1위|최고의|유일한)/giu;

const CATEGORY_RULES = Object.freeze([
  { label: "취업·면접", pattern: /(면접|취업|채용|자소서|자기소개서|직무|인사담당|공기업|공공기관|ncs)/iu },
  { label: "부동산·분양", pattern: /(부동산|분양|청약|아파트|입주|분양권|재건축|재개발|동호수)/u },
  { label: "연구·논문", pattern: /(논문|연구|학술|학회|저널|kci|ssci|sci|통계|설문)/iu },
  { label: "교육·강의", pattern: /(교육|강의|수업|교재|학습|학생|대학|진로)/u },
]);

export function normalizeText(value = "") {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseKeywords(primary = "", secondary = "") {
  const values = [primary, ...String(secondary).split(/[,\n]/u)]
    .map((value) => value.trim().replace(/^#+/u, ""))
    .filter(Boolean);

  return [...new Set(values.map((value) => value.toLocaleLowerCase("ko-KR")))]
    .map((lower) => values.find((value) => value.toLocaleLowerCase("ko-KR") === lower));
}

export function parseSources(value = "") {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/u, "").trim())
    .filter(Boolean)
    .map((line, index) => {
      const url = line.match(/https?:\/\/[^\s)\]]+/iu)?.[0] ?? "";
      return {
        id: `source-${index + 1}`,
        label: line,
        url,
      };
    });
}

export function inferBlogCategory(input = {}) {
  const explicit = normalizeText(input.category);
  if (explicit) return explicit;

  const searchable = [input.primaryKeyword, input.secondaryKeywords, input.topic, input.draft]
    .map(normalizeText)
    .join(" ");
  return CATEGORY_RULES.find((rule) => rule.pattern.test(searchable))?.label ?? "일반 정보";
}

function defaultAudience(category) {
  const audiences = {
    "취업·면접": "채용을 준비하는 지원자",
    "공공기관·NCS": "공공기관 취업을 준비하는 지원자",
    "부동산·분양": "계약과 청약을 검토하는 독자",
    "교육·강의": "학습 내용을 실제로 활용하려는 학습자",
    "연구·논문": "연구 결과와 적용 범위를 확인하려는 독자",
    "일반 정보": "핵심 정보와 실행 방법을 찾는 독자",
  };
  return audiences[category] ?? audiences["일반 정보"];
}

function defaultCallToAction(category) {
  const actions = {
    "취업·면접": "지원 기업·기관의 최신 채용공고와 직무기술서를 확인한 뒤 자신의 경험 근거를 답변에 연결해 보세요.",
    "공공기관·NCS": "지원 기관의 최신 공고와 직무기술서를 대조하고 자격·우대조건과 경험 근거를 다시 점검하세요.",
    "부동산·분양": "계약 또는 청약 전 최신 모집공고와 관계기관 안내를 확인하고 수치·일정·규제를 다시 대조하세요.",
    "교육·강의": "오늘 정리한 기준을 실제 과제나 사례에 적용하고 결과를 기록해 다음 학습에 반영하세요.",
    "연구·논문": "원문과 연구방법을 직접 확인하고 근거가 허용하는 범위 안에서 결과를 해석하세요.",
    "일반 정보": "공식 자료와 현재 조건을 대조한 뒤 자신에게 맞는 다음 행동을 선택하세요.",
  };
  return actions[category] ?? actions["일반 정보"];
}

function employmentSections({ keyword, audience }) {
  return [
    {
      heading: "채용공고와 직무 기준부터 확인한다",
      paragraphs: [
        `${keyword} 관련 글은 채용공고의 담당업무, 지원요건, 우대조건, 전형절차를 구분하는 것에서 시작한다. 공고에 적힌 표현을 그대로 확인하고, 비슷해 보이는 직무라도 기업과 부서에 따라 요구하는 역할이 다를 수 있다는 점을 함께 살핀다.`,
        `${audience}은 공고 문장마다 자신이 제시할 수 있는 경험을 연결해 표로 정리하면 좋다. 경험이 없는 항목은 억지로 꾸미지 않고 교육, 실습, 프로젝트, 아르바이트 등 실제로 수행한 범위에서 가장 가까운 근거를 찾는다.`,
      ],
    },
    {
      heading: "전문가 관점에서 핵심 요구를 해석한다",
      paragraphs: [
        `채용문구를 나열하는 데서 끝내지 않고 조직이 그 역량을 왜 요구하는지 해석한다. 업무의 대상, 반복되는 문제, 협업 상대, 성과 기준을 나누면 기업이 확인하려는 행동이 무엇인지 보다 분명해진다.`,
        `해석한 내용은 공고 원문과 구분해 표시한다. 공식 사실, 작성자의 분석, 지원자에게 제안하는 전략을 섞지 않으면 독자가 어느 부분을 직접 재확인해야 하는지도 쉽게 알 수 있다.`,
      ],
    },
    {
      heading: "경험을 행동과 근거 중심으로 정리한다",
      paragraphs: [
        `답변 소재는 상황 설명보다 본인이 맡은 역할과 실제 행동을 중심으로 정리한다. 당시 목표, 제약조건, 판단 기준, 실행 순서, 결과, 이후 개선점을 분리하면 사례의 신뢰도와 직무 연관성을 함께 확인할 수 있다.`,
        `수치가 기억나지 않으면 새로 만들지 않는다. 확인 가능한 기록이 있을 때만 수치를 사용하고, 그렇지 않다면 변화의 방향과 검증 방법을 구체적으로 설명하는 편이 안전하다.`,
      ],
    },
    {
      heading: "질문 의도에 맞게 답변 구조를 만든다",
      paragraphs: [
        `답변은 먼저 결론을 제시하고 그 판단의 근거와 사례를 연결한 뒤 지원 직무에서의 활용으로 마무리한다. 모든 질문에 같은 사례를 반복하기보다 직무역량, 문제해결, 협업, 안전과 품질 등 질문의 평가기준에 맞춰 근거를 선택한다.`,
        `외운 문장을 그대로 읽는 인상보다 핵심 단어와 이야기 순서를 기억하는 방식이 실제 대화에 유리하다. 추가 질문이 나오면 처음 답변에서 생략한 판단 과정이나 본인의 기여 범위를 보완한다.`,
      ],
    },
    {
      heading: "실전 말하기와 추가 질문을 점검한다",
      paragraphs: [
        `초안을 소리 내어 말하면서 첫 문장에서 질문에 답했는지, 설명이 길어지지 않는지, 주어가 분명한지 확인한다. 팀의 성과와 본인의 행동을 구분하고 전문용어는 면접관이 이해할 수 있는 표현으로 풀어 쓴다.`,
        `연습 후에는 예상 추가 질문을 기록한다. 왜 그렇게 판단했는지, 다른 방법은 없었는지, 실패 가능성을 어떻게 관리했는지, 같은 문제가 다시 생기면 무엇을 바꿀지를 준비하면 답변의 깊이가 높아진다.`,
      ],
    },
    {
      heading: "지원 전 실행 계획을 세운다",
      paragraphs: [
        `마지막에는 공고 확인, 기업·직무 분석, 경험 선별, 답변 작성, 말하기 연습, 수정 순으로 실행 일정을 정한다. 한 번에 완성하려 하기보다 근거가 약한 문장과 지나치게 긴 부분을 표시하고 단계별로 보완한다.`,
        `최종본에는 확인한 공고 날짜와 출처를 남긴다. 채용 일정이나 자격조건은 바뀔 수 있으므로 제출과 면접 직전에 공식 채널에서 다시 확인한다.`,
      ],
    },
  ];
}

function realEstateSections({ keyword, audience }) {
  return [
    {
      heading: "공식 공고와 사업 개요를 먼저 확인한다",
      paragraphs: [
        `${keyword} 정보를 볼 때는 모집공고, 사업주체 안내, 지자체 고시 등 확인 가능한 원문을 먼저 찾는다. 단지명이나 홍보문구만으로 판단하지 않고 공급규모, 주택형, 일정, 자격조건처럼 의사결정에 직접 영향을 주는 항목을 분리한다.`,
        `${audience}은 원문 게시일과 수정 여부도 함께 기록해야 한다. 블로그나 커뮤니티 자료는 이해를 돕는 참고자료로 활용하되 계약과 청약의 기준은 최신 공식 문서에서 다시 확인한다.`,
      ],
    },
    {
      heading: "일정과 자금 항목을 한 표로 정리한다",
      paragraphs: [
        `청약 접수, 당첨자 발표, 서류 제출, 계약, 납부 일정은 서로 연결되어 있으므로 날짜와 필요한 행동을 함께 적는다. 분양가만 보는 대신 계약금, 중도금, 잔금, 선택품목, 취득과 보유 과정에서 생길 수 있는 비용을 구분한다.`,
        `확정되지 않은 금액이나 대출 가능 여부를 단정하지 않는다. 본인의 소득, 보유주택, 신용상태와 금융기관 심사기준을 별도로 확인해 감당 가능한 범위를 계산한다.`,
      ],
    },
    {
      heading: "자격과 규제는 현재 기준으로 대조한다",
      paragraphs: [
        `거주지역, 청약통장, 세대구성, 주택보유 여부, 재당첨 제한, 전매와 거주의무 등은 시점과 사업에 따라 적용 내용이 달라질 수 있다. 해당 문구가 모집공고의 어느 부분에 있는지 표시해 두면 재확인이 쉽다.`,
        `요약 글에는 적용대상과 예외조건을 분리한다. 개인의 계약 가능 여부는 일반 설명만으로 확정하지 않고 공고기관, 사업주체, 금융기관 또는 관련 전문가에게 확인할 항목으로 남긴다.`,
      ],
    },
    {
      heading: "입지는 생활 동선으로 분석한다",
      paragraphs: [
        `교통, 직주거리, 교육, 상권, 의료, 공원과 소음요인을 실제 이동시간과 이용방식으로 살핀다. 지도상 거리가 가까워 보여도 출입구 위치, 보행경로, 경사, 혼잡시간에 따라 체감 편의가 달라질 수 있다.`,
        `호재나 개발계획은 확정, 추진, 검토 단계를 구분한다. 발표자료의 주체와 기준일을 적고 실현 시점이 불명확한 계획은 현재 가치와 분리해 설명한다.`,
      ],
    },
    {
      heading: "실거주와 거래 위험을 따로 평가한다",
      paragraphs: [
        `실거주는 가족구성, 출퇴근, 교육과 생활편의가 핵심이고 거래 판단은 공급량, 입주시점, 주변 비교대상, 자금조달과 보유기간이 중요하다. 두 목적을 한 점수로 섞기보다 각각의 장점과 부담을 작성한다.`,
        `호가를 실제 거래가격처럼 표현하지 않고 계약서 특약, 권리관계, 납부내역, 옵션 승계, 세금과 수수료를 별도로 확인한다. 수익 가능성은 보장하지 않으며 불리한 조건도 함께 제시한다.`,
      ],
    },
    {
      heading: "계약 전 최종 점검표를 만든다",
      paragraphs: [
        `최종 단계에서는 공식 문서, 자금계획, 자격조건, 현장 동선, 계약조건, 위험요인을 한 번에 대조한다. 확인한 사람과 기관, 날짜, 답변 내용을 기록하면 이후 정보가 달라졌을 때 비교하기 쉽다.`,
        `게시글 역시 기준일을 표시하고 변경 가능성이 있는 내용을 구분한다. 독자가 자신의 조건에 맞게 다시 확인할 수 있도록 원문 링크와 확인 순서를 함께 제공한다.`,
      ],
    },
  ];
}

function researchSections({ keyword, audience }) {
  return [
    {
      heading: "연구 질문과 핵심 개념을 분명히 한다",
      paragraphs: [
        `${keyword}을 다룰 때는 먼저 어떤 현상을 누구에게서 어떤 관계로 확인하려는지 정리한다. 핵심 개념의 정의와 측정 범위를 구분하고 비슷한 용어를 같은 의미로 사용하지 않도록 한다.`,
        `${audience}이 선행연구와 이번 연구의 차이를 이해할 수 있도록 이론적 근거, 연구 공백, 예상 기여를 연결하되 확인되지 않은 독창성이나 우월성을 단정하지 않는다.`,
      ],
    },
    {
      heading: "선행연구의 범위와 근거를 점검한다",
      paragraphs: [
        `검색식, 데이터베이스, 포함기간과 선정기준을 기록하면 문헌 검토의 재현성이 높아진다. 제목이나 초록만으로 결론을 옮기지 않고 가능한 경우 원문에서 표본, 측정도구, 분석방법과 한계를 확인한다.`,
        `서로 다른 결과가 있으면 유리한 연구만 선택하지 않고 표본과 맥락의 차이를 비교한다. 인용한 주장과 원문의 의미가 일치하는지도 문장 단위로 검토한다.`,
      ],
    },
    {
      heading: "연구방법이 목적에 맞는지 확인한다",
      paragraphs: [
        `표본선정, 측정수준, 신뢰도와 타당도, 분석가정이 연구 질문에 부합하는지 살핀다. 통계적으로 유의하다는 사실과 실제 효과가 크거나 실무적으로 중요하다는 판단은 구분한다.`,
        `자료의 한계와 대안 설명을 함께 검토하고 분석 과정에서 제외한 사례나 변경한 기준이 있다면 그 이유를 기록한다.`,
      ],
    },
    {
      heading: "결과와 해석의 경계를 지킨다",
      paragraphs: [
        `결과표에 나타난 값, 연구자가 제시한 해석, 작성자의 추가 해석을 구분한다. 상관관계만으로 인과를 단정하거나 특정 표본의 결과를 모든 집단에 확대하지 않는다.`,
        `예상과 다른 결과도 숨기지 않고 이론, 측정, 표본과 맥락의 가능성을 비교한다. 후속 연구에서 확인해야 할 조건을 함께 제안한다.`,
      ],
    },
    {
      heading: "실무 적용 범위를 구체화한다",
      paragraphs: [
        `연구결과를 교육, 채용, 조직관리 등 현장에 적용하려면 대상, 절차, 비용, 윤리와 평가방법을 명시한다. 연구에서 직접 확인하지 않은 효과는 가설이나 제안으로 표현한다.`,
        `적용 전 작은 범위에서 시험하고 사전 기준과 사후 결과를 비교한다. 불리한 결과와 예상하지 못한 영향도 기록해 확대 여부를 결정한다.`,
      ],
    },
    {
      heading: "인용과 최종 검수를 마친다",
      paragraphs: [
        `저자, 연도, 제목, 학술지와 식별정보를 원문과 대조하고 직접인용과 요약을 구분한다. 표와 수치가 본문 설명과 일치하는지, 제한점과 이해상충이 빠지지 않았는지도 확인한다.`,
        `마지막에는 독자가 원문을 찾을 수 있는 출처를 제공하고 학술적 결론과 실무 제안을 분리해 제시한다.`,
      ],
    },
  ];
}

function educationSections({ keyword, audience }) {
  return [
    {
      heading: "학습목표와 현재 수준을 먼저 확인한다",
      paragraphs: [
        `${keyword} 학습은 수업이 끝난 뒤 무엇을 설명하거나 수행할 수 있어야 하는지 정하는 것에서 시작한다. 지식 이해, 실제 수행, 태도 변화 중 어느 수준을 목표로 하는지 구분한다.`,
        `${audience}의 사전경험과 어려움을 확인해 이미 아는 내용은 줄이고 실제로 막히는 지점에 시간과 예시를 배분한다.`,
      ],
    },
    {
      heading: "핵심 개념을 실제 사례와 연결한다",
      paragraphs: [
        `용어 정의를 제시한 뒤 현장에서 언제 사용하고 어떤 판단에 도움이 되는지 사례로 설명한다. 비슷한 개념의 차이와 잘못 적용했을 때 생기는 문제도 함께 다룬다.`,
        `예시는 학습자의 전공과 진로 맥락에 맞추고 확인되지 않은 성과를 일반화하지 않는다.`,
      ],
    },
    {
      heading: "설명과 실습을 짧게 반복한다",
      paragraphs: [
        `긴 설명 뒤에 한 번 실습하는 방식보다 핵심 설명, 짧은 적용, 피드백, 재적용을 반복한다. 실습 지시에는 목표, 수행시간, 제출형식과 평가기준을 함께 적는다.`,
        `참여하지 못한 학습자도 이후 돌아와 완료할 수 있도록 예시와 단계별 안내를 남긴다.`,
      ],
    },
    {
      heading: "피드백을 행동 기준으로 제공한다",
      paragraphs: [
        `잘했다는 평가만 제시하지 않고 유지할 행동, 수정할 부분, 다음 시도에서 적용할 방법을 구분한다. 개인의 성향을 단정하기보다 관찰된 결과와 제출물을 근거로 설명한다.`,
        `학습자가 스스로 수정할 수 있도록 좋은 예와 보완 예의 차이를 구체적으로 보여준다.`,
      ],
    },
    {
      heading: "현장 전이를 확인한다",
      paragraphs: [
        `수업 안에서 이해한 내용이 실제 과제나 업무에서도 사용되는지 확인한다. 다른 상황에 같은 기준을 적용해 보고 무엇이 달라지는지 비교하면 단순 암기를 줄일 수 있다.`,
        `적용 결과를 기록하고 다음 수업에서 다시 검토해 학습과 실무의 연결을 강화한다.`,
      ],
    },
    {
      heading: "평가와 다음 학습을 설계한다",
      paragraphs: [
        `평가는 학습목표와 같은 행동을 측정해야 한다. 정답 확인뿐 아니라 문제해결 과정, 판단 근거, 결과물의 품질을 함께 살핀다.`,
        `마지막에는 부족한 항목을 다음 학습계획으로 연결하고 다시 수행할 시점과 확인방법을 정한다.`,
      ],
    },
  ];
}

function generalSections({ keyword, audience }) {
  return [
    {
      heading: "검색한 목적과 핵심 질문을 정리한다",
      paragraphs: [
        `${keyword}을 찾는 이유는 사람마다 다를 수 있다. 먼저 ${audience}이 알고 싶은 조건, 비교 기준, 비용, 절차와 주의사항을 질문 형태로 정리한다.`,
        `질문을 먼저 정하면 관련 없는 정보를 늘리지 않고 실제 결정에 필요한 내용부터 확인할 수 있다.`,
      ],
    },
    {
      heading: "공식 정보와 해석을 구분한다",
      paragraphs: [
        `날짜, 수치, 자격조건과 제도는 원문 출처를 확인하고 작성자의 의견과 분리한다. 정보의 기준일과 적용대상을 함께 기록하면 변경된 내용을 알아보기 쉽다.`,
        `확인하지 못한 내용은 추정으로 채우지 않고 확인할 항목으로 표시한다.`,
      ],
    },
    {
      heading: "비교 기준을 같은 단위로 맞춘다",
      paragraphs: [
        `여러 선택지를 비교할 때는 장점만 모으지 않고 비용, 시간, 접근성, 위험, 유지조건을 같은 항목으로 평가한다.`,
        `개인에게 중요한 기준에 우선순위를 두고 근거가 약한 평가는 별도로 표시한다.`,
      ],
    },
    {
      heading: "실행 순서를 작게 나눈다",
      paragraphs: [
        `정보 확인, 조건 비교, 필요한 서류나 준비물 정리, 실행, 결과 확인 순으로 나누면 누락을 줄일 수 있다.`,
        `각 단계마다 완료 기준과 다시 확인할 날짜를 적어 두면 변경된 정보에 대응하기 쉽다.`,
      ],
    },
    {
      heading: "주의사항과 예외조건을 확인한다",
      paragraphs: [
        `일반적인 설명이 모든 사람에게 그대로 적용되는 것은 아니다. 대상, 지역, 시점과 개인 조건에 따라 달라지는 부분을 따로 확인한다.`,
        `결제, 계약, 신청처럼 되돌리기 어려운 행동 전에는 공식 안내와 최종 화면을 다시 읽는다.`,
      ],
    },
    {
      heading: "최종 점검표로 마무리한다",
      paragraphs: [
        `출처, 기준일, 핵심 조건, 비용, 위험, 다음 행동을 한 화면에서 확인한다.`,
        `글을 게시하기 전 제목과 본문이 같은 내용을 말하는지, 과장 표현과 근거 없는 수치가 없는지 검수한다.`,
      ],
    },
  ];
}

function categorySections(category, context) {
  if (category === "취업·면접" || category === "공공기관·NCS") return employmentSections(context);
  if (category === "부동산·분양") return realEstateSections(context);
  if (category === "연구·논문") return researchSections(context);
  if (category === "교육·강의") return educationSections(context);
  return generalSections(context);
}

export function createKeywordDraft(input = {}) {
  const keyword = normalizeText(input.primaryKeyword).split("\n")[0];
  if (!keyword) return { ...input, draft: "", generatedFromKeyword: false };

  const category = inferBlogCategory(input);
  const topic = normalizeText(input.topic) || `${keyword} 핵심 정보와 실전 활용 방법`;
  const audience = normalizeText(input.audience) || defaultAudience(category);
  const cta = normalizeText(input.cta) || defaultCallToAction(category);
  const notes = normalizeText(input.draft);
  const sources = parseSources(input.sources);
  const supportingKeywords = parseKeywords("", input.secondaryKeywords);
  const targetLength = Number(input.targetLength) || 1800;
  const sectionLimit = targetLength <= 1200 ? 4 : targetLength <= 1800 ? 6 : targetLength <= 2600 ? 7 : 8;
  const context = { keyword, topic, audience, supportingKeywords };
  const categoryDraftSections = categorySections(category, context);
  const requiredSections = [];

  if (notes) {
    requiredSections.push({
      heading: "입력 자료에서 확인한 핵심",
      paragraphs: [
        notes,
        "위 내용은 입력한 메모를 그대로 보존한 부분이다. 게시 전 원문과 대조하고 사실, 해석, 의견을 구분해 최종 문장에 반영한다.",
      ],
    });
  }

  const verificationSection = {
    heading: "근거와 출처를 관리한다",
    paragraphs: [
      sources.length
        ? `현재 입력한 확인 자료는 ${sources.length}개다. 각 주장과 출처가 실제로 연결되는지 확인하고 기준일이 있는 정보는 날짜를 함께 표시한다.`
        : "수치, 날짜, 규정, 가격, 채용조건처럼 바뀌거나 검증이 필요한 내용은 공식 출처를 추가한 뒤 게시한다.",
      supportingKeywords.length
        ? `보조 키워드인 ${supportingKeywords.join(", ")}은 독자의 질문에 답하는 범위에서만 사용한다. 같은 표현을 반복하기보다 관련 문단의 의미에 맞게 배치한다.`
        : "보조 키워드는 실제 본문 내용과 관련된 표현만 추가하고 검색 노출을 위해 무관한 단어를 반복하지 않는다.",
    ],
  };

  const finalCheckSection = {
    heading: "게시 전 마지막으로 확인한다",
    paragraphs: [
      "제목, 도입부, 소제목과 결론이 같은 질문에 답하는지 순서대로 읽는다. 긴 문단은 모바일에서 읽기 쉬운 길이로 나누고 중복 문장과 불필요한 외래어를 줄인다.",
      "확인되지 않은 후기, 순위, 보장 표현을 삭제하고 광고나 이해관계가 있다면 독자가 알아볼 수 있게 표시한다. 최종 공개 범위와 내용은 네이버 편집기에서 직접 확인한다.",
    ],
  };

  const categoryCount = Math.max(1, sectionLimit - requiredSections.length - 2);
  const selectedSections = [
    ...requiredSections,
    ...categoryDraftSections.slice(0, categoryCount),
    verificationSection,
    finalCheckSection,
  ];
  const intro = `${keyword}을 찾는 독자는 단순한 소개보다 무엇을 먼저 확인하고 어떻게 판단해야 하는지를 알고 싶어 한다. 이 글은 ${audience}의 관점에서 ${topic}을 단계별로 정리한다. 입력한 메모와 출처를 우선 사용하며 확인되지 않은 수치, 일정, 후기와 성과는 새로 만들지 않는다.`;
  const draft = [
    intro,
    ...selectedSections.flatMap((section) => [
      `# ${section.heading}`,
      ...section.paragraphs,
    ]),
  ].join("\n\n");

  return {
    ...input,
    compositionMode: "generate",
    topic,
    category,
    audience,
    cta,
    draft,
    generatedFromKeyword: true,
  };
}

export function segmentDraft(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) return { intro: "", sections: [] };

  const paragraphs = normalized.split(/\n\s*\n/u).map((part) => part.trim()).filter(Boolean);
  const introParts = [];
  const sections = [];
  let active = null;

  for (const paragraph of paragraphs) {
    const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const looksLikeHeading = lines.length === 1 && HEADING_PATTERN.test(first);

    if (looksLikeHeading) {
      active = {
        heading: cleanHeading(first),
        paragraphs: [],
      };
      sections.push(active);
      continue;
    }

    if (active) active.paragraphs.push(paragraph);
    else introParts.push(paragraph);
  }

  if (sections.length === 0) {
    const intro = paragraphs.shift() ?? "";
    const grouped = [];
    for (let index = 0; index < paragraphs.length; index += 2) {
      grouped.push({
        heading: `핵심 내용 ${Math.floor(index / 2) + 1}`,
        paragraphs: paragraphs.slice(index, index + 2),
      });
    }
    return { intro, sections: grouped };
  }

  return {
    intro: introParts.join("\n\n"),
    sections,
  };
}

function cleanHeading(value) {
  return value
    .replace(/^#{1,3}\s+/u, "")
    .replace(/^(?:\d{1,2}[.)]|[①-⑳])\s*/u, "")
    .trim();
}

function createTitle({ title, topic, primaryKeyword }) {
  const explicit = normalizeText(title);
  if (explicit) return explicit.split("\n")[0];

  const safeTopic = normalizeText(topic).split("\n")[0];
  const safeKeyword = normalizeText(primaryKeyword).split("\n")[0];
  if (safeTopic && safeKeyword && !safeTopic.includes(safeKeyword)) {
    return `${safeKeyword}｜${safeTopic}`;
  }
  return safeTopic || safeKeyword || "제목을 입력하세요";
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase("ko-KR");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function generateTitleCandidates(input = {}) {
  const explicit = normalizeText(input.title).split("\n")[0];
  const topic = normalizeText(input.topic).split("\n")[0];
  const keyword = normalizeText(input.primaryKeyword).split("\n")[0];
  const audience = normalizeText(input.audience).split("\n")[0];
  const combined = topic && keyword && !topic.includes(keyword) ? `${keyword}｜${topic}` : topic || keyword;

  return uniqueStrings([
    explicit,
    combined,
    topic && keyword ? `${topic}｜${keyword} 핵심 정리` : "",
    keyword && audience ? `${keyword}：${audience}가 확인할 내용` : "",
    combined ? `${combined} 핵심 체크리스트` : "",
    combined ? `${combined} 확인 가이드` : "",
  ]).slice(0, 3);
}

function createMetaDescription(intro, sections) {
  const candidate = normalizeText(intro) || normalizeText(sections.flatMap((section) => section.paragraphs).join(" "));
  if (!candidate) return "";
  return candidate.length > 150 ? `${candidate.slice(0, 147).trim()}…` : candidate;
}

export function buildArticle(input = {}) {
  const title = createTitle(input);
  const { intro, sections } = segmentDraft(input.draft);
  const sources = parseSources(input.sources);
  const tags = parseKeywords(input.primaryKeyword, input.secondaryKeywords);
  const cta = normalizeText(input.cta);
  const category = normalizeText(input.category);
  const audience = normalizeText(input.audience);
  const author = normalizeText(input.author);
  const metaDescription = createMetaDescription(intro, sections);

  const bodyParts = [];
  if (intro) bodyParts.push(intro);
  if (sections.length) {
    bodyParts.push(`## 이 글에서 확인할 내용\n${sections.map((section, index) => `${index + 1}. ${section.heading}`).join("\n")}`);
  }
  for (const section of sections) {
    bodyParts.push(`## ${section.heading}`);
    if (section.paragraphs.length) bodyParts.push(section.paragraphs.join("\n\n"));
  }
  if (cta) bodyParts.push(`## 다음 행동\n${cta}`);
  if (sources.length) bodyParts.push(`## 참고자료\n${sources.map((source) => `- ${source.label}`).join("\n")}`);

  const body = bodyParts.join("\n\n").trim();
  const tagLine = tags.map((tag) => `#${tag.replace(/\s+/gu, "")}`).join(" ");
  const fullText = [title, body, tagLine].filter(Boolean).join("\n\n");

  return {
    title,
    topic: normalizeText(input.topic) || normalizeText(input.primaryKeyword),
    category,
    audience,
    author,
    primaryKeyword: normalizeText(input.primaryKeyword),
    secondaryKeywords: parseKeywords("", input.secondaryKeywords),
    intro,
    sections,
    sources,
    cta,
    tags,
    tagLine,
    metaDescription,
    generationMode: input.compositionMode === "generate" ? "keyword" : "restructure",
    body,
    fullText,
    createdAt: new Date().toISOString(),
    contentPolicy: { ...SAFETY_BOUNDARY },
  };
}

export function createTableOfContents(article) {
  return article.sections.map((section, index) => ({
    index: index + 1,
    label: section.heading,
    anchor: `section-${index + 1}`,
  }));
}

export function createImagePlan(article, requestedCount = 4) {
  const count = Math.min(10, Math.max(1, Number(requestedCount) || 4));
  const topic = article.primaryKeyword || article.topic || article.title;
  const plans = [
    {
      id: "image-hero",
      order: 1,
      placement: "제목 아래",
      purpose: "대표 이미지",
      section: article.title,
      altText: `${topic} 관련 대표 이미지`,
      brief: `${article.title}의 주제를 한눈에 이해하도록 돕는 정보 중심 이미지. 이미지 안에는 글자, 로고, 확인되지 않은 수치나 인물을 넣지 않는다.`,
    },
  ];

  const fallbackSections = article.sections.length
    ? article.sections
    : [{ heading: "핵심 내용", paragraphs: [article.intro] }];

  for (let index = 1; index < count; index += 1) {
    const section = fallbackSections[(index - 1) % fallbackSections.length];
    plans.push({
      id: `image-${index + 1}`,
      order: index + 1,
      placement: `‘${section.heading}’ 소제목 뒤`,
      purpose: "본문 보조 이미지",
      section: section.heading,
      altText: `${topic} - ${section.heading} 설명 이미지`,
      brief: `‘${section.heading}’ 내용을 시각적으로 보조하는 사실 기반 도식 또는 현장 이미지. 원문에 없는 통계, 상표, 인물, 결과를 추가하지 않는다.`,
    });
  }

  return plans;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const source = haystack.toLocaleLowerCase("ko-KR");
  const target = needle.toLocaleLowerCase("ko-KR");
  let count = 0;
  let position = 0;
  while ((position = source.indexOf(target, position)) !== -1) {
    count += 1;
    position += target.length || 1;
  }
  return count;
}

function extractDuplicateSentences(text) {
  const sentences = normalizeText(text)
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((sentence) => sentence.replace(/\s+/gu, " ").trim())
    .filter((sentence) => sentence.length >= 22 && !BULLET_PATTERN.test(sentence));
  const seen = new Map();
  for (const sentence of sentences) {
    const key = sentence.toLocaleLowerCase("ko-KR");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([sentence]) => sentence);
}

export function auditArticle(article, options = {}) {
  const targetLength = Number(options.targetLength) || 1500;
  const textLength = article.body.replace(/\s+/gu, "").length;
  const keywordCount = countOccurrences(article.fullText, article.primaryKeyword);
  const riskyClaims = [...new Set(article.fullText.match(RISKY_CLAIM_PATTERN) ?? [])];
  const longParagraphs = normalizeText(article.body)
    .split(/\n\s*\n/u)
    .filter((paragraph) => !paragraph.startsWith("## ") && paragraph.length > 420);
  const duplicateSentences = extractDuplicateSentences(article.body);
  const checks = [
    {
      id: "title",
      label: "제목 길이",
      status: article.title.length >= 12 && article.title.length <= 48 ? "pass" : "warn",
      detail: `${article.title.length}자 · 내부 권장 범위 12~48자`,
    },
    {
      id: "length",
      label: "본문 분량",
      status: textLength >= Math.round(targetLength * 0.75) ? "pass" : "warn",
      detail: `공백 제외 ${textLength.toLocaleString("ko-KR")}자 · 목표 ${targetLength.toLocaleString("ko-KR")}자`,
    },
    {
      id: "keyword",
      label: "대표 키워드",
      status: !article.primaryKeyword || (keywordCount >= 1 && keywordCount <= Math.max(6, Math.ceil(textLength / 500))) ? "pass" : "warn",
      detail: article.primaryKeyword ? `${keywordCount}회 사용 · 반복보다 문맥 적합성을 우선` : "대표 키워드가 비어 있음",
    },
    {
      id: "sections",
      label: "소제목 구조",
      status: article.sections.length >= 2 ? "pass" : "warn",
      detail: `${article.sections.length}개 소제목`,
    },
    {
      id: "sources",
      label: "근거 자료",
      status: article.sources.length > 0 ? "pass" : "warn",
      detail: article.sources.length ? `${article.sources.length}개 출처 기록` : "사실·수치가 있다면 공식 출처를 추가해야 함",
    },
    {
      id: "claims",
      label: "과장·보장 표현",
      status: riskyClaims.length === 0 ? "pass" : "warn",
      detail: riskyClaims.length ? `재검토: ${riskyClaims.join(", ")}` : "탐지된 고위험 표현 없음",
    },
    {
      id: "paragraphs",
      label: "모바일 문단",
      status: longParagraphs.length === 0 ? "pass" : "warn",
      detail: longParagraphs.length ? `420자를 넘는 문단 ${longParagraphs.length}개` : "긴 문단 없음",
    },
    {
      id: "duplicates",
      label: "문장 중복",
      status: duplicateSentences.length === 0 ? "pass" : "warn",
      detail: duplicateSentences.length ? `중복 의심 문장 ${duplicateSentences.length}개` : "긴 문장의 반복 없음",
    },
  ];

  const passed = checks.filter((check) => check.status === "pass").length;
  return {
    score: Math.round((passed / checks.length) * 100),
    checks,
    riskyClaims,
    longParagraphs,
    duplicateSentences,
    metrics: {
      textLength,
      keywordCount,
      sourceCount: article.sources.length,
      sectionCount: article.sections.length,
    },
  };
}

export function articleToMarkdown(article) {
  return [
    `# ${article.title}`,
    article.metaDescription ? `> ${article.metaDescription}` : "",
    article.body,
    article.tagLine,
  ].filter(Boolean).join("\n\n");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraphToHtml(paragraph) {
  const lines = paragraph.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length && lines.every((line) => BULLET_PATTERN.test(line))) {
    return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(BULLET_PATTERN, ""))}</li>`).join("")}</ul>`;
  }
  return `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`;
}

export function articleToRichHtml(article) {
  const toc = createTableOfContents(article);
  const sections = article.sections.map((section, index) => [
    `<h2 id="${toc[index].anchor}">${escapeHtml(section.heading)}</h2>`,
    ...section.paragraphs.map(paragraphToHtml),
  ].join(""));

  return [
    `<article data-source="jobandkill-naver-blog-studio">`,
    `<h1>${escapeHtml(article.title)}</h1>`,
    article.intro ? paragraphToHtml(article.intro) : "",
    toc.length ? `<h2>이 글에서 확인할 내용</h2><ol>${toc.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ol>` : "",
    ...sections,
    article.cta ? `<h2>다음 행동</h2>${paragraphToHtml(article.cta)}` : "",
    article.sources.length ? `<h2>참고자료</h2><ol>${article.sources.map((source) => `<li>${escapeHtml(source.label)}</li>`).join("")}</ol>` : "",
    article.tagLine ? `<p>${escapeHtml(article.tagLine)}</p>` : "",
    `</article>`,
  ].filter(Boolean).join("");
}

export function createPublishPackage(article, input = {}) {
  const images = createImagePlan(article, input.imageCount);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    title: article.title,
    metaDescription: article.metaDescription,
    plainText: article.fullText,
    markdown: articleToMarkdown(article),
    richHtml: articleToRichHtml(article),
    tags: article.tags,
    sources: article.sources,
    tableOfContents: createTableOfContents(article),
    images,
    finalAction: "사용자가 네이버 편집기에서 내용과 공개 범위를 확인한 뒤 직접 발행",
    contentPolicy: { ...SAFETY_BOUNDARY },
  };
}

export function createQueueRecord(article, input = {}, now = new Date()) {
  const scheduledAt = normalizeText(input.scheduledAt);
  return {
    id: input.id || `post-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: article.title,
    topic: article.topic,
    status: POST_STATUSES[input.status] ? input.status : "review",
    scheduledAt,
    createdAt: input.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
    package: createPublishPackage(article, input),
  };
}

export function createCopyBlocks(article) {
  const sectionBlocks = article.sections.map((section, index) => ({
    id: `section-${index + 1}`,
    type: "section",
    label: section.heading,
    text: [`${section.heading}`, section.paragraphs.join("\n\n")].filter(Boolean).join("\n\n"),
  }));

  return [
    { id: "title", type: "title", label: "제목", shortcut: "Alt+1", text: article.title },
    { id: "intro", type: "intro", label: "도입부", shortcut: "Alt+2", text: article.intro },
    ...sectionBlocks,
    { id: "body", type: "body", label: "본문 전체", shortcut: "Alt+4", text: article.body },
    { id: "tags", type: "tags", label: "태그", shortcut: "Alt+5", text: article.tagLine },
    { id: "sources", type: "sources", label: "참고자료", shortcut: "Alt+6", text: article.sources.map((source) => source.label).join("\n") },
  ].filter((block) => block.text);
}
