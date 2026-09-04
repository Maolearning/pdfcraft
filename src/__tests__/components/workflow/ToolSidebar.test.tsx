import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolSidebar } from '@/components/workflow/ToolSidebar';

vi.mock('@/config/tools', () => ({
  tools: [
    {
      id: 'merge-pdf',
      category: 'organize-manage',
      icon: 'merge',
      acceptedFormats: ['pdf'],
      outputFormat: 'pdf',
    },
  ],
}));

vi.mock('@/config/tool-content', () => ({
  getToolContent: () => ({ title: 'Merge PDF' }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

describe('ToolSidebar', () => {
  it('emits a fallback pointer drop event when native drag/drop is unavailable', () => {
    const dispatchPointerEvent = (
      target: EventTarget,
      type: string,
      init: PointerEventInit,
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.entries(init).forEach(([key, value]) => {
        Object.defineProperty(event, key, { configurable: true, value });
      });
      target.dispatchEvent(event);
    };

    const handleFallbackDrop = vi.fn();
    window.addEventListener('workflow-tool-drop', handleFallbackDrop);

    render(
      <ToolSidebar
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />
    );

    const mergeTool = screen.getByText('Merge PDF');
    dispatchPointerEvent(mergeTool, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 120,
    });
    dispatchPointerEvent(window, 'pointermove', {
      pointerId: 1,
      clientX: 340,
      clientY: 220,
    });
    dispatchPointerEvent(window, 'pointerup', {
      pointerId: 1,
      clientX: 340,
      clientY: 220,
    });

    expect(handleFallbackDrop).toHaveBeenCalledTimes(1);
    expect(handleFallbackDrop.mock.calls[0][0]).toMatchObject({
      detail: {
        clientX: 340,
        clientY: 220,
        nodeData: expect.objectContaining({
          toolId: 'merge-pdf',
          label: 'Merge PDF',
        }),
      },
    });

    window.removeEventListener('workflow-tool-drop', handleFallbackDrop);
  });
});
