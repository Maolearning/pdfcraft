# Selectable PDF Text Editing

## Scope

The Edit PDF page supports local replacement and permanent deletion of selectable PDF text. The current implementation intentionally edits one rendered text line per queued item.

User flow:

1. Upload a PDF in the Edit PDF tool.
2. Click a selectable text line to open the editor beside that line. Drag-selection plus `读取拖选文字` remains available as a fallback.
3. Enter the replacement and click `暂存修改`, or click `删除文字`.
4. Continue clicking and editing as many other lines as needed.
5. Click `保存并下载（N 处）` once to write every queued change and download the PDF.

The edited PDF is downloaded and immediately reloaded into the editor so the result can be reviewed before adding ordinary annotations.

## Architecture

- `EditPDFTool.tsx` reads the PDF.js text layer, records the page, normalized rectangle, original text, font size, family, style, weight, and color, and maintains the edit queue.
- Clicking a rendered text span opens an in-view editor inside the PDF iframe. It updates the text-layer preview immediately while keeping the original PDF unchanged until the final save.
- Native `selectionchange` is preferred. A `pointerup` fallback captures the complete PDF.js text span because the bundled annotation viewer can suppress native selection in some browsers.
- `pymupdf-loader.ts` sends the PDF and edit list to PyMuPDF WASM in Pyodide.
- Exact text search is matched to the recorded visual anchor. If exact search fails, the visual rectangle is used and a warning is returned.
- Redactions are applied once per page with images and vector graphics preserved. Replacement text is inserted afterward.
- Base-14 fonts are used for Latin text. `public/fonts/NotoSansSC-Regular.ttf` is used for CJK replacement text when available.
- Files stay in the browser; the feature does not require a backend upload.
- The local Pyodide/PyMuPDF engine starts warming in browser idle time after a PDF is opened. Its first load downloads the site's relatively large WASM and wheel assets; the singleton is reused for later saves in the same page session.
- Text deletion uses a full rewrite instead of an incremental save so removed text is not retained in an earlier PDF revision. The writer keeps content-stream cleaning disabled and enables object-stream, ordinary-stream, image, and font compression to limit lossless size growth. Highly optimized source PDFs can still change size after a secure rewrite.

## Current limitations

- One rendered line per queued edit. Multiline paragraph reflow is not attempted.
- The replacement is shrink-to-fit inside the original line rectangle; it does not move neighboring content.
- Complex typography, kerning, ligatures, vertical writing, rotated text, and uncommon embedded fonts may not be reproduced exactly.
- Scanned or image-only PDFs require OCR before this tool can identify text.
- Apply original-text edits before adding ordinary annotations, because the edited PDF is regenerated and reloaded.

## Maintenance and release checks

Run:

```bash
npm test -- --run src/__tests__/components/tools/EditPDFTool.test.tsx
npm run build
```

For a browser smoke test:

1. Upload a PDF containing at least three selectable text lines.
2. Replace the first line and verify it appears in the reloaded PDF.
3. Verify the untouched lines still extract and render correctly.
4. Repeat with an empty replacement to confirm permanent deletion.
5. Test a CJK replacement and confirm the Noto Sans SC asset loads without a network or console error.
6. Confirm the downloaded filename ends in `_文字已编辑.pdf`.

Production is deployed from the `main` branch to Vercel. After pushing, verify `https://pdf.081400.xyz/zh/tools/edit-pdf/`, including the first-load PyMuPDF WASM path and the final download.

The editor iframe uses `/pdfjs-annotation-viewer/web/pdfcraft-viewer/`. `scripts/ensure-pdfjs-viewer-js.js` generates that route's `index.html` and injects a relative base URL so the viewer's scripts, styles, locale files, and extension assets still resolve from the original `web/` directory. The dedicated route name must not be changed back to `viewer/`: Vercel gives the tracked `viewer.html` clean route priority over a same-named generated directory, which removes the injected base and breaks relative assets.
