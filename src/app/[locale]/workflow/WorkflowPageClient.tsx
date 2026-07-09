'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Home, Wrench, HelpCircle, FileText, GitBranch } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';

// 动态导入 WorkflowEditor 以避免 SSR 问题（ReactFlow 需要 window 对象）
const WorkflowEditor = dynamic(
    () => import('@/components/workflow/WorkflowEditor').then(mod => mod.WorkflowEditor),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-3 border-[hsl(var(--color-primary))] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[hsl(var(--color-muted-foreground))]">Loading workflow editor...</p>
                </div>
            </div>
        )
    }
);

interface WorkflowPageClientProps {
    locale: Locale;
}

export default function WorkflowPageClient({ locale }: WorkflowPageClientProps) {
    const t = useTranslations('common');
    const tWorkflow = useTranslations('workflow');

    return (
        <div className="h-screen flex flex-col">
            {/* Compact Top Navigation Bar - 48px */}
            <header className="h-12 flex-shrink-0 border-b border-[hsl(var(--color-border))/0.5] bg-[hsl(var(--color-background))]/80 backdrop-blur-md px-4 flex items-center justify-center">
                {/* Center: Tools & Workflow Switcher */}
                <div className="flex items-center justify-center">
                    <nav className="flex items-center gap-0.5 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))/0.5] p-0.5 shadow-sm backdrop-blur-sm">
                        <Link
                            href={`/${locale}/tools`}
                            className="px-3 py-1 text-xs font-medium text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.5] rounded-full transition-all"
                        >
                            {t('navigation.tools')}
                        </Link>
                        <Link
                            href={`/${locale}/workflow`}
                            className="px-3 py-1 text-xs font-semibold bg-[hsl(var(--color-primary))/0.12] text-[hsl(var(--color-primary))] rounded-full transition-all"
                        >
                            {t('navigation.workflow') || 'Workflow'}
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Workflow Editor - fills remaining height */}
            <main id="main-content" className="flex-1 overflow-hidden" tabIndex={-1}>
                <WorkflowEditor />
            </main>
        </div>
    );
}
