const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderHome(root, profile = {}, onStart, context = {}) {
  const average = Number(profile.average);
  const hasGrade = Number.isFinite(average) && average >= 1 && average <= Number(profile.scale || 9);
  const savedCount = Math.max(0, Number(context.savedCount) || 0);
  const universityCount = Number(context.universityCount);
  const countLabel = Number.isInteger(universityCount) && universityCount > 0 ? `${universityCount.toLocaleString()}개 대학 탐색` : '전국 대학 탐색';
  const gradeLabel = hasGrade ? `${escape(profile.average)}등급` : '평균 내신부터';
  const nextTitle = hasGrade ? '입력한 성적과 대학을 함께 살펴보세요.' : '성적 한 줄로, 나에게 맞는 다음 단계.';
  const nextDescription = hasGrade
    ? `${escape(profile.scale || 9)}등급제 · 평균 ${gradeLabel}. 세부 성적을 더하면 대학별 반영 방식에 맞춰 비교할 수 있는 범위를 넓힐 수 있어요.`
    : '예를 들어 2.3등급만 입력해도 시작할 수 있어요. 학교를 먼저 둘러보거나, 필요한 성적만 추가해도 괜찮아요.';

  root.innerHTML = `
    <section class="landing-hero lifecycle-hero" aria-labelledby="home-title">
      <div class="hero-story">
        <p class="eyebrow">잡앤킬 진학설계</p>
        <h1 id="home-title">오늘의 준비가,<br>다음 선택이 되도록.</h1>
        <p class="hero-lead">대학을 찾는 순간부터<br>논술과 면접을 준비하는 날까지.</p>
        <div class="actions home-primary-actions">
          ${hasGrade ? '<a class="button primary" href="#recommend">내 성적으로 대학 살펴보기 →</a>' : '<button id="home-start" class="primary">평균 내신 입력하고 시작 →</button>'}
          <a class="button" href="#find">${countLabel}</a>
        </div>
        <p class="hint">소수점 내신 입력 · 세부 성적은 선택 · 과거 입결과 비교</p>
      </div>
      <div class="motion-scene lifecycle-scene" aria-label="대학 탐색에서 실전 연습으로 이어지는 준비 과정을 나타낸 그래픽">
        <div class="scene-orbit" aria-hidden="true"></div>
        <p class="scene-label">차근차근, 나의 입시</p>
        <div class="scene-sheet sheet-one"><span>내 성적 정리</span><strong>선택의 출발점</strong><div class="grade-sample">${hasGrade ? escape(profile.average) : '2.3'} <small>등급 · ${hasGrade ? '내 입력값' : '입력 예시'}</small></div><p>필요한 성적만 하나씩.</p></div>
        <div class="scene-sheet sheet-two"><span>오늘의 작은 준비</span><strong>한 문제를 풀고,<br>한 답변을 다듬고.</strong><p>비교에서 끝나지 않는 진학 준비</p></div>
        <div class="scene-footer">탐색 → 비교 → 실전 연습</div>
      </div>
      <button id="motion-toggle" class="motion-toggle" aria-pressed="false">움직임 멈추기</button>
    </section>

    <section class="home-resume" aria-labelledby="home-next-title">
      <div class="home-resume-copy"><p class="eyebrow">${hasGrade ? '이어서 준비하기' : '처음이라면 여기부터'}</p><h2 id="home-next-title">${nextTitle}</h2><p>${nextDescription}</p></div>
      <div class="home-resume-actions"><a class="button primary" href="#recommend">${hasGrade ? '입결 비교·세부 성적 추가' : '성적 입력·평균 계산'}</a><a href="#saved">내 지원 후보 ${savedCount}개 보기 →</a></div>
    </section>

    <section class="home-section lifecycle-section" aria-labelledby="journey-title">
      <div class="section-head"><div><p class="eyebrow">나의 입시 준비 순서</p><h2 id="journey-title">지금 필요한 단계로 바로 가세요.</h2></div><p class="muted">순서에 얽매이지 않고 언제든 돌아올 수 있어요.</p></div>
      <ol class="lifecycle-list">
        <li><a href="#find"><span class="lifecycle-number" aria-hidden="true">01</span><div><h3>대학·학과 탐색</h3><p>지역과 관심 학과로 찾아보고, 학교의 지원 정보를 읽어요.</p></div><span class="lifecycle-state">${countLabel} <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#recommend"><span class="lifecycle-number" aria-hidden="true">02</span><div><h3>성적 정리·입결 비교</h3><p>평균을 계산하고, 같은 전형의 과거 입결을 비교해요.</p></div><span class="lifecycle-state">${hasGrade ? gradeLabel + ' 입력됨' : '성적 입력 가능'} <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#saved"><span class="lifecycle-number" aria-hidden="true">03</span><div><h3>지원 후보 좁히기</h3><p>담아 둔 대학의 전형, 일정, 준비 조건을 나란히 살펴봐요.</p></div><span class="lifecycle-state">후보 ${savedCount}개 <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#prepare/essay"><span class="lifecycle-number" aria-hidden="true">04</span><div><h3>논술·면접 실전 연습</h3><p>문제를 풀고 답변을 쓰면서, 보완할 근거를 찾아요.</p></div><span class="lifecycle-state">연습 시작 <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#prepare/plan"><span class="lifecycle-number" aria-hidden="true">05</span><div><h3>지원 전 마지막 점검</h3><p>모집요강, 제출서류, 접수·고사 일정을 다시 확인해요.</p></div><span class="lifecycle-state">준비 목록 확인 <b aria-hidden="true">↗</b></span></a></li>
      </ol>
    </section>

    <section class="home-practice" aria-labelledby="practice-title">
      <div><p class="eyebrow">반복할수록 구체적으로</p><h2 id="practice-title">오늘 연습할 한 가지를 골라보세요.</h2><p class="muted">읽기만 했던 문제를 직접 풀고,<br>생각해 둔 답변을 나의 말로 작성해 보세요.</p></div>
      <div class="home-practice-links"><a href="#prepare/writing"><strong>자기소개서 작성</strong><span>내 경험 작성 → 글 보완 → 면접 질문으로 연결</span><b aria-hidden="true">↗</b></a><a href="#prepare/essay"><strong>논술 문제 풀기</strong><span>문제 선택 → 시간 확인 → 답안 작성 → 피드백</span><b aria-hidden="true">↗</b></a><a href="#prepare/interview"><strong>면접 답변 연습</strong><span>학교·학과 선택 → 질문 확인 → 답변 보완</span><b aria-hidden="true">↗</b></a><a href="#prepare/exams"><strong>공식 논술 자료 찾기</strong><span>학교·연도·계열별 자료와 원문 확인</span><b aria-hidden="true">↗</b></a></div>
    </section>
    <section class="home-note"><h2>선택의 근거를 함께 확인하세요.</h2><p>과거 입결은 올해의 합격을 보장하지 않으며 실제 결과와 다를 수 있습니다. 대학별 성적 반영 방식과 전형 변경을 함께 확인하고, 공식 자료와 자체 연습 피드백을 구분해 안내합니다.</p><a href="#history">연도별 입결 자료 살펴보기 →</a></section>`;

  const start = root.querySelector('#home-start');
  if (start) start.onclick = onStart;
  const scene = root.querySelector('.motion-scene');
  const button = root.querySelector('#motion-toggle');
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const set = () => {
    scene.classList.toggle('paused', paused);
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? '움직임 재생' : '움직임 멈추기';
  };
  set();
  button.onclick = () => { paused = !paused; set(); };
}
