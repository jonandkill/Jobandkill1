const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** PDF.js 6 owns destruction on the loading task, not PDFDocumentProxy. */
export function createPdfLifecycle() {
  let loadingTask, renderTask, disposed = false, cleanup;
  const cancel = task => { try { task?.cancel?.(); } catch { /* A finished rendering task must not block navigation. */ } };
  const release = task => Promise.resolve().then(() => task?.destroy?.()).catch(() => undefined);
  return {
    setLoadingTask(task) { if (disposed) { void release(task); return; } loadingTask = task; },
    setRenderTask(task) { if (disposed) { cancel(task); return; } renderTask = task; },
    cancelRender() { const previous = renderTask; renderTask = null; cancel(previous); },
    destroy() {
      if (disposed) return cleanup;
      disposed = true;
      const previousRender = renderTask, previousLoading = loadingTask;
      renderTask = null; loadingTask = null;
      cancel(previousRender);
      cleanup = release(previousLoading);
      return cleanup;
    }
  };
}

/** Render official PDF bytes through the server's ID allowlist; no remote iframe. */
export async function renderDocument(container, { resourceId, title, initialPage = 1, originalUrl = '' }) {
  const source = `/api/documents/${encodeURIComponent(resourceId)}`;
  const official = /^https:\/\//.test(originalUrl) ? originalUrl : '';
  let pdf, destroyed = false, pageNumber = 1, requestedPage = initialPage, sequence = 0, zoomFactor = 1;
  const lifecycle = createPdfLifecycle();
  container.innerHTML = `<section class="document-reader" aria-label="공식 자료 읽기"><p class="document-status" role="status">공식 PDF를 불러오고 있어요.</p><div class="pagination" aria-label="PDF 페이지"><button type="button" data-prev disabled>← 이전</button><label>쪽 <input data-page type="number" min="1" value="1" aria-label="PDF 페이지 번호" style="width:76px;display:inline-block" disabled></label><span data-total>/ — 쪽</span><button type="button" data-next disabled>다음 →</button></div><div data-canvas-wrap style="max-width:100%;overflow:auto;background:#eee;border:1px solid #dedfd5"><canvas role="img" aria-label="${escape(title)} PDF 본문" style="display:block;max-width:100%;height:auto;margin:auto" hidden></canvas></div><div class="actions"><a class="button" href="${source}?download=1">PDF 내려받기</a>${official ? `<a class="button" href="${escape(official)}" target="_blank" rel="noopener">대학 원본 열기 ↗</a>` : ''}</div></section>`;
  const status = container.querySelector('.document-status'), canvas = container.querySelector('canvas'), input = container.querySelector('[data-page]'), prev = container.querySelector('[data-prev]'), next = container.querySelector('[data-next]');
  const wrap = container.querySelector('[data-canvas-wrap]');
  wrap.style.width = '100%';
  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', 'PDF 본문. 확대하면 이 영역 안에서 좌우로 이동할 수 있습니다.');
  canvas.style.maxWidth = 'none';
  wrap.insertAdjacentHTML('beforebegin', '<div class="document-zoom"><label>보기 크기 <select data-zoom aria-label="PDF 보기 크기" style="width:auto;max-width:100%;display:inline-block" disabled><option value="1">화면 맞춤</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select></label><p class="hint">확대하면 본문 영역을 좌우로 움직여 읽을 수 있습니다.</p></div>');
  const zoom = container.querySelector('[data-zoom]');
  async function show(number) {
    requestedPage = Math.max(1, Number(number) || 1);
    if (!pdf || destroyed) return;
    const ticket = ++sequence;
    lifecycle.cancelRender();
    pageNumber = Math.min(pdf.numPages, requestedPage);
    input.value = pageNumber;
    input.max = pdf.numPages;
    prev.disabled = pageNumber <= 1;
    next.disabled = pageNumber >= pdf.numPages;
    status.textContent = `${pageNumber} / ${pdf.numPages}쪽을 표시하고 있어요.`;
    try {
      const page = await pdf.getPage(pageNumber);
      if (destroyed || ticket !== sequence) return;
      const plain = page.getViewport({ scale: 1 });
      const width = Math.max(1, Math.min(1100, (wrap.clientWidth || container.clientWidth || 240) - 2)) * zoomFactor;
      const density = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: width / plain.width * density });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.hidden = false;
      canvas.setAttribute('aria-label', `${title}, ${pageNumber} / ${pdf.numPages}쪽. 원본 PDF 내려받기로 텍스트를 읽을 수 있습니다.`);
      const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      lifecycle.setRenderTask(task);
      await task.promise;
      if (!destroyed && ticket === sequence) status.textContent = `${pageNumber} / ${pdf.numPages}쪽`;
    } catch (error) {
      if (!destroyed && ticket === sequence && error?.name !== 'RenderingCancelledException') {
        canvas.hidden = true;
        status.textContent = '이 쪽을 표시하지 못했습니다. PDF 내려받기 또는 대학 원본 열기를 이용해 주세요.';
      }
    }
  }
  input.onchange = () => show(input.value);
  input.onkeydown = event => { if (event.key === 'Enter') show(input.value); };
  prev.onclick = () => show(pageNumber - 1);
  next.onclick = () => show(pageNumber + 1);
  zoom.onchange = () => { zoomFactor = [1, 1.25, 1.5, 2].includes(Number(zoom.value)) ? Number(zoom.value) : 1; show(pageNumber); };
  const control = { goTo: show, destroy() { if (!destroyed) { destroyed = true; sequence++; pdf = null; } return lifecycle.destroy(); } };
  try {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    const loadingTask = pdfjs.getDocument({ url: source, isEvalSupported: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/' });
    lifecycle.setLoadingTask(loadingTask);
    const loaded = await loadingTask.promise;
    if (destroyed || !container.isConnected) { void control.destroy(); return control; }
    pdf = loaded;
    input.disabled = false;
    zoom.disabled = false;
    container.querySelector('[data-total]').textContent = `/ ${pdf.numPages} 쪽`;
    await show(requestedPage);
  } catch {
    if (!destroyed && container.isConnected) {
      status.innerHTML = '이 자료의 본문을 현재 불러오지 못했습니다. 아래 <strong>대학 원본 열기</strong>를 이용하거나 다른 자료를 선택해 주세요. 빈 화면을 정상 열람으로 처리하지 않습니다.';
      container.querySelector('[data-canvas-wrap]').hidden = true;
      container.querySelector('.pagination').hidden = true;
      container.querySelector('.document-zoom').hidden = true;
    }
  }
  return control;
}
