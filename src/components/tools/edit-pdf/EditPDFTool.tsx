'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FileUploader } from '../FileUploader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export interface EditPDFToolProps {
  className?: string;
}

interface PdfTextEdit {
  id: string;
  pageIndex: number;
  pageNumber: number;
  originalText: string;
  replacementText: string;
  rect: { x0: number; y0: number; x1: number; y1: number };
  fontSizeRatio: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  color: { r: number; g: number; b: number };
}

function parseCssColor(value: string): { r: number; g: number; b: number } {
  const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (!match) return { r: 0, g: 0, b: 0 };

  return {
    r: Math.max(0, Math.min(1, Number(match[1]) / 255)),
    g: Math.max(0, Math.min(1, Number(match[2]) / 255)),
    b: Math.max(0, Math.min(1, Number(match[3]) / 255)),
  };
}

function makeTextEditId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createTextEditFromSelection(iframeWindow: Window, selection: Selection): PdfTextEdit {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    throw new Error('请先在 PDF 页面中拖动选中一行可选文字。');
  }

  const originalText = selection.toString().trim();
  if (!originalText) {
    throw new Error('当前选区没有可编辑文字。扫描件需要先进行 OCR。');
  }

  const range = selection.getRangeAt(0);
  const elementForNode = (node: Node): Element | null =>
    node.nodeType === 1 ? node as Element : node.parentElement;
  const startElement = elementForNode(range.startContainer);
  const endElement = elementForNode(range.endContainer);
  const textLayer = startElement?.closest('.textLayer') as HTMLElement | null;
  const endTextLayer = endElement?.closest('.textLayer');
  const pageElement = textLayer?.closest('.page') as HTMLElement | null;

  if (!textLayer || !pageElement || endTextLayer !== textLayer) {
    throw new Error('一次只能选择同一页中的一行文字。');
  }

  const layerRect = textLayer.getBoundingClientRect();
  const selectionRects = Array.from(range.getClientRects()).filter(
    rect => rect.width > 0.5 && rect.height > 0.5
  );
  if (!selectionRects.length || layerRect.width <= 0 || layerRect.height <= 0) {
    throw new Error('无法读取当前文字选区的位置，请重新选择。');
  }

  const minTop = Math.min(...selectionRects.map(rect => rect.top));
  const maxTop = Math.max(...selectionRects.map(rect => rect.top));
  const maxHeight = Math.max(...selectionRects.map(rect => rect.height));
  if (maxTop - minTop > maxHeight * 0.75) {
    throw new Error('当前本地版本一次只修改一行文字，请缩小选择范围。');
  }

  const left = Math.max(layerRect.left, Math.min(...selectionRects.map(rect => rect.left)));
  const top = Math.max(layerRect.top, Math.min(...selectionRects.map(rect => rect.top)));
  const right = Math.min(layerRect.right, Math.max(...selectionRects.map(rect => rect.right)));
  const bottom = Math.min(layerRect.bottom, Math.max(...selectionRects.map(rect => rect.bottom)));
  const pageNumber = Number(pageElement.dataset.pageNumber);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error('无法确认所选文字的页码。');
  }

  const styleElement = startElement?.closest('span') || startElement;
  const computedStyle = styleElement ? iframeWindow.getComputedStyle(styleElement) : null;
  const fontSize = computedStyle ? Number.parseFloat(computedStyle.fontSize) : 12;

  return {
    id: makeTextEditId(),
    pageIndex: pageNumber - 1,
    pageNumber,
    originalText,
    replacementText: originalText,
    rect: {
      x0: Math.max(0, Math.min(1, (left - layerRect.left) / layerRect.width)),
      y0: Math.max(0, Math.min(1, (top - layerRect.top) / layerRect.height)),
      x1: Math.max(0, Math.min(1, (right - layerRect.left) / layerRect.width)),
      y1: Math.max(0, Math.min(1, (bottom - layerRect.top) / layerRect.height)),
    },
    fontSizeRatio: Number.isFinite(fontSize) ? fontSize / layerRect.height : 0.015,
    fontFamily: computedStyle?.fontFamily || 'Helvetica',
    fontWeight: computedStyle?.fontWeight || '400',
    fontStyle: computedStyle?.fontStyle || 'normal',
    color: parseCssColor(computedStyle?.color || 'rgb(0, 0, 0)'),
  };
}

function createTextEditFromTextSpan(iframeWindow: Window, span: HTMLElement): PdfTextEdit {
  const originalText = span.textContent?.trim() || '';
  const textLayer = span.closest('.textLayer') as HTMLElement | null;
  const pageElement = textLayer?.closest('.page') as HTMLElement | null;
  if (!originalText || !textLayer || !pageElement) {
    throw new Error('当前文字行无法读取。');
  }

  const layerRect = textLayer.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const pageNumber = Number(pageElement.dataset.pageNumber);
  if (
    !Number.isInteger(pageNumber)
    || pageNumber < 1
    || layerRect.width <= 0
    || layerRect.height <= 0
  ) {
    throw new Error('无法确认当前文字行的位置。');
  }

  const computedStyle = iframeWindow.getComputedStyle(span);
  const fontSize = Number.parseFloat(computedStyle.fontSize);
  return {
    id: makeTextEditId(),
    pageIndex: pageNumber - 1,
    pageNumber,
    originalText,
    replacementText: originalText,
    rect: {
      x0: Math.max(0, Math.min(1, (spanRect.left - layerRect.left) / layerRect.width)),
      y0: Math.max(0, Math.min(1, (spanRect.top - layerRect.top) / layerRect.height)),
      x1: Math.max(0, Math.min(1, (spanRect.right - layerRect.left) / layerRect.width)),
      y1: Math.max(0, Math.min(1, (spanRect.bottom - layerRect.top) / layerRect.height)),
    },
    fontSizeRatio: Number.isFinite(fontSize) ? fontSize / layerRect.height : 0.015,
    fontFamily: computedStyle.fontFamily || 'Helvetica',
    fontWeight: computedStyle.fontWeight || '400',
    fontStyle: computedStyle.fontStyle || 'normal',
    color: parseCssColor(computedStyle.color || 'rgb(0, 0, 0)'),
  };
}

/**
 * EditPDFTool Component
 * 
 * Provides PDF editing capabilities using PDF.js viewer with annotation support.
 * Users can add text, draw, highlight, and add images to PDFs.
 * The PDF.js viewer has built-in save functionality (export button in toolbar).
 */
export function EditPDFTool({ className = '' }: EditPDFToolProps) {
  const t = useTranslations('common');
  const tTools = useTranslations('tools.editPdf');
  
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [textEdits, setTextEdits] = useState<PdfTextEdit[]>([]);
  const [isApplyingTextEdits, setIsApplyingTextEdits] = useState(false);
  const [textEditStatus, setTextEditStatus] = useState<string | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastTextSelectionRef = useRef<PdfTextEdit | null>(null);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > 0) {
      const selectedFile = files[0];
      setFile(selectedFile);
      setError(null);
      setTextEdits([]);
      setTextEditStatus(null);
      lastTextSelectionRef.current = null;
      setPdfUrl(URL.createObjectURL(selectedFile));
    }
  }, []);

  const handleUploadError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const handleIframeLoad = useCallback(() => {
    setTimeout(() => {
      setIsEditorReady(true);
      
      try {
        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          const doc = iframe.contentDocument;

          const rememberTextSelection = () => {
            const iframeWindow = iframe.contentWindow;
            const selection = iframeWindow?.getSelection();
            if (!iframeWindow || !selection || selection.isCollapsed || selection.rangeCount === 0) return;
            try {
              lastTextSelectionRef.current = createTextEditFromSelection(iframeWindow, selection);
            } catch {
              // Ignore partial selections while the pointer is still moving.
            }
          };
          doc.addEventListener('selectionchange', rememberTextSelection);
          doc.addEventListener('pointerup', event => {
            const iframeWindow = iframe.contentWindow;
            if (!iframeWindow) return;
            const eventElement = event.target as Element | null;
            const target = eventElement?.closest?.('.textLayer span') as HTMLElement | null;
            if (!target) return;
            const selection = iframeWindow.getSelection();
            if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
              rememberTextSelection();
              return;
            }
            try {
              lastTextSelectionRef.current = createTextEditFromTextSpan(iframeWindow, target);
            } catch {
              // Ignore clicks outside a fully rendered text layer.
            }
          });

          // 1. Hide native PDF.js download/save buttons
          const downloadBtn = doc.getElementById('download');
          const secondaryDownloadBtn = doc.getElementById('secondaryDownload');
          if (downloadBtn) downloadBtn.style.display = 'none';
          if (secondaryDownloadBtn) secondaryDownloadBtn.style.display = 'none';
          
          // 2. Hide save button from CustomToolbar (pdfjs-annotation-extension)
          const customToolbar = doc.querySelector('.CustomToolbar');
          if (customToolbar) {
            const buttons = customToolbar.querySelectorAll('li, button');
            buttons.forEach((btn: Element) => {
              const text = btn.textContent?.trim();
              if (text === '\u4fdd\u5b58' || text === 'Save') {
                (btn as HTMLElement).style.display = 'none';
              }
            });
          }          // 3. Inject PDFCraft Enrichment Script
          const patchScript = doc.createElement('script');
          patchScript.textContent = `
            (function() {
              console.log('[PDFCraft Patch] Initializing annotation patches...');

              let undoStack = [];
              let redoStack = [];
              let lastStateStr = '';
              let isDoingUndoRedo = false;

              const toolNameTranslations = {
                'cloud': '${t('editPdf.annCloud')}',
                'rectangle': '${t('editPdf.annRectangle')}',
                'circle': '${t('editPdf.annCircle')}',
                'arrow': '${t('editPdf.annArrow')}',
                'freehand': '${t('editPdf.annFreehand')}',
                'freeText': '${t('editPdf.annFreeText')}',
                'freeHighlight': '${t('editPdf.annFreeHighlight')}',
                'note': '${t('editPdf.annNote')}',
                'signature': '${t('editPdf.annSignature')}',
                'stamp': '${t('editPdf.annStamp')}'
              };

              const initInterval = setInterval(() => {
                const ext = window.pdfjsAnnotationExtensionInstance;
                if (ext) {
                  clearInterval(initInterval);
                  console.log('[PDFCraft Patch] pdfjsAnnotationExtensionInstance found! Setting up patches...');
                  setupCloudFix();
                  setupColorPickerAndStroke();
                  setupUndoRedoAndAuthorPatch();
                  setupSnapping();
                  setupChineseFontPatch();
                }
              }, 200);

              function setupSnapping() {
                const ext = window.pdfjsAnnotationExtensionInstance;
                const stage = ext?.stage || ext?.konvaStage || (window.Konva && window.Konva.stages[0]);
                if (!stage) return;
                
                console.log('[PDFCraft Patch] Setting up Konva Snapping Alignment...');
                
                stage.on('dragmove', function(e) {
                  const activeShape = e.target;
                  if (!activeShape || activeShape === stage) return;
                  
                  const shapes = stage.find('.annotation') || stage.find('Group') || stage.getChildren();
                  const snapOffset = 8;
                  let snapX = null;
                  let snapY = null;
                  
                  const activeBox = activeShape.getClientRect();
                  if (!activeBox) return;

                  shapes.forEach(shape => {
                    if (shape === activeShape || shape.name() === 'guideline') return;
                    const box = shape.getClientRect();
                    if (!box) return;
                    
                    // X-axis alignment
                    if (Math.abs(activeBox.x - box.x) < snapOffset) snapX = box.x;
                    if (Math.abs((activeBox.x + activeBox.width/2) - (box.x + box.width/2)) < snapOffset) {
                      snapX = box.x + box.width/2 - activeBox.width/2;
                    }
                    if (Math.abs((activeBox.x + activeBox.width) - (box.x + box.width)) < snapOffset) {
                      snapX = box.x + box.width - activeBox.width;
                    }
                    
                    // Y-axis alignment
                    if (Math.abs(activeBox.y - box.y) < snapOffset) snapY = box.y;
                    if (Math.abs((activeBox.y + activeBox.height/2) - (box.y + box.height/2)) < snapOffset) {
                      snapY = box.y + box.height/2 - activeBox.height/2;
                    }
                    if (Math.abs((activeBox.y + activeBox.height) - (box.y + box.height)) < snapOffset) {
                      snapY = box.y + box.height - activeBox.height;
                    }
                  });
                  
                  // Snap coordinates
                  if (snapX !== null) activeShape.x(snapX);
                  if (snapY !== null) activeShape.y(snapY);
                  
                  // Render red guide dashed lines as DOM overlays
                  drawGuides(stage, snapX, snapY);
                });
                
                stage.on('dragend', function() {
                  clearGuides();
                });
                
                function drawGuides(stg, sx, sy) {
                  let container = document.getElementById('pdfcraft-alignment-guides');
                  if (!container) {
                    container = document.createElement('div');
                    container.id = 'pdfcraft-alignment-guides';
                    container.style.cssText = 'position:absolute; inset:0; pointer-events:none; z-index:99999;';
                    stg.container().appendChild(container);
                  }
                  container.innerHTML = '';
                  
                  if (sx !== null) {
                    const l = document.createElement('div');
                    l.style.cssText = 'position:absolute; left:' + sx + 'px; top:0; bottom:0; border-left:1.5px dashed red;';
                    container.appendChild(l);
                  }
                  if (sy !== null) {
                    const l = document.createElement('div');
                    l.style.cssText = 'position:absolute; top:' + sy + 'px; left:0; right:0; border-top:1.5px dashed red;';
                    container.appendChild(l);
                  }
                }
                
                function clearGuides() {
                  const container = document.getElementById('pdfcraft-alignment-guides');
                  if (container) container.innerHTML = '';
                }
              }

              function setupChineseFontPatch() {
                const ext = window.pdfjsAnnotationExtensionInstance;
                const pdfLib = window.pdfLib || ext?.pdfLib;
                if (!pdfLib) return;

                const originalSave = pdfLib.PDFDocument.prototype.save;
                pdfLib.PDFDocument.prototype.save = async function(saveOptions) {
                  console.log('[PDFCraft Patch] Intercepting save to inspect for Chinese text...');
                  
                  let hasChinese = false;
                  
                  // Inspect the annotation store inside PDFJS Annotation Extension
                  const store = window.pdfjsAnnotationExtensionInstance?.getAnnotationStore();
                  if (store && store.annotations) {
                    store.annotations.forEach(ann => {
                      if (ann.name === 'freeText' && /[\u4e00-\u9fa5]/.test(ann.text || '')) {
                        hasChinese = true;
                      }
                    });
                  }

                  if (hasChinese) {
                    try {
                      console.log('[PDFCraft Patch] Chinese text found. Embedding NotoSansSC-Regular font...');
                      const fontBytes = await fetch('/fonts/NotoSansSC-Regular.ttf').then(res => res.arrayBuffer());
                      const customFont = await this.embedFont(fontBytes, { subset: true });
                      
                      // Intercept subsequent font loading requests for Helvetica inside pdf-lib
                      const originalEmbedFont = this.embedFont;
                      this.embedFont = async function(fontToEmbed, embedOpts) {
                        if (fontToEmbed === pdfLib.StandardFonts.Helvetica || fontToEmbed === 'Helvetica') {
                          console.log('[PDFCraft Patch] Redirected Helvetica embed to NotoSansSC font');
                          return customFont;
                        }
                        return originalEmbedFont.call(this, fontToEmbed, embedOpts);
                      };
                    } catch (e) {
                      console.error('[PDFCraft Patch] Failed to embed Chinese font subset', e);
                    }
                  }

                  return originalSave.call(this, saveOptions);
                };
              }

              function setupCloudFix() {
                // Ensure double-click bypasses text layer blocking to complete drawing
                document.addEventListener('dblclick', function(e) {
                  const ext = window.pdfjsAnnotationExtensionInstance;
                  const activeTool = ext?.activeAnnotation?.name;
                  if (activeTool === 'cloud') {
                    const konvaContent = document.querySelector('.konvajs-content');
                    if (konvaContent) {
                      console.log('[PDFCraft Patch] Intercepted dblclick for cloud tool, dispatching to Konva stage.');
                      const dblEvent = new MouseEvent('dblclick', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: e.clientX,
                        clientY: e.clientY
                      });
                      konvaContent.dispatchEvent(dblEvent);
                    }
                  }
                }, true);

                // Add Enter key support to elegantly complete and close polygon drawing
                document.addEventListener('keydown', function(e) {
                  if (e.key === 'Enter') {
                    const ext = window.pdfjsAnnotationExtensionInstance;
                    const activeTool = ext?.activeAnnotation?.name;
                    if (activeTool === 'cloud') {
                      const konvaContent = document.querySelector('.konvajs-content');
                      if (konvaContent) {
                        console.log('[PDFCraft Patch] Intercepted Enter key for cloud tool, dispatching dblclick to end drawing.');
                        const dblEvent = new MouseEvent('dblclick', {
                          bubbles: true,
                          cancelable: true,
                          view: window
                        });
                        konvaContent.dispatchEvent(dblEvent);
                      }
                    }
                  }
                });
              }

              function setupColorPickerAndStroke() {
                // Inject picker for Highlight tool
                const hlColorPicker = document.getElementById('editorHighlightColorPicker');
                if (hlColorPicker) {
                  if (!hlColorPicker.querySelector('.pdfcraft-custom-hl-picker')) {
                    const picker = document.createElement('input');
                    picker.type = 'color';
                    picker.className = 'pdfcraft-custom-hl-picker';
                    picker.style.cssText = 'width:28px; height:28px; border:2px solid #ccc; border-radius:50%; padding:0; cursor:pointer; margin-left:8px; vertical-align:middle; background:none;';
                    
                    picker.addEventListener('input', function(e) {
                      const ext = window.pdfjsAnnotationExtensionInstance;
                      const selected = ext?.selectedAnnotation;
                      if (selected) {
                        ext.updateAnnotationStyle(selected, { color: e.target.value });
                      }
                    });
                    hlColorPicker.appendChild(picker);
                  }
                }

                // Dynamically observe CustomAnnotationMenu popups to inject controls
                const observer = new MutationObserver(function() {
                  const menu = document.querySelector('.CustomAnnotationMenu');
                  if (menu && menu.style.display !== 'none') {
                    injectCustomMenuControls(menu);
                  }
                });

                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['style', 'class']
                });
              }

              function injectCustomMenuControls(menu) {
                if (menu.querySelector('.pdfcraft-custom-controls')) return;

                console.log('[PDFCraft Patch] CustomAnnotationMenu opened, injecting custom controls...');

                const container = document.createElement('div');
                container.className = 'pdfcraft-custom-controls';
                container.style.cssText = 'border-top:1px solid #ccc; margin-top:8px; padding-top:8px; font-size:12px; display:flex; flex-direction:column; gap:8px; color:var(--toolbar-fg-color, #333);';

                const ext = window.pdfjsAnnotationExtensionInstance;
                const selected = ext?.selectedAnnotation;
                if (!selected) return;

                // 1. Custom Stroke Color Picker
                const colorRow = document.createElement('div');
                colorRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
                
                const colorLabel = document.createElement('span');
                {t('editPdf.strokeColorLabel')}
                
                const colorPicker = document.createElement('input');
                colorPicker.type = 'color';
                colorPicker.style.cssText = 'width:50px; height:24px; border:1px solid #ccc; border-radius:4px; padding:0; cursor:pointer;';
                colorPicker.value = selected.style?.color || '#ff0000';

                colorPicker.addEventListener('change', function(e) {
                  const curSelected = window.pdfjsAnnotationExtensionInstance?.selectedAnnotation;
                  if (curSelected) {
                    window.pdfjsAnnotationExtensionInstance.updateAnnotationStyle(curSelected, { color: e.target.value });
                  }
                });

                colorRow.appendChild(colorLabel);
                colorRow.appendChild(colorPicker);
                container.appendChild(colorRow);

                // 2. Allow stroke width of 0 by adjusting native slider min
                const nativeSliders = menu.querySelectorAll('input[type="range"]');
                nativeSliders.forEach(slider => {
                  if (slider.getAttribute('min') === '1') {
                    slider.setAttribute('min', '0');
                    console.log('[PDFCraft Patch] Stroke width slider updated min to 0');
                  }
                });

                // 3. Shape Fill support (Rectangle, Circle, Cloud)
                const allowedFillTools = ['rectangle', 'circle', 'cloud'];
                if (allowedFillTools.includes(selected.name)) {
                  const fillRow = document.createElement('div');
                  fillRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px;';
                  
                  const leftPart = document.createElement('div');
                  leftPart.style.cssText = 'display:flex; align-items:center; gap:6px;';
                  
                  const fillCheckbox = document.createElement('input');
                  fillCheckbox.type = 'checkbox';
                  fillCheckbox.id = 'pdfcraft-fill-enabled';
                  fillCheckbox.style.cssText = 'cursor:pointer;';
                  fillCheckbox.checked = selected.style?.fillEnabled || false;
                  
                  const fillLabel = document.createElement('label');
                  fillLabel.htmlFor = 'pdfcraft-fill-enabled';
                  {t('editPdf.fillColorLabel')}
                  fillLabel.style.cssText = 'cursor:pointer; user-select:none;';

                  leftPart.appendChild(fillCheckbox);
                  leftPart.appendChild(fillLabel);

                  const fillColorPicker = document.createElement('input');
                  fillColorPicker.type = 'color';
                  fillColorPicker.style.cssText = 'width:50px; height:24px; border:1px solid #ccc; border-radius:4px; padding:0; cursor:pointer;';
                  fillColorPicker.value = selected.style?.fillColor || '#ffffff';
                  fillColorPicker.disabled = !fillCheckbox.checked;

                  fillCheckbox.addEventListener('change', function(e) {
                    fillColorPicker.disabled = !e.target.checked;
                    const curSelected = window.pdfjsAnnotationExtensionInstance?.selectedAnnotation;
                    if (curSelected) {
                      window.pdfjsAnnotationExtensionInstance.updateAnnotationStyle(curSelected, {
                        fillEnabled: e.target.checked,
                        fillColor: fillColorPicker.value
                      });
                    }
                  });

                  fillColorPicker.addEventListener('change', function(e) {
                    const curSelected = window.pdfjsAnnotationExtensionInstance?.selectedAnnotation;
                    if (curSelected && fillCheckbox.checked) {
                      window.pdfjsAnnotationExtensionInstance.updateAnnotationStyle(curSelected, {
                        fillColor: e.target.value
                      });
                    }
                  });

                  fillRow.appendChild(leftPart);
                  fillRow.appendChild(fillColorPicker);
                  container.appendChild(fillRow);
                }

                const styleContainer = menu.querySelector('.styleContainer') || menu;
                styleContainer.appendChild(container);
              }

              // D. Undo/Redo & Comment list labels auto-override
              function getAnnotationsSnapshot() {
                const ext = window.pdfjsAnnotationExtensionInstance;
                if (!ext) return null;
                const store = ext.getAnnotationStore();
                if (!store) return null;
                return JSON.stringify(store);
              }

              function setupUndoRedoAndAuthorPatch() {
                // Initialize undo stack with initial state
                const initialState = getAnnotationsSnapshot();
                if (initialState) {
                  undoStack.push(initialState);
                  lastStateStr = initialState;
                }

                // Periodically check for state changes and update UI elements
                setInterval(() => {
                  const ext = window.pdfjsAnnotationExtensionInstance;
                  if (!ext) return;

                  // Dynamic author override for tool name labels in comments list
                  const store = ext.getAnnotationStore();
                  let authorUpdated = false;
                  if (store && store.annotations) {
                    store.annotations.forEach(ann => {
                      const transName = toolNameTranslations[ann.name] || '${t('editPdf.annDefault')}';
                      const targetAuthor = transName + ' (${t('editPdf.unnamedUser')})';
                      if (ann.author !== targetAuthor && ann.author === '${t('editPdf.unnamedUser')}') {
                        ann.author = targetAuthor;
                        authorUpdated = true;
                      }
                    });
                  }

                  const currentState = getAnnotationsSnapshot();
                  if (currentState && currentState !== lastStateStr) {
                    if (!isDoingUndoRedo) {
                      undoStack.push(currentState);
                      redoStack = []; // Reset redo stack on new operation
                      updateUndoRedoButtonsState();
                    }
                    lastStateStr = currentState;
                  }
                }, 500);

                // Inject Undo/Redo buttons UI
                injectUndoRedoButtons();
              }

              function performUndo() {
                if (undoStack.length <= 1) return;
                isDoingUndoRedo = true;
                const current = undoStack.pop();
                redoStack.push(current);
                const prev = undoStack[undoStack.length - 1];
                loadState(prev);
              }

              function performRedo() {
                if (redoStack.length === 0) return;
                isDoingUndoRedo = true;
                const next = redoStack.pop();
                undoStack.push(next);
                loadState(next);
              }

              function loadState(stateStr) {
                const ext = window.pdfjsAnnotationExtensionInstance;
                if (!ext) return;

                try {
                  const stateObj = JSON.parse(stateStr);
                  if (typeof ext.resetPdfjsAnnotationStorage === 'function') {
                    ext.resetPdfjsAnnotationStorage();
                  }
                  if (typeof ext.initAnnotations === 'function') {
                    ext.initAnnotations(stateObj);
                  }
                  if (typeof ext.reDrawAnnotation === 'function') {
                    ext.reDrawAnnotation();
                  }
                  lastStateStr = stateStr;
                  updateUndoRedoButtonsState();
                } catch (err) {
                  console.error('[PDFCraft Patch] Failed to load state', err);
                } finally {
                  setTimeout(() => {
                    isDoingUndoRedo = false;
                  }, 100);
                }
              }

              function injectUndoRedoButtons() {
                const customToolbar = document.querySelector('.CustomToolbar');
                if (customToolbar) {
                  if (customToolbar.querySelector('.pdfcraft-undo-btn')) return;
                  const btnList = customToolbar.querySelector('ul') || customToolbar;

                  const undoLi = document.createElement('li');
                  undoLi.className = 'pdfcraft-undo-btn';
                  undoLi.style.cssText = 'display:inline-block; margin-right:8px;';

                  const undoBtn = document.createElement('button');
                  undoBtn.type = 'button';
                  undoBtn.innerHTML = '<span style="margin-right:2px; font-weight:bold;">↩</span>${t('editPdf.undo')}';
                  undoBtn.className = 'toolbarButton';
                  undoBtn.style.cssText = 'padding:4px 8px; font-size:12px; cursor:pointer; border-radius:4px; opacity:0.5; border:1px solid var(--toolbar-border-color, #ccc); background-color:var(--toolbar-bg-color, #f5f5f5); color:var(--toolbar-fg-color, #333); font-family:inherit;';
                  undoBtn.disabled = true;
                  undoBtn.addEventListener('click', performUndo);
                  undoLi.appendChild(undoBtn);

                  const redoLi = document.createElement('li');
                  redoLi.className = 'pdfcraft-redo-btn';
                  redoLi.style.cssText = 'display:inline-block; margin-right:8px;';

                  const redoBtn = document.createElement('button');
                  redoBtn.type = 'button';
                  redoBtn.innerHTML = '<span style="margin-right:2px; font-weight:bold;">↪</span>${t('editPdf.redo')}';
                  redoBtn.className = 'toolbarButton';
                  redoBtn.style.cssText = 'padding:4px 8px; font-size:12px; cursor:pointer; border-radius:4px; opacity:0.5; border:1px solid var(--toolbar-border-color, #ccc); background-color:var(--toolbar-bg-color, #f5f5f5); color:var(--toolbar-fg-color, #333); font-family:inherit;';
                  redoBtn.disabled = true;
                  redoBtn.addEventListener('click', performRedo);
                  redoLi.appendChild(redoBtn);

                  if (btnList.firstChild) {
                    btnList.insertBefore(undoLi, btnList.firstChild);
                    btnList.insertBefore(redoLi, undoLi.nextSibling);
                  } else {
                    btnList.appendChild(undoLi);
                    btnList.appendChild(redoLi);
                  }
                }
              }

              function updateUndoRedoButtonsState() {
                const undoBtn = document.querySelector('.pdfcraft-undo-btn button');
                const redoBtn = document.querySelector('.pdfcraft-redo-btn button');
                
                if (undoBtn) {
                  const canUndo = undoStack.length > 1;
                  undoBtn.disabled = !canUndo;
                  undoBtn.style.opacity = canUndo ? '1' : '0.5';
                }
                if (redoBtn) {
                  const canRedo = redoStack.length > 0;
                  redoBtn.disabled = !canRedo;
                  redoBtn.style.opacity = canRedo ? '1' : '0.5';
                }
              }
            })();
          `;
          doc.body.appendChild(patchScript);
          console.log('[PDFCraft Patch] Enrichment script successfully injected into iframe!');
        }
      } catch (e) {
        console.warn('Could not access iframe content to inject patches', e);
      }
    }, 1000);
  }, []);

  const handleClear = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFile(null);
    setPdfUrl(null);
    setError(null);
    setIsEditorReady(false);
    setTextEdits([]);
    setTextEditStatus(null);
    lastTextSelectionRef.current = null;
  }, [pdfUrl]);

  const captureSelectedText = useCallback(() => {
    try {
      const iframeWindow = iframeRef.current?.contentWindow;
      const selection = iframeWindow?.getSelection();
      const liveEdit = iframeWindow && selection && selection.rangeCount > 0 && !selection.isCollapsed
        ? createTextEditFromSelection(iframeWindow, selection)
        : null;
      const edit = liveEdit || lastTextSelectionRef.current;
      if (!edit) {
        throw new Error('请先在 PDF 页面中拖动选中一行可选文字。');
      }

      setTextEdits(current => [...current, edit]);
      setError(null);
      setTextEditStatus(`已读取第 ${edit.pageNumber} 页文字，请在下方输入替换内容。`);
      lastTextSelectionRef.current = null;
      selection?.removeAllRanges();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : '读取文字选区失败。');
    }
  }, [t]);

  const updateTextEdit = useCallback((id: string, replacementText: string) => {
    setTextEdits(current => current.map(edit =>
      edit.id === id ? { ...edit, replacementText } : edit
    ));
    setTextEditStatus(null);
  }, []);

  const removeTextEdit = useCallback((id: string) => {
    setTextEdits(current => current.filter(edit => edit.id !== id));
    setTextEditStatus(null);
  }, []);

  const applyAndDownloadTextEdits = useCallback(async () => {
    if (!file) return;

    const pendingEdits = textEdits.filter(edit => edit.replacementText !== edit.originalText);
    if (!pendingEdits.length) {
      setError('没有待应用的文字修改。修改替换内容，或将替换内容清空以删除原文字。');
      return;
    }

    setIsApplyingTextEdits(true);
    setError(null);
    setTextEditStatus('正在永久删除原文字并生成新的 PDF，首次加载引擎可能需要一点时间...');

    try {
      const { loadPyMuPDF } = await import('@/lib/pdf/pymupdf-loader');
      const pymupdf = await loadPyMuPDF();
      const result = await pymupdf.editPdfText(file, pendingEdits);
      const outputName = `${file.name.replace(/\.pdf$/i, '')}_文字已编辑.pdf`;
      const downloadUrl = URL.createObjectURL(result.pdf);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = outputName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

      const editedFile = new File([result.pdf], outputName, { type: 'application/pdf' });
      setFile(editedFile);
      setPdfUrl(URL.createObjectURL(editedFile));
      setTextEdits([]);
      setIsEditorReady(false);
      setTextEditStatus(
        result.warnings.length
          ? `已下载并重新载入。提示：${result.warnings.join('；')}`
          : '文字修改已写入、下载，并重新载入到编辑器。'
      );
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : '应用文字修改失败。');
      setTextEditStatus(null);
    } finally {
      setIsApplyingTextEdits(false);
    }
  }, [file, textEdits]);

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {!file && (
        <FileUploader
          accept={['application/pdf', '.pdf']}
          multiple={false}
          maxFiles={1}
          onFilesSelected={handleFilesSelected}
          onError={handleUploadError}
          label={tTools('uploadLabel')}
          description={tTools('uploadDescription')}
        />
      )}

      {error && (
        <div className="p-4 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700" role="alert">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {file && pdfUrl && (
        <div className="space-y-4">
          <Card variant="outlined" size="sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
                  <path d="M14 2v6h6" fill="white" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--color-foreground))]">{file.name}</p>
                  <p className="text-xs text-[hsl(var(--color-muted-foreground))]">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                {t('buttons.clear') || 'Clear'}
              </Button>
            </div>
          </Card>

          <Card variant="outlined" size="sm">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--color-foreground))]">修改 PDF 原文字</p>
                  <p className="mt-1 text-xs leading-5 text-[hsl(var(--color-muted-foreground))]">
                    在下方 PDF 中选中一行可选文字，再点击“读取选中文字”。清空替换内容表示永久删除。请先完成原文修改，再添加普通标注。
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={captureSelectedText}
                    disabled={!isEditorReady || isApplyingTextEdits}
                  >
                    读取选中文字
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyAndDownloadTextEdits}
                    loading={isApplyingTextEdits}
                    disabled={!textEdits.some(edit => edit.replacementText !== edit.originalText)}
                  >
                    应用并下载
                  </Button>
                </div>
              </div>

              {textEdits.length > 0 && (
                <div className="space-y-2">
                  {textEdits.map(edit => (
                    <div
                      key={edit.id}
                      className="grid gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-white/45 p-3 md:grid-cols-[56px_minmax(0,1fr)_24px_minmax(0,1fr)_auto] md:items-center"
                    >
                      <span className="text-xs font-medium text-[hsl(var(--color-muted-foreground))]">第 {edit.pageNumber} 页</span>
                      <div className="min-w-0 rounded-md bg-black/5 px-2 py-1.5 text-sm text-[hsl(var(--color-foreground))]" title={edit.originalText}>
                        <span className="block truncate">{edit.originalText}</span>
                      </div>
                      <span className="hidden text-center text-sm text-[hsl(var(--color-muted-foreground))] md:block">→</span>
                      <input
                        type="text"
                        value={edit.replacementText}
                        onChange={event => updateTextEdit(edit.id, event.target.value)}
                        placeholder="留空表示删除"
                        aria-label={`第 ${edit.pageNumber} 页替换文字`}
                        className="min-w-0 rounded-md border border-[hsl(var(--color-border))] bg-white px-2 py-1.5 text-sm text-[hsl(var(--color-foreground))] outline-none focus:ring-2 focus:ring-[hsl(var(--color-ring))]"
                      />
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => updateTextEdit(edit.id, '')}>
                          删除原文
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeTextEdit(edit.id)} aria-label="移除此项修改">
                          ×
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {textEditStatus && (
                <p className="text-xs leading-5 text-[hsl(var(--color-primary))]" role="status">{textEditStatus}</p>
              )}
            </div>
          </Card>

          {/* PDF Viewer iframe */}
          <div className="relative border border-[hsl(var(--color-border))] rounded-[var(--radius-md)] overflow-hidden bg-gray-100">
            <iframe
              ref={iframeRef}
              src={`/pdfjs-annotation-viewer/web/viewer.html?file=${encodeURIComponent(pdfUrl)}`}
              className="w-full h-[700px] border-0"
              title="PDF Editor"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              onLoad={handleIframeLoad}
            />
            {!isEditorReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[hsl(var(--color-primary))] mx-auto mb-2"></div>
                  <p className="text-sm text-[hsl(var(--color-muted-foreground))]">{t('status.loading') || 'Loading...'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EditPDFTool;
