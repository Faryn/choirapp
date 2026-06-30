const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('web/vendor/choir/pdf-viewer.js', 'utf8');

function createElement(tagName) {
  return {
    tagName,
    className: '',
    textContent: '',
    children: [],
    style: {},
    width: 0,
    height: 0,
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    getContext() {
      return {};
    },
  };
}

function loadViewer(fakePdfDocument) {
  const window = { devicePixelRatio: 2 };
  const document = { createElement };
  const context = {
    window,
    document,
    console,
    Object,
    Math,
  };
  window.window = window;
  vm.createContext(context);
  vm.runInContext(code, context);
  context.window.ChoirPdfViewer.configure({
    pdfJsLoader: async () => ({
      GlobalWorkerOptions: {},
      getDocument: (params) => {
        context.lastGetDocumentParams = params;
        return { promise: Promise.resolve(fakePdfDocument) };
      },
    }),
  });
  return { viewer: context.window.ChoirPdfViewer, context };
}

function fakePdfDocument(pageCount = 2) {
  const calls = [];
  return {
    calls,
    numPages: pageCount,
    async getPage(pageNo) {
      calls.push(pageNo);
      return {
        getViewport({ scale }) {
          return { width: 100 * scale, height: 200 * scale };
        },
        render() {
          return { promise: Promise.resolve() };
        },
      };
    },
  };
}

(async () => {
  {
    const pdfDocument = fakePdfDocument(1);
    const { viewer } = loadViewer(pdfDocument);
    const container = createElement('div');
    const result = await viewer.renderPage({
      pdfDocument,
      pageNo: 99,
      container,
      viewer: { clientWidth: 432 },
      minWidth: 300,
      padding: 32,
    });
    assert.equal(result.pageNo, 1);
    assert.equal(result.width, 400);
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].className, 'score-page');
    assert.equal(container.children[0].style.width, '400px');
    assert.deepEqual(pdfDocument.calls, [1]);
  }

  {
    const pdfDocument = fakePdfDocument(2);
    const { viewer, context } = loadViewer(pdfDocument);
    const container = createElement('div');
    const rendered = [];
    const result = await viewer.renderAllPages({
      url: '/score.pdf',
      dataLoader: async (url) => {
        assert.equal(url, '/score.pdf');
        return new Uint8Array([1, 2, 3]);
      },
      container,
      viewer: { clientWidth: 500 },
      isCurrent: () => true,
      onPageRendered: ({ pageNo }) => rendered.push(pageNo),
    });
    assert.equal(result.pageCount, 2);
    assert.deepEqual(rendered, [1, 2]);
    assert.deepEqual(pdfDocument.calls, [1, 2]);
    assert.deepEqual(Array.from(context.lastGetDocumentParams.data), [1, 2, 3]);
  }

  {
    const pdfDocument = fakePdfDocument(1);
    const { viewer } = loadViewer(pdfDocument);
    const container = createElement('div');
    const result = await viewer.renderAllPages({
      url: '/stale.pdf',
      container,
      viewer: { clientWidth: 500 },
      isCurrent: () => false,
    });
    assert.equal(result, null);
    assert.deepEqual(pdfDocument.calls, []);
  }

  console.log('pdf-viewer tests ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
