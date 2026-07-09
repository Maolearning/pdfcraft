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
            {/* Compact Top Navigation Bar - 56px */}
            <header className="h-14 flex-shrink-0 border-b border-[hsl(var(--color-border))/0.5] bg-[hsl(var(--color-background))] px-4 flex items-center justify-center">
                {/* Center: Tools & Workflow Switcher */}
                <div className="flex items-center justify-center">
                    <nav className="flex items-center gap-1 rounded-full border border-[hsl(var(--color-border))/0.4] bg-[hsl(var(--color-background))]/85 p-1.5 backdrop-blur-sm shadow-sm transition-all duration-300">
                        <Link
                            href={`/${locale}/tools`}
                            className="px-4 py-1.5 text-sm font-medium rounded-full text-[hsl(var(--color-foreground))]/70 hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))/0.5] transition-all"
                        >
                            {t('navigation.tools')}
                        </Link>
                        <Link
                            href={`/${locale}/workflow`}
                            className="px-4 py-1.5 text-sm font-semibold rounded-full bg-[hsl(var(--color-primary)/0.12)] text-[hsl(var(--color-primary))] transition-all"
                        >
                            {t('navigation.workflow') || 'Workflow'}
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Workflow Editor - fills remaining height */}
            <main id="main-content" className="flex-1 overflow-hidden bg-[hsl(var(--color-background))]" tabIndex={-1}>
                <WorkflowEditor />
            </main>
        </div>
    );
}
