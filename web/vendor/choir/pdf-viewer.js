(function () {
  let pdfjsPromise = null;
  let pdfJsLoader = null;

  function configure(options = {}) {
    pdfJsLoader = options.pdfJsLoader || pdfJsLoader;
    if (options.pdfJsLoader) pdfjsPromise = null;
  }

  async function loadPdfJs() {
    if (!pdfjsPromise) {
      const loader = pdfJsLoader || (() => import('../pdfjs/pdf.min.mjs').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = './vendor/pdfjs/pdf.worker.min.mjs';
        return pdfjs;
      }));
      pdfjsPromise = loader();
    }
    return pdfjsPromise;
  }

  function showMessage(container, message, className = 'message') {
    container.innerHTML = '';
    const div = document.createElement('div');
    div.className = className;
    div.textContent = message;
    container.appendChild(div);
  }

  async function loadDocument(source) {
    const pdfjs = await loadPdfJs();
    const params = source.data ? { data: source.data } : { url: source.url };
    return pdfjs.getDocument(params).promise;
  }

  function availableWidth(viewer, { minWidth = 280, padding = 20 } = {}) {
    return Math.max(minWidth, viewer.clientWidth - padding);
  }

  async function renderPage({
    pdfDocument,
    pageNo,
    container,
    viewer,
    minWidth = 280,
    padding = 20,
    canvasClass = 'score-page',
    clear = true,
    isCurrent = () => true,
  }) {
    const safePageNo = Math.max(1, Math.min(pageNo, pdfDocument.numPages));
    const page = await pdfDocument.getPage(safePageNo);
    if (!isCurrent()) return null;

    const width = availableWidth(viewer, { minWidth, padding });
    const viewport = page.getViewport({ scale: 1 });
    const cssScale = width / viewport.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderViewport = page.getViewport({ scale: cssScale * dpr });

    const canvas = document.createElement('canvas');
    canvas.className = canvasClass;
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${Math.floor(viewport.width * cssScale)}px`;
    canvas.style.height = `${Math.floor(viewport.height * cssScale)}px`;
    if (clear) container.innerHTML = '';
    container.appendChild(canvas);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise;
    return isCurrent()
      ? { canvas, pageNo: safePageNo, pageCount: pdfDocument.numPages, width }
      : null;
  }

  async function renderAllPages({
    url,
    dataLoader,
    container,
    viewer,
    minWidth = 280,
    padding = 20,
    messageClass = 'message',
    loadingMessage = 'Loading score...',
    errorMessage = 'Could not render the score here.',
    isCurrent = () => true,
    onPageRendered = () => {},
    onComplete = () => {},
    onError = () => {},
  }) {
    showMessage(container, loadingMessage, messageClass);
    try {
      const data = dataLoader ? await dataLoader(url) : null;
      if (!isCurrent()) return null;

      const pdfDocument = await loadDocument(data ? { data } : { url });
      if (!isCurrent()) return null;

      container.innerHTML = '';
      let lastResult = null;
      for (let pageNo = 1; pageNo <= pdfDocument.numPages; pageNo += 1) {
        if (!isCurrent()) return null;
        lastResult = await renderPage({
          pdfDocument,
          pageNo,
          container,
          viewer,
          minWidth,
          padding,
          clear: false,
          isCurrent,
        });
        if (!lastResult) return null;
        onPageRendered(lastResult);
      }
      onComplete({ pdfDocument, pageCount: pdfDocument.numPages, width: lastResult?.width || availableWidth(viewer, { minWidth, padding }) });
      return { pdfDocument, pageCount: pdfDocument.numPages, width: lastResult?.width || 0 };
    } catch (err) {
      console.warn('PDF.js score render failed', err);
      if (isCurrent()) {
        showMessage(container, errorMessage, messageClass);
        onError(err);
      }
      return null;
    }
  }

  window.ChoirPdfViewer = Object.freeze({
    configure,
    loadDocument,
    renderAllPages,
    renderPage,
    showMessage,
  });
})();
