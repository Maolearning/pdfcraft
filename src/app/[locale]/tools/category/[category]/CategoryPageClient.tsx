'use client';

import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToolGrid } from '@/components/tools/ToolGrid';
import { getToolsByCategory } from '@/config/tools';
import { type Locale } from '@/lib/i18n/config';
import { type ToolCategory } from '@/types/tool';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface CategoryPageClientProps {
    locale: Locale;
    category: ToolCategory;
    localizedToolContent?: Record<string, { title: string; description: string }>;
}

export default function CategoryPageClient({ locale, category, localizedToolContent }: CategoryPageClientProps) {
    const t = useTranslations();
    const tools = getToolsByCategory(category);

    // Map categories to translation keys (matching ToolsPage structure)
    const categoryTranslationKeys: Record<ToolCategory, string> = {
        'edit-annotate': 'editAnnotate',
        'convert-to-pdf': 'convertToPdf',
        'convert-from-pdf': 'convertFromPdf',
        'organize-manage': 'organizeManage',
        'optimize-repair': 'optimizeRepair',
        'secure-pdf': 'securePdf',
    };

    const categoryName = t(`home.categories.${categoryTranslationKeys[category]}`);

    return (
        <div className="min-h-screen flex flex-col">
            <Header locale={locale} />

            <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 pt-28 pb-16 relative">
                <div className="bg-[hsl(var(--color-card))]/90 backdrop-blur-md border border-[hsl(var(--color-border))/0.6] rounded-[24px] p-6 md:p-8 flex flex-col gap-8 shadow-xl">
                    {/* Breadcrumb Navigation */}
                    <nav aria-label="Breadcrumb" className="flex items-center text-sm text-[hsl(var(--color-muted-foreground))] animate-in fade-in slide-in-from-top-4 duration-500 delay-100">
                        <Link
                            href={`/${locale}/tools`}
                            className="hover:text-[hsl(var(--color-primary))] transition-colors"
                        >
                            {t('common.navigation.tools')}
                        </Link>
                        <ChevronRight className="w-4 h-4 mx-2 text-[hsl(var(--color-border))]" />
                        <span className="font-medium text-[hsl(var(--color-foreground))] truncate max-w-[200px] sm:max-w-md" aria-current="page">
                            {categoryName}
                        </span>
                    </nav>

                    {/* Page Header */}
                    <header className="mb-2">
                        <h1 className="text-3xl font-bold text-[hsl(var(--color-foreground))] mb-2">
                            {categoryName}
                        </h1>
                        <p className="text-base text-[hsl(var(--color-muted-foreground))]">
                            {t(`home.categoriesDescription.${categoryTranslationKeys[category]}`)}
                        </p>
                    </header>

                    {/* Tools Grid */}
                    <ToolGrid
                        tools={tools}
                        locale={locale}
                        localizedToolContent={localizedToolContent}
                    />
                </div>
            </main>

            <Footer locale={locale} />
        </div>
    );
}
