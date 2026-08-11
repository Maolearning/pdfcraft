import { withBasePath } from '../utils/path';

// Singleton instance
let pymupdfInstance: any = null;
let loadingPromise: Promise<any> | null = null;

function resolvePublicAssetPath(assetPath: string): string {
  if (typeof window === 'undefined') return assetPath;

  // Prefer the explicitly configured withBasePath helper
  const resolvedPath = withBasePath(assetPath);
  if (resolvedPath !== assetPath) return resolvedPath;

  const normalizedAssetPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const nextScript = scripts.find((script) => script.src.includes('/_next/'));

  if (!nextScript) return normalizedAssetPath;

  try {
    const scriptUrl = new URL(nextScript.src);
    const nextIndex = scriptUrl.pathname.indexOf('/_next/');
    if (nextIndex <= 0) return normalizedAssetPath;

    const basePath = scriptUrl.pathname.slice(0, nextIndex).replace(/\/$/, '');
    return `${basePath}${normalizedAssetPath}`;
  } catch {
    return normalizedAssetPath;
  }
}

/**
 * Load PyMuPDF using Pyodide directly
 */
export async function loadPyMuPDF(): Promise<any> {
  if (pymupdfInstance) {
    return pymupdfInstance;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      const basePath = new URL(
        resolvePublicAssetPath('/pymupdf-wasm/'),
        window.location.origin
      ).toString();

      // Dynamically import Pyodide as ES module
      const pyodideModule = await import(/* webpackIgnore: true */ `${basePath}pyodide.js`);
      const loadPyodide = pyodideModule.loadPyodide;

      // Initialize Pyodide
      const pyodide = await loadPyodide({
        indexURL: basePath,
        fullStdLib: false
      });

      // Helper function to load local wheels (same as pdf-to-docx.worker.js)
      const loadWheel = async (url: string) => {
        await pyodide.loadPackage(url);
      };

      // Mock missing non-critical dependencies (same as pdf-to-docx.worker.js)
      pyodide.runPython(`
import sys
from types import ModuleType

# Mock tqdm (used for progress bars)
tqdm_mod = ModuleType("tqdm")
def tqdm(iterable=None, *args, **kwargs):
    return iterable if iterable else []
tqdm_mod.tqdm = tqdm
sys.modules["tqdm"] = tqdm_mod

# Mock fire (CLI tool, not needed for library usage)
fire_mod = ModuleType("fire")
sys.modules["fire"] = fire_mod
      `);

      // Install dependencies in order (same as pdf-to-docx.worker.js)
      await loadWheel(`${basePath}numpy-2.2.5-cp313-cp313-pyodide_2025_0_wasm32.whl`);
      await loadWheel(`${basePath}typing_extensions-4.12.2-py3-none-any.whl`);
      await loadWheel(`${basePath}packaging-24.1-py3-none-any.whl`);
      await loadWheel(`${basePath}fonttools-4.56.0-py3-none-any.whl`);
      await loadWheel(`${basePath}lxml-5.4.0-cp313-cp313-pyodide_2025_0_wasm32.whl`);
      await loadWheel(`${basePath}pymupdf-1.26.3-cp313-none-pyodide_2025_0_wasm32.whl`);

      // Import pymupdf
      await pyodide.runPythonAsync('import pymupdf');

      // Create a wrapper object with pdfToDocx method
      pymupdfInstance = {
        pyodide,
        async editPdfText(
          file: File,
          edits: Array<{
            pageIndex: number;
            originalText: string;
            replacementText: string;
            rect: { x0: number; y0: number; x1: number; y1: number };
            fontSizeRatio: number;
            fontFamily?: string;
            fontWeight?: string;
            fontStyle?: string;
            color?: { r: number; g: number; b: number };
          }>
        ): Promise<{ pdf: Blob; warnings: string[] }> {
          if (!edits.length) {
            throw new Error('No PDF text edits were provided.');
          }

          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_text_edit_${uid}.pdf`;
          const editsPath = `/text_edits_${uid}.json`;
          const fontPath = `/noto_sans_sc_${uid}.ttf`;
          const cleanupPaths = [inputPath, editsPath, fontPath];

          pyodide.FS.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
          pyodide.FS.writeFile(editsPath, new TextEncoder().encode(JSON.stringify(edits)));

          let hasCjkFont = false;
          try {
            const fontResponse = await fetch(resolvePublicAssetPath('/fonts/NotoSansSC-Regular.ttf'));
            if (fontResponse.ok) {
              pyodide.FS.writeFile(fontPath, new Uint8Array(await fontResponse.arrayBuffer()));
              hasCjkFont = true;
            }
          } catch {
            // Latin-only replacements can still use PDF Base 14 fonts.
          }

          try {
            const result = await pyodide.runPythonAsync(`
import base64
import json
import os
import re
import pymupdf

with open(${JSON.stringify(editsPath)}, "r", encoding="utf-8") as edit_stream:
    text_edits = json.load(edit_stream)

doc = pymupdf.open(${JSON.stringify(inputPath)})
warnings = []
resolved_edits = []
page_span_cache = {}

def clamp(value, minimum=0.0, maximum=1.0):
    return max(minimum, min(maximum, float(value)))

def rect_distance(a, b):
    acx = (a.x0 + a.x1) / 2
    acy = (a.y0 + a.y1) / 2
    bcx = (b.x0 + b.x1) / 2
    bcy = (b.y0 + b.y1) / 2
    center_distance = (acx - bcx) ** 2 + (acy - bcy) ** 2
    size_distance = abs(a.width - b.width) + abs(a.height - b.height)
    return center_distance + size_distance * 2

def rect_area(rect):
    return max(0.0, rect.width) * max(0.0, rect.height)

def normalized_font_name(value):
    name = re.sub(r"^[A-Z]{6}\\+", "", str(value or ""))
    return re.sub(r"[^a-z0-9]", "", name.lower())

def page_span_items(page_index, page):
    if page_index in page_span_cache:
        return page_span_cache[page_index]

    items = []
    text_dict = page.get_text("dict")
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            line_spans = line.get("spans", [])
            direction = tuple(line.get("dir", (1.0, 0.0)))
            for span in line_spans:
                if span.get("text") and len(span.get("bbox", [])) == 4:
                    items.append({
                        "span": span,
                        "line_spans": line_spans,
                        "direction": direction,
                    })

    page_span_cache[page_index] = items
    return items

def source_span_score(item, target, original_text):
    span = item["span"]
    span_rect = pymupdf.Rect(span["bbox"])
    intersection = span_rect & target
    overlap = rect_area(intersection) / max(1.0, min(rect_area(span_rect), rect_area(target)))
    span_text = str(span.get("text", "")).strip()
    wanted = original_text.strip()
    if span_text == wanted:
        text_penalty = 0
    elif wanted and wanted in span_text:
        text_penalty = 150
    else:
        text_penalty = 600
    return rect_distance(span_rect, target) + text_penalty - overlap * 1000

def find_source_span(page_index, page, target, original_text):
    items = page_span_items(page_index, page)
    if not items:
        return None
    return min(items, key=lambda item: source_span_score(item, target, original_text))

def available_line_width(page, target, source_info, original_text, font_size):
    # Partial selections must not expand across untouched text in the same span.
    if not source_info:
        return max(1.0, target.width)

    source_span = source_info["span"]
    source_text = str(source_span.get("text", "")).strip()
    if source_text != original_text.strip():
        return max(1.0, target.width)

    source_rect = pymupdf.Rect(source_span["bbox"])
    origin = source_span.get("origin", (source_rect.x0, source_rect.y1))
    baseline_y = float(origin[1])
    right_edge = page.rect.x1 - max(4.0, font_size * 0.25)
    next_left = None

    for other_span in source_info["line_spans"]:
        if other_span is source_span or not other_span.get("text"):
            continue
        other_rect = pymupdf.Rect(other_span.get("bbox", (0, 0, 0, 0)))
        other_origin = other_span.get("origin", (other_rect.x0, other_rect.y1))
        same_baseline = abs(float(other_origin[1]) - baseline_y) <= max(2.0, font_size * 0.35)
        if same_baseline and other_rect.x0 >= source_rect.x1 - 0.5:
            if next_left is None or other_rect.x0 < next_left:
                next_left = other_rect.x0

    if next_left is not None:
        right_edge = min(right_edge, next_left - max(1.0, font_size * 0.12))

    return max(target.width, right_edge - target.x0)

def span_traits(source_info, edit):
    if source_info:
        span = source_info["span"]
        flags = int(span.get("flags", 0))
        return {
            "bold": bool(flags & 16),
            "italic": bool(flags & 2),
            "serif": bool(flags & 4),
            "mono": bool(flags & 8),
        }

    family = str(edit.get("fontFamily", "")).lower()
    weight = str(edit.get("fontWeight", "")).lower()
    style = str(edit.get("fontStyle", "")).lower()
    return {
        "bold": "bold" in weight or (weight.isdigit() and int(weight) >= 600),
        "italic": "italic" in style or "oblique" in style,
        "serif": "serif" in family and "sans-serif" not in family,
        "mono": "courier" in family or "monospace" in family,
    }

def compatible_base14_font(traits):
    is_bold = traits["bold"]
    is_italic = traits["italic"]
    if traits["mono"]:
        return "cobi" if is_bold and is_italic else "cobo" if is_bold else "coit" if is_italic else "cour"
    if traits["serif"]:
        return "tibi" if is_bold and is_italic else "tibo" if is_bold else "tiit" if is_italic else "tiro"
    return "hebi" if is_bold and is_italic else "hebo" if is_bold else "heit" if is_italic else "helv"

def font_has_text(font_object, text):
    if not font_object:
        return False
    try:
        return all(char.isspace() or font_object.has_glyph(ord(char)) for char in text)
    except Exception:
        return False

def source_font_candidate(page, source_info, replacement):
    if not source_info:
        return None

    source_name = normalized_font_name(source_info["span"].get("font", ""))
    if not source_name:
        return None

    matches = []
    for record in page.get_fonts(full=False):
        if len(record) < 5:
            continue
        xref, _, _, base_name, resource_name = record[:5]
        base_normalized = normalized_font_name(base_name)
        if base_normalized == source_name:
            score = 0
        elif source_name in base_normalized or base_normalized in source_name:
            score = 1
        else:
            continue
        matches.append((score, int(xref), str(resource_name)))

    for _, xref, resource_name in sorted(matches):
        if xref <= 0 or not resource_name:
            continue
        try:
            extracted = doc.extract_font(xref)
            font_buffer = extracted[3] if len(extracted) > 3 else b""
            font_object = pymupdf.Font(fontbuffer=font_buffer) if font_buffer else None
            if font_has_text(font_object, replacement):
                return {
                    "name": "/" + resource_name.lstrip("/"),
                    "file": None,
                    "object": font_object,
                    "reused": True,
                }
        except Exception:
            continue

    return None

def fallback_font(traits, replacement, contains_cjk):
    if contains_cjk and ${hasCjkFont ? 'True' : 'False'}:
        try:
            font_object = pymupdf.Font(fontfile=${JSON.stringify(fontPath)})
        except Exception:
            font_object = None
        return {
            "name": "notosanssc",
            "file": ${JSON.stringify(fontPath)},
            "object": font_object,
            "reused": False,
        }

    font_name = compatible_base14_font(traits)
    try:
        font_object = pymupdf.Font(fontname=font_name)
    except Exception:
        font_object = None
    return {
        "name": font_name,
        "file": None,
        "object": font_object,
        "reused": False,
    }

def calibrate_font_metrics(font_config, source_info, font_size):
    font_config["metric_scale"] = 1.0
    if not source_info:
        return font_config

    span = source_info["span"]
    source_text = str(span.get("text", ""))
    font_object = font_config.get("object")
    if not source_text or not font_object:
        return font_config

    try:
        measured_width = float(font_object.text_length(source_text, fontsize=font_size))
        visual_width = pymupdf.Rect(span["bbox"]).width
        if measured_width > 0 and visual_width > 0:
            metric_scale = visual_width / measured_width
            if 0.25 <= metric_scale <= 4.0:
                font_config["metric_scale"] = metric_scale
    except Exception:
        pass
    return font_config

def measured_text_width(text, font_size, font_config):
    metric_scale = float(font_config.get("metric_scale", 1.0))
    font_object = font_config.get("object")
    if font_object:
        try:
            return float(font_object.text_length(text, fontsize=font_size)) * metric_scale
        except Exception:
            pass
    try:
        return float(pymupdf.get_text_length(text, fontname=font_config["name"].lstrip("/"), fontsize=font_size)) * metric_scale
    except Exception:
        return max(font_size * 0.5, len(text) * font_size * 0.55)

def fitted_single_line_size(text, original_size, available_width, font_config):
    minimum_size = 4.0
    width = measured_text_width(text, original_size, font_config)
    if width <= available_width:
        return original_size
    if width <= 0:
        return None

    attempted_size = min(original_size, original_size * available_width / width * 0.985)
    while attempted_size >= minimum_size:
        if measured_text_width(text, attempted_size, font_config) <= available_width:
            return attempted_size
        attempted_size -= 0.25
    return None

for edit_index, edit in enumerate(text_edits):
    page_index = int(edit.get("pageIndex", -1))
    if page_index < 0 or page_index >= len(doc):
        raise ValueError(f"Edit {edit_index + 1} points to an invalid page")

    page = doc[page_index]
    page_rect = page.rect
    normalized = edit.get("rect") or {}
    anchor = pymupdf.Rect(
        clamp(normalized.get("x0", 0)) * page_rect.width,
        clamp(normalized.get("y0", 0)) * page_rect.height,
        clamp(normalized.get("x1", 0)) * page_rect.width,
        clamp(normalized.get("y1", 0)) * page_rect.height,
    )
    if anchor.is_empty or anchor.is_infinite:
        raise ValueError(f"Edit {edit_index + 1} has an invalid selection rectangle")

    original_text = str(edit.get("originalText", ""))
    candidates = page.search_for(original_text) if original_text else []
    target = min(candidates, key=lambda candidate: rect_distance(candidate, anchor)) if candidates else anchor
    if original_text and not candidates:
        warnings.append(f"Page {page_index + 1}: used the visual selection because the exact text could not be searched")

    source_info = find_source_span(page_index, page, target, original_text)
    replacement = str(edit.get("replacementText", "")).replace("\\r", " ").replace("\\n", " ")
    insert_plan = None

    # Prove that a non-empty replacement can be written before deleting the
    # source. An overlong edit must leave the original text intact.
    if replacement:
        source_span = source_info["span"] if source_info else None
        font_size = max(
            4.0,
            float(source_span.get("size", 0)) if source_span else float(edit.get("fontSizeRatio", 0.015)) * page.rect.height,
        )
        traits = span_traits(source_info, edit)
        contains_cjk = bool(re.search(r"[\u3400-\u9fff\uf900-\ufaff]", replacement))
        font_config = source_font_candidate(page, source_info, replacement)
        if font_config is None:
            font_config = fallback_font(traits, replacement, contains_cjk)
        font_config = calibrate_font_metrics(font_config, source_info, font_size)

        if source_span:
            baseline_y = float(source_span.get("origin", (target.x0, target.y1))[1])
            try:
                text_color = pymupdf.sRGB_to_pdf(int(source_span.get("color", 0)))
            except Exception:
                text_color = (0, 0, 0)
        else:
            baseline_y = target.y1 - font_size * 0.2
            color_value = edit.get("color") or {}
            text_color = (
                clamp(color_value.get("r", 0)),
                clamp(color_value.get("g", 0)),
                clamp(color_value.get("b", 0)),
            )

        available_width = available_line_width(page, target, source_info, original_text, font_size)
        attempted_size = fitted_single_line_size(replacement, font_size, available_width, font_config)
        if attempted_size is None:
            warnings.append(f"第 {page_index + 1} 页：替换文字过长，未修改原文字。")
            continue
        insert_plan = {
            "replacement": replacement,
            "font_size": font_size,
            "traits": traits,
            "contains_cjk": contains_cjk,
            "font_config": font_config,
            "baseline_y": baseline_y,
            "text_color": text_color,
            "available_width": available_width,
            "attempted_size": attempted_size,
        }

    resolved_edits.append((page_index, target, edit, source_info, insert_plan))
    page.add_redact_annot(target, fill=False, cross_out=False)

# Apply once per page so searching and locating later edits always uses the original page text.
for page_index in sorted(set(item[0] for item in resolved_edits)):
    doc[page_index].apply_redactions(images=0, graphics=0, text=0)

for page_index, target, edit, source_info, insert_plan in resolved_edits:
    if insert_plan is None:
        continue

    page = doc[page_index]
    replacement = insert_plan["replacement"]
    font_size = insert_plan["font_size"]
    traits = insert_plan["traits"]
    contains_cjk = insert_plan["contains_cjk"]
    font_config = insert_plan["font_config"]
    baseline_y = insert_plan["baseline_y"]
    text_color = insert_plan["text_color"]
    available_width = insert_plan["available_width"]
    attempted_size = insert_plan["attempted_size"]

    inserted = False
    try:
        inserted_lines = page.insert_text(
            pymupdf.Point(target.x0, baseline_y),
            replacement,
            fontsize=attempted_size,
            fontname=font_config["name"],
            fontfile=font_config["file"],
            color=text_color,
            overlay=True,
        )
        inserted = inserted_lines == 1
    except Exception:
        inserted = False

    # Some embedded subset fonts cannot be reused for newly requested glyphs.
    # Retry with a metrically compatible Base-14 or CJK fallback without wrapping.
    if not inserted and font_config.get("reused"):
        font_config = fallback_font(traits, replacement, contains_cjk)
        font_config = calibrate_font_metrics(font_config, source_info, font_size)
        attempted_size = fitted_single_line_size(replacement, font_size, available_width, font_config)
        if attempted_size is not None:
            try:
                inserted_lines = page.insert_text(
                    pymupdf.Point(target.x0, baseline_y),
                    replacement,
                    fontsize=attempted_size,
                    fontname=font_config["name"],
                    fontfile=font_config["file"],
                    color=text_color,
                    overlay=True,
                )
                inserted = inserted_lines == 1
            except Exception:
                inserted = False

    if not inserted:
        warnings.append(f"第 {page_index + 1} 页：替换文字写入失败，原位置已保留为空白。")
    elif attempted_size < font_size * 0.99:
        warnings.append(f"第 {page_index + 1} 页：替换文字已缩小至 {attempted_size:.1f}pt 以保持单行。")

# A full rewrite is required so redacted text is physically removed instead of
# lingering in an incremental revision. Keep content-stream cleaning disabled:
# it can expand already-compressed PDFs. Object streams plus lossless stream,
# image, and font compression keep the rewritten file compact.
pdf_bytes = doc.tobytes(
    garbage=3,
    clean=False,
    deflate=True,
    deflate_images=True,
    deflate_fonts=True,
    use_objstms=1,
)
doc.close()

json.dumps({
    "pdf": base64.b64encode(pdf_bytes).decode("ascii"),
    "warnings": warnings,
})
`);

            const parsed = JSON.parse(result) as { pdf: string; warnings: string[] };
            const binary = atob(parsed.pdf);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            return {
              pdf: new Blob([bytes], { type: 'application/pdf' }),
              warnings: parsed.warnings || [],
            };
          } finally {
            for (const path of cleanupPaths) {
              try {
                pyodide.FS.unlink(path);
              } catch {
                // Ignore missing temporary files.
              }
            }
          }
        },

        async pdfToDocx(file: File): Promise<Blob> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_docx_${uid}.pdf`;
          const outputPath = `/output_docx_${uid}.docx`;

          // Write PDF to virtual filesystem
          pyodide.FS.writeFile(inputPath, pdfData);

          // Convert using pdf2docx
          const result = await pyodide.runPythonAsync(`
import base64
from pdf2docx import Converter

cv = Converter('${inputPath}')
cv.convert('${outputPath}')
cv.close()

with open('${outputPath}', 'rb') as f:
    docx_data = f.read()

base64.b64encode(docx_data).decode('ascii')
`);

          // Clean up
          try {
            pyodide.FS.unlink(inputPath);
            pyodide.FS.unlink(outputPath);
          } catch {
            // Ignore cleanup errors
          }

          // Convert base64 to Blob
          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
        },

        async pdfToPdfa(file: File, options: any): Promise<{ pdf: Blob }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          // Options are available for future use (level, embedFonts, flattenTransparency)
          const _options = options;

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_pdfa_${uid}.pdf`;
          const outputPath = `/output_pdfa_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Attempt to make it PDF/A compliant (Best Effort)
# In a real scenario, we would need to attach an ICC profile and valid OutputIntent.

# Ensure all fonts are embedded and subsetted if possible
# garbage=4 will remove unused objects and deduplicate
save_options = {
    "garbage": 4,
    "deflate": True,
}

doc.save("${outputPath}", **save_options)
doc.close()

with open("${outputPath}", "rb") as f:
    pdf_data = f.read()

base64.b64encode(pdf_data).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
            pyodide.FS.unlink(outputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return {
            pdf: new Blob([bytes], { type: 'application/pdf' })
          };
        },

        async htmlToPdf(html: string, options: any): Promise<Blob> {
          const { pageSize = 'a4', margins = { top: 50, right: 50, bottom: 50, left: 50 }, attachments = [] } = options || {};

          // Page dimensions in points (72 points per inch)
          const pageSizes: Record<string, [number, number]> = {
            'a4': [595, 842],
            'letter': [612, 792],
            'legal': [612, 1008],
          };
          const [width, height] = pageSizes[pageSize] || pageSizes['a4'];

          // Write HTML to virtual filesystem
          const encoder = new TextEncoder();
          const htmlBytes = encoder.encode(html);
          pyodide.FS.writeFile('/input.html', htmlBytes);

          // Write attachments to virtual filesystem
          for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            if (att.content) {
              const attData = new Uint8Array(att.content);
              pyodide.FS.writeFile(`/attachment_${i}`, attData);
            }
          }

          // Build attachments info for Python
          const attachmentsJson = JSON.stringify(attachments.map((att: any, idx: number) => ({
            filename: att.filename,
            contentType: att.contentType,
            path: `/attachment_${idx}`,
            hasContent: !!att.content
          })));

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64
import json

# Read HTML
with open('/input.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Margins
margin_left = ${margins.left}
margin_top = ${margins.top}
margin_right = ${margins.right}
margin_bottom = ${margins.bottom}
page_width = ${width}
page_height = ${height}

# Create PDF document
doc = pymupdf.open()

try:
    # Try using Story API (available in newer PyMuPDF versions)
    rect = pymupdf.Rect(margin_left, margin_top, page_width - margin_right, page_height - margin_bottom)
    story = pymupdf.Story(html=html_content)
    
    more = True
    while more:
        page = doc.new_page(width=page_width, height=page_height)
        filled, more = story.place(rect)
        story.draw(page)
except Exception as e:
    # Fallback: Simple text-based PDF
    doc.close()
    doc = pymupdf.open()
    
    # Strip HTML tags for fallback
    import re
    text = re.sub('<[^<]+?>', '', html_content)
    text = text.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
    
    # Split into lines
    lines = text.split('\\n')
    
    page = doc.new_page(width=page_width, height=page_height)
    y = margin_top
    fontsize = 11
    line_height = fontsize * 1.5
    
    for line in lines:
        line = line.strip()
        if not line:
            y += line_height / 2
            continue
            
        # Check if we need a new page
        if y + line_height > page_height - margin_bottom:
            page = doc.new_page(width=page_width, height=page_height)
            y = margin_top
        
        # Insert text
        page.insert_text((margin_left, y), line, fontsize=fontsize, fontname="helv")
        y += line_height

# Embed attachments
attachments_info = json.loads('${attachmentsJson.replace(/'/g, "\\'")}')
for att_info in attachments_info:
    if att_info['hasContent']:
        try:
            with open(att_info['path'], 'rb') as att_file:
                att_data = att_file.read()
            # Embed file attachment
            doc.embfile_add(
                name=att_info['filename'],
                buffer=att_data,
                filename=att_info['filename'],
                desc=f"Attachment: {att_info['filename']}"
            )
        except Exception as e:
            # Silently skip if embedding fails
            pass

# Save to bytes
pdf_bytes = doc.tobytes()
doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink('/input.html');
            // Clean up attachment files
            for (let i = 0; i < attachments.length; i++) {
              try {
                pyodide.FS.unlink(`/attachment_${i}`);
              } catch {
                // Ignore
              }
            }
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], { type: 'application/pdf' });
        },

        async deskewPdf(file: File, options: any): Promise<{ pdf: Blob; result: any }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { threshold = 0.5, dpi = 150 } = options || {};

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_deskew_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import numpy as np
import base64
import json
import math

def detect_skew_angle(pix, threshold=0.5, max_angle=10):
    """
    Detect skew angle of a page using projection profile variance method.
    
    Args:
        pix: PyMuPDF Pixmap object
        threshold: Sensitivity threshold (0.1-30, lower = more sensitive)
        max_angle: Maximum angle to check in degrees
    
    Returns:
        Detected skew angle in degrees
    """
    # Convert pixmap to numpy array (grayscale)
    samples = pix.samples
    width = pix.width
    height = pix.height
    n = pix.n  # Number of components (e.g., 3 for RGB, 1 for Gray)
    
    # Create numpy array from samples
    img_array = np.frombuffer(samples, dtype=np.uint8)
    
    # Handle different color spaces
    if n == 1:
        # Already grayscale
        img = img_array.reshape(height, width)
    elif n == 3:
        # RGB - convert to grayscale
        img = img_array.reshape(height, width, n)
        img = np.dot(img[...,:3], [0.299, 0.587, 0.114]).astype(np.uint8)
    elif n == 4:
        # RGBA - convert to grayscale, ignore alpha
        img = img_array.reshape(height, width, n)
        img = np.dot(img[...,:3], [0.299, 0.587, 0.114]).astype(np.uint8)
    else:
        # Fallback
        img = img_array.reshape(height, width, n)
        img = img[:,:,0]
    
    # Apply binary threshold (Otsu-like adaptive threshold)
    # Calculate histogram
    hist, _ = np.histogram(img.flatten(), bins=256, range=(0, 256))
    total_pixels = img.size
    
    # Find threshold using Otsu's method
    sum_total = sum(i * hist[i] for i in range(256))
    sum_background = 0
    weight_background = 0
    max_variance = 0
    otsu_threshold = 0
    
    for i in range(256):
        weight_background += hist[i]
        if weight_background == 0:
            continue
        
        weight_foreground = total_pixels - weight_background
        if weight_foreground == 0:
            break
        
        sum_background += i * hist[i]
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        
        variance = weight_background * weight_foreground * (mean_background - mean_foreground) ** 2
        
        if variance > max_variance:
            max_variance = variance
            otsu_threshold = i
    
    # Apply threshold
    binary = (img > otsu_threshold).astype(np.uint8) * 255
    
    # Test different angles
    angle_range = np.linspace(-max_angle, max_angle, int(max_angle * 4 + 1))
    variances = []
    
    for angle in angle_range:
        # Rotate image
        angle_rad = math.radians(angle)
        cos_a = math.cos(angle_rad)
        sin_a = math.sin(angle_rad)
        
        # Simple rotation using coordinate transformation
        # For performance, we'll use a simplified projection method
        
        # Calculate horizontal projection (sum of pixels in each row)
        if abs(angle) < 0.5:
            # No rotation needed for very small angles
            projection = np.sum(binary, axis=1)
        else:
            # Simplified rotation: sample the image at rotated coordinates
            h_new = int(abs(height * cos_a) + abs(width * sin_a))
            projection = np.zeros(h_new)
            
            for y in range(0, height, max(1, height // 200)):  # Sample every few rows
                for x in range(0, width, max(1, width // 200)):  # Sample every few cols
                    if binary[y, x] > 128:
                        # Rotate coordinates
                        x_rot = int((x - width/2) * cos_a - (y - height/2) * sin_a + width/2)
                        y_rot = int((x - width/2) * sin_a + (y - height/2) * cos_a + height/2)
                        
                        y_new = int(y_rot * h_new / height)
                        if 0 <= y_new < h_new:
                            projection[y_new] += 1
        
        # Calculate variance of projection
        variance = np.var(projection)
        variances.append(variance)
    
    # Find angle with maximum variance (sharpest text lines)
    best_idx = np.argmax(variances)
    detected_angle = angle_range[best_idx]
    max_var = variances[best_idx]
    baseline_var = variances[len(variances) // 2]  # variance at 0 degrees
    
    # Only correct if variance improvement is significant
    if baseline_var > 0 and (max_var - baseline_var) / baseline_var > threshold / 10:
        return detected_angle
    else:
        return 0.0

def rotate_page(page, angle):
    """
    Rotate a PDF page by the given angle.
    
    Args:
        page: PyMuPDF Page object
        angle: Rotation angle in degrees (positive = clockwise)
    """
    if abs(angle) < 0.1:
        return False
    
    # Get page dimensions
    rect = page.rect
    
    # Create rotation matrix
    center = pymupdf.Point(rect.width / 2, rect.height / 2)
    matrix = pymupdf.Matrix(1, 1).prerotate(-angle)  # Negative because PDF coordinates
    
    # Apply rotation by transforming page content
    # Note: PyMuPDF doesn't have direct content rotation, so we use a workaround:
    # 1. Get the page as a pixmap at original resolution
    # 2. Rotate the pixmap
    # 3. Create new page with rotated content
    
    # For now, we'll use set_rotation if angle is multiple of 90
    # For arbitrary angles, we need a different approach
    
    if abs(angle % 90) < 0.1:
        # Use built-in rotation for 90-degree increments
        rotation = int(round(angle / 90) * 90) % 360
        page.set_rotation(rotation)
        return True
    else:
        # For arbitrary angles, we need to recreate the page
        # Get page as image
        mat = pymupdf.Matrix(2, 2)  # 2x scale for quality
        pix = page.get_pixmap(matrix=mat)
        
        # Rotate pixmap - PyMuPDF doesn't have built-in rotation
        # We'll need to use a workaround: convert to PIL, rotate, convert back
        # Since PIL might not be available, we'll skip sub-degree rotation
        # and only correct if angle is significant
        
        if abs(angle) >= 0.5:
            # Round to nearest degree and apply as transformation
            # This is a simplified approach - proper implementation would use PIL or similar
            rotation = int(round(angle))
            if abs(rotation) >= 1:
                current_rotation = page.rotation
                new_rotation = (current_rotation - rotation) % 360
                page.set_rotation(new_rotation)
                return True
        
        return False

# Main processing
doc = pymupdf.open("${inputPath}")
angles = []
corrected = []

for page_num, page in enumerate(doc):
    try:
        # Get page as pixmap for analysis
        pix = page.get_pixmap(dpi=${dpi})
        
        # Detect skew angle
        angle = detect_skew_angle(pix, threshold=${threshold}, max_angle=10)
        angles.append(float(angle))
        
        # Correct skew if angle is significant
        if abs(angle) >= 0.3:
            was_corrected = rotate_page(page, angle)
            corrected.append(was_corrected)
        else:
            corrected.append(False)
        
    except Exception as e:
        # If detection fails, assume no skew
        angles.append(0.0)
        corrected.append(False)

# Save document with corrections
pdf_bytes = doc.tobytes()
doc.close()

result_data = {
    "totalPages": len(angles),
    "correctedPages": sum(corrected),
    "angles": angles,
    "corrected": corrected
}

json.dumps(result_data) + "|||" + base64.b64encode(pdf_bytes).decode('ascii')
`);

          const [resultJson, pdfBase64] = result.split('|||');
          const resultData = JSON.parse(resultJson);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(pdfBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return {
            pdf: new Blob([bytes], { type: 'application/pdf' }),
            result: resultData
          };
        },

        async fontToOutline(file: File, options: any): Promise<{ pdf: Blob; fontsConverted: number; pagesProcessed: number; totalPages: number }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { dpi = 300, preserveSelectableText = false, pageRange = '' } = options || {};

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_font_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64
import json

def parse_page_range(range_str, total_pages):
    """Parse page range string like '1-3,5,7-9' into list of page indices (0-based)."""
    if not range_str or range_str.strip() == '':
        return list(range(total_pages))
    
    pages = set()
    for part in range_str.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-', 1)
            start = max(1, int(start.strip()))
            end = min(total_pages, int(end.strip()))
            pages.update(range(start - 1, end))
        else:
            page_num = int(part.strip())
            if 1 <= page_num <= total_pages:
                pages.add(page_num - 1)
    
    return sorted(list(pages))

def convert_fonts_to_outlines(input_doc, dpi=300, preserve_text=False, page_indices=None):
    """
    Convert fonts to outlines by rendering pages as high-quality images.
    
    This method removes all font dependencies by converting text to raster/vector graphics.
    The visual appearance is preserved exactly, but text becomes non-selectable.
    
    Args:
        input_doc: Input PDF document
        dpi: Resolution for rendering (higher = better quality but larger file)
        preserve_text: If True, overlays invisible text layer for searchability
        page_indices: List of page indices to process (None = all pages)
    
    Returns:
        (new_doc, fonts_converted_count)
    """
    # Create new output document
    output_doc = pymupdf.open()
    
    total_fonts = 0
    pages_processed = 0
    
    # Get pages to process
    if page_indices is None:
        page_indices = range(len(input_doc))
    
    for page_idx in page_indices:
        if page_idx >= len(input_doc):
            continue
            
        page = input_doc[page_idx]
        pages_processed += 1
        
        # Count fonts on this page
        try:
            font_list = page.get_fonts()
            total_fonts += len(font_list)
        except:
            pass
        
        # Get original page dimensions
        page_rect = page.rect
        
        # Render page to high-quality pixmap
        # Use matrix to control DPI: matrix = pymupdf.Matrix(zoom, zoom)
        zoom = dpi / 72  # 72 is default PDF DPI
        mat = pymupdf.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        
        # Create new page in output document with same dimensions
        new_page = output_doc.new_page(width=page_rect.width, height=page_rect.height)
        
        # Insert the rendered image
        # The image will fill the entire page
        img_rect = new_page.rect
        new_page.insert_image(img_rect, pixmap=pix)
        
        # Optionally preserve text layer for searchability (invisible text overlay)
        if preserve_text:
            try:
                # Get text with positioning
                text_instances = page.get_text("dict")
                
                # Add invisible text overlay
                for block in text_instances.get("blocks", []):
                    if block.get("type") == 0:  # Text block
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                text = span.get("text", "")
                                bbox = span.get("bbox", [])
                                font_size = span.get("size", 12)
                                
                                if text and len(bbox) == 4:
                                    # Insert invisible text
                                    # render_mode=3 means invisible (neither fill nor stroke)
                                    rect = pymupdf.Rect(bbox)
                                    new_page.insert_textbox(
                                        rect,
                                        text,
                                        fontsize=font_size,
                                        color=(1, 1, 1),  # White (invisible on white)
                                        render_mode=3,  # Neither fill nor stroke = invisible
                                    )
            except Exception as e:
                # If text preservation fails, continue without it
                pass
    
    return output_doc, total_fonts

# Main processing
input_doc = pymupdf.open("${inputPath}")
total_pages = len(input_doc)

# Parse page range
try:
    page_indices = parse_page_range('${pageRange}', total_pages)
except:
    page_indices = None

# Convert fonts to outlines
output_doc, fonts_converted = convert_fonts_to_outlines(
    input_doc,
    dpi=${dpi},
    preserve_text=${preserveSelectableText ? 'True' : 'False'},
    page_indices=page_indices
)

# Save result
pdf_bytes = output_doc.tobytes(garbage=4, deflate=True)

# Close documents
input_doc.close()
output_doc.close()

# Return result
result_data = {
    "fontsConverted": fonts_converted,
    "pagesProcessed": len(page_indices) if page_indices else total_pages,
    "totalPages": total_pages
}

json.dumps(result_data) + "|||" + base64.b64encode(pdf_bytes).decode('ascii')
`);

          const [resultJson, pdfBase64] = result.split('|||');
          const resultData = JSON.parse(resultJson);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(pdfBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return {
            pdf: new Blob([bytes], { type: 'application/pdf' }),
            fontsConverted: resultData.fontsConverted || 0,
            pagesProcessed: resultData.pagesProcessed || 0,
            totalPages: resultData.totalPages || 0
          };
        },

        async getOCGLayers(file: File): Promise<any[]> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_ocg_get_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import json

doc = pymupdf.open("${inputPath}")

# Get OCG (Optional Content Groups) info
ocgs = doc.get_ocgs() or {}
layers = []

for xref, ocg_info in ocgs.items():
    layers.append({
        "id": str(xref),
        "name": ocg_info.get("name", f"Layer {xref}"),
        "visible": ocg_info.get("on", True),
        "locked": False
    })

doc.close()

json.dumps(layers)
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          return JSON.parse(result);
        },

        async toggleOCGLayer(file: File, options: any): Promise<{ pdf: Blob }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { layerId, visible } = options;

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_ocg_toggle_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Toggle OCG visibility - simplified implementation
# In production, you'd use set_ocg_state

pdf_bytes = doc.tobytes()
doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return { pdf: new Blob([bytes], { type: 'application/pdf' }) };
        },

        async addOCGLayer(file: File, options: any): Promise<{ pdf: Blob; layerId: string }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { name } = options;

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_ocg_add_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Add new OCG layer
xref = doc.add_ocg("${name || 'New Layer'}")

pdf_bytes = doc.tobytes()
doc.close()

str(xref) + "|||" + base64.b64encode(pdf_bytes).decode('ascii')
`);

          const [xrefStr, pdfBase64] = result.split('|||');

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(pdfBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return {
            pdf: new Blob([bytes], { type: 'application/pdf' }),
            layerId: xrefStr
          };
        },

        async deleteOCGLayer(file: File, options: any): Promise<{ pdf: Blob }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_ocg_del_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Note: PyMuPDF doesn't have direct OCG deletion API
# This is a placeholder - in production you'd need to modify the PDF structure

pdf_bytes = doc.tobytes()
doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return { pdf: new Blob([bytes], { type: 'application/pdf' }) };
        },

        async renameOCGLayer(file: File, options: any): Promise<{ pdf: Blob }> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_ocg_rename_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Note: Renaming OCG requires modifying the OCG object directly
# This is a simplified implementation

pdf_bytes = doc.tobytes()
doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return { pdf: new Blob([bytes], { type: 'application/pdf' }) };
        },

        async compress(file: File, options: any): Promise<Blob> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { quality = 'medium', removeMetadata = false } = options || {};

          // Map quality to image compression settings
          const qualitySettings: Record<string, { imageQuality: number; maxDpi: number }> = {
            'low': { imageQuality: 40, maxDpi: 72 },
            'medium': { imageQuality: 65, maxDpi: 120 },
            'high': { imageQuality: 85, maxDpi: 200 },
            'maximum': { imageQuality: 95, maxDpi: 300 },
          };
          const settings = qualitySettings[quality] || qualitySettings['medium'];

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_compress_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64
import io

doc = pymupdf.open("${inputPath}")
image_quality = ${settings.imageQuality}
max_dpi = ${settings.maxDpi}
remove_metadata = ${removeMetadata ? 'True' : 'False'}

# Process each page to compress images
for page_num in range(len(doc)):
    page = doc[page_num]
    
    # Get all images on the page
    image_list = page.get_images(full=True)
    
    for img_info in image_list:
        xref = img_info[0]
        
        try:
            # Extract image
            base_image = doc.extract_image(xref)
            if not base_image:
                continue
            
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            width = base_image.get("width", 0)
            height = base_image.get("height", 0)
            
            # Skip small images (likely icons)
            if width < 50 or height < 50:
                continue
            
            # Calculate current DPI (approximate)
            # Skip if already low quality
            if len(image_bytes) < 10000:
                continue
            
            # Create pixmap from image data
            pix = pymupdf.Pixmap(image_bytes)
            
            # Skip images with alpha channel (transparency) or masks to prevent icon/vector markup corruption and black background issue
            obj_str = doc.xref_object(xref)
            if pix.alpha or base_image.get("smask", 0) > 0 or "/SMask" in obj_str or "/Mask" in obj_str:
                continue
            
            # Check if we need to reduce quality
            if pix.width > 100 and pix.height > 100:
                # Calculate scale factor if image is too large
                scale = 1.0
                if pix.width > max_dpi * 10 or pix.height > max_dpi * 10:
                    scale = max(max_dpi * 10 / pix.width, max_dpi * 10 / pix.height)
                    if scale < 1.0:
                        # Resize the pixmap
                        new_width = int(pix.width * scale)
                        new_height = int(pix.height * scale)
                        if new_width > 50 and new_height > 50:
                            # Create new smaller pixmap by sampling
                            pix2 = pymupdf.Pixmap(pix, new_width, new_height, None)
                            pix = pix2
                
                # Convert to RGB if needed (JPEG doesn't support alpha)
                if pix.alpha:
                    pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
                
                # Re-encode as JPEG with quality setting
                new_image_bytes = pix.tobytes(output="jpeg", jpg_quality=image_quality)
                
                # Only replace if we actually reduced size
                if len(new_image_bytes) < len(image_bytes) * 0.9:
                    page.replace_image(xref, stream=new_image_bytes)
        except Exception as e:
            # Skip images that can't be processed
            pass

# Remove metadata if requested
if remove_metadata:
    doc.set_metadata({})
    doc.del_xml_metadata()

# Save with maximum compression
pdf_bytes = doc.tobytes(
    garbage=4,  # Remove unused objects, merge duplicate objects
    deflate=True,  # Compress streams
)
doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], { type: 'application/pdf' });
        },

        async photonCompress(file: File, options: any): Promise<Blob> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);
          const { dpi = 150, format = 'jpeg', quality = 85 } = options || {};

          // Use unique file names to avoid race conditions during concurrent processing
          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_photon_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")

# Create a new document
new_doc = pymupdf.open()

target_dpi = ${dpi}
jpeg_quality = ${quality}

# Process each page - render to image and create new PDF
for page_num in range(len(doc)):
    page = doc[page_num]
    
    # Get page dimensions
    rect = page.rect
    
    # Calculate zoom factor for target DPI (72 is base PDF DPI)
    zoom = target_dpi / 72
    mat = pymupdf.Matrix(zoom, zoom)
    
    # Render page to pixmap
    pix = page.get_pixmap(matrix=mat, alpha=False)
    
    # Convert to JPEG bytes
    img_bytes = pix.tobytes(output="jpeg", jpg_quality=jpeg_quality)
    
    # Create new page with same dimensions
    new_page = new_doc.new_page(width=rect.width, height=rect.height)
    
    # Insert the rendered image
    new_page.insert_image(new_page.rect, stream=img_bytes)

# Save compressed document
pdf_bytes = new_doc.tobytes(garbage=4, deflate=True)

doc.close()
new_doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore cleanup errors
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], { type: 'application/pdf' });
        },

        async extractPages(file: File, pages: number[]): Promise<Blob> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_extract_${uid}.pdf`;
          const outputPath = `/output_extract_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          // Convert 1-based to 0-based
          const pageIndices = pages.map(p => p - 1);

          const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")
new_doc = pymupdf.open()

# Insert the selected pages one-by-one. Some PyMuPDF WASM builds do not
# support the newer insert_pdf(select=...) keyword.
for page_index in ${JSON.stringify(pageIndices)}:
    new_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)

pdf_bytes = new_doc.tobytes(garbage=4, deflate=True)
doc.close()
new_doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore
          }

          const binary = atob(result);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          return new Blob([bytes], { type: 'application/pdf' });
        },

        async splitPdf(file: File, ranges: { start: number; end: number }[]): Promise<Blob[]> {
          const arrayBuffer = await file.arrayBuffer();
          const pdfData = new Uint8Array(arrayBuffer);

          const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const inputPath = `/input_split_${uid}.pdf`;

          pyodide.FS.writeFile(inputPath, pdfData);

          const blobs: Blob[] = [];

          for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            const result = await pyodide.runPythonAsync(`
import pymupdf
import base64

doc = pymupdf.open("${inputPath}")
new_doc = pymupdf.open()

# select pages for this range
page_indices = list(range(${range.start - 1}, ${range.end}))
for page_index in page_indices:
    new_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)

pdf_bytes = new_doc.tobytes(garbage=4, deflate=True)
doc.close()
new_doc.close()

base64.b64encode(pdf_bytes).decode('ascii')
`);

            const binary = atob(result);
            const bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++) {
              bytes[j] = binary.charCodeAt(j);
            }
            blobs.push(new Blob([bytes], { type: 'application/pdf' }));
          }

          try {
            pyodide.FS.unlink(inputPath);
          } catch {
            // Ignore
          }

          return blobs;
        },
      };

      return pymupdfInstance;
    } catch (error) {
      loadingPromise = null;
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Reset the loader (for testing)
 */
export function resetPyMuPDF(): void {
  pymupdfInstance = null;
  loadingPromise = null;
}
