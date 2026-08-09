# Selectable PDF Text Editing

## Scope

The Edit PDF page supports local replacement and permanent deletion of selectable PDF text. The current implementation intentionally edits one rendered text line per queued item.

User flow:

1. Upload a PDF in the Edit PDF tool.
2. Select a text line, or click the line when the embedded viewer does not expose a native browser selection.
3. Click `读取选中文字`.
4. Enter the replacement. Leave it empty to delete the original text.
5. Queue additional lines if needed, then click `应用并下载`.

The edited PDF is downloaded and immediately reloaded into the editor so the result can be reviewed before adding ordinary annotations.

## Architecture

- `EditPDFTool.tsx` reads the PDF.js text layer, records the page, normalized rectangle, original text, font size, family, style, weight, and color, and maintains the edit queue.
- Native `selectionchange` is preferred. A `pointerup` fallback captures the complete PDF.js text span because the bundled annotation viewer can suppress native selection in some browsers.
- `pymupdf-loader.ts` sends the PDF and edit list to PyMuPDF WASM in Pyodide.
- Exact text search is matched to the recorded visual anchor. If exact search fails, the visual rectangle is used and a warning is returned.
- Redactions are applied once per page with images and vector graphics preserved. Replacement text is inserted afterward.
- Base-14 fonts are used for Latin text. `public/fonts/NotoSansSC-Regular.ttf` is used for CJK replacement text when available.
- Files stay in the browser; the feature does not require a backend upload.

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
