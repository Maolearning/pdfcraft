'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Search, X, Filter, Star } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToolGrid } from '@/components/tools/ToolGrid';
import { ToolCard } from '@/components/tools/ToolCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getAllTools, getToolsByCategory, getToolById } from '@/config/tools';
import { toolMatchesQuery } from '@/lib/utils/search';
import { type Locale } from '@/lib/i18n/config';
import { CATEGORY_INFO, type ToolCategory } from '@/types/tool';
import { useFavorites } from '@/hooks/useFavorites';

type CategoryFilter = ToolCategory | 'all' | 'favorites';

interface ToolsPageClientProps {
  locale: Locale;
  localizedToolContent?: Record<string, { title: string; description: string }>;
}

export default function ToolsPageClient({ locale, localizedToolContent }: ToolsPageClientProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const allTools = getAllTools();
  const { favorites, isLoaded: favoritesLoaded, favoritesCount } = useFavorites();

  const categoryTranslationKeys: Record<ToolCategory, string> = {
    'edit-annotate': 'editAnnotate',
    'convert-to-pdf': 'convertToPdf',
    'convert-from-pdf': 'convertFromPdf',
    'organize-manage': 'organizeManage',
    'optimize-repair': 'optimizeRepair',
    'secure-pdf': 'securePdf',
  };

  // Read initial values from URL search params (client-side)
  const initialCategory = searchParams.get('category') || 'all';
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(
    (initialCategory as ToolCategory) || 'all'
  );

  // Sync state with URL params when they change
  useEffect(() => {
    const category = searchParams.get('category') || 'all';
    const query = searchParams.get('q') || '';
    setSelectedCategory(category as CategoryFilter);
    setSearchQuery(query);
  }, [searchParams]);
  const [showFilters, setShowFilters] = useState(false);

  // Filter tools based on search and category
  const filteredTools = useMemo(() => {
    let tools = allTools;

    // Filter by category
    if (selectedCategory === 'favorites') {
      // Filter to only show favorite tools
      tools = favorites
        .map(id => getToolById(id))
        .filter((tool): tool is NonNullable<typeof tool> => tool !== undefined);
    } else if (selectedCategory !== 'all') {
      tools = getToolsByCategory(selectedCategory as ToolCategory);
    }

    // Filter by search query (supports current language search)
    if (searchQuery.trim()) {
      tools = tools.filter(tool =>
        toolMatchesQuery(tool, searchQuery, localizedToolContent?.[tool.id])
      );
    }

    return tools;
  }, [allTools, selectedCategory, searchQuery, favorites]);

  // Category options
  const categories: { value: CategoryFilter; label: string; icon?: React.ReactNode }[] = [
    { value: 'all', label: t('toolsPage.allTools') },
    {
      value: 'favorites',
      label: t('tools.favorite.title'),
      icon: <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
    },
    { value: 'edit-annotate', label: t('home.categories.editAnnotate') },
    { value: 'convert-to-pdf', label: t('home.categories.convertToPdf') },
    { value: 'convert-from-pdf', label: t('home.categories.convertFromPdf') },
    { value: 'organize-manage', label: t('home.categories.organizeManage') },
    { value: 'optimize-repair', label: t('home.categories.optimizeRepair') },
    { value: 'secure-pdf', label: t('home.categories.securePdf') },
  ];

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('all');
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header locale={locale} />

      <main className="flex-1 max-w-[1360px] mx-auto w-full px-4 pt-28 pb-16 relative">
        {/* Animated Background Blobs (Subtle) */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[hsl(var(--color-primary)/0.05)] rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[hsl(var(--color-accent)/0.05)] rounded-full mix-blend-multiply filter blur-3xl opacity-50" />
        </div>

        <div className="bg-[hsl(var(--color-card))]/90 backdrop-blur-md border border-[hsl(var(--color-border))/0.6] rounded-[24px] p-6 md:p-8 flex flex-col gap-8 shadow-xl">
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto w-full">
            <div className="relative group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-[hsl(var(--color-primary))] group-focus-within:text-[hsl(var(--color-primary))] transition-colors z-10" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('tools.search.placeholder')}
                className="w-full pl-14 pr-12 py-3.5 text-base rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))]/60 text-[hsl(var(--color-foreground))] placeholder:text-[hsl(var(--color-muted-foreground))] shadow-md focus:outline-none focus:ring-4 focus:ring-[hsl(var(--color-primary)/0.15)] focus:border-[hsl(var(--color-primary))] transition-all"
                aria-label="Search tools"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-[hsl(var(--color-muted))] rounded-full transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-5 w-5 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Filters and Tools Grid */}
          <div>
            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center gap-6 mb-8 py-3.5 px-5 rounded-2xl bg-[hsl(var(--color-background))]/40 border border-[hsl(var(--color-border))/0.4] transition-all">
              {/* Mobile Filter Toggle */}
              <Button
                variant="outline"
                className="md:hidden w-full"
                onClick={() => setShowFilters(!showFilters)}
                aria-expanded={showFilters}
                aria-controls="category-filters"
              >
                <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('toolsPage.filters')}
              </Button>

              {/* Category Filters */}
              <div
                className={`flex flex-wrap gap-2 ${showFilters ? 'block w-full' : 'hidden md:flex flex-1'}`}
                role="group"
                aria-label="Filter by category"
              >
                {categories.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setSelectedCategory(cat.value)}
                    aria-pressed={selectedCategory === cat.value}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5
                      ${selectedCategory === cat.value
                        ? cat.value === 'favorites'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shadow-md'
                          : 'bg-[hsl(var(--color-primary))] text-white shadow-md shadow-primary/25'
                        : 'bg-[hsl(var(--color-muted))]/60 text-[hsl(var(--color-foreground))]/80 hover:bg-[hsl(var(--color-muted))] hover:text-[hsl(var(--color-foreground))]'
                      }
                    `}
                  >
                    {cat.icon}
                    {cat.label}
                    {cat.value === 'favorites' && favoritesLoaded && (
                      <span className={`ml-0.5 text-xs ${selectedCategory === cat.value ? 'opacity-100' : 'opacity-60'}`}>
                        ({favoritesCount})
                      </span>
                    )}
                    {cat.value !== 'all' && cat.value !== 'favorites' && (
                      <span className={`ml-0.5 text-xs ${selectedCategory === cat.value ? 'opacity-100' : 'opacity-60'}`}>
                        ({getToolsByCategory(cat.value as ToolCategory).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Clear Filters */}
              {(searchQuery || selectedCategory !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="ml-auto text-sm text-[hsl(var(--color-muted-foreground))]"
                >
                  {t('toolsPage.clearAll')}
                </Button>
              )}
            </div>

            {/* Results Count */}
            <div className="mb-6 px-2">
              <p className="text-sm text-[hsl(var(--color-muted-foreground))]">
                {selectedCategory === 'favorites'
                  ? `${filteredTools.length} ${t('tools.favorite.title').toLowerCase()}`
                  : filteredTools.length === allTools.length
                    ? t('toolsPage.showingAll', { count: allTools.length })
                    : t('toolsPage.showingFiltered', { filtered: filteredTools.length, total: allTools.length })}
                {searchQuery && ` ${t('toolsPage.forQuery', { query: searchQuery })}`}
                {selectedCategory !== 'all' && selectedCategory !== 'favorites' && ` ${t('toolsPage.inCategory', { category: t(`home.categories.${categoryTranslationKeys[selectedCategory as ToolCategory]}`) })}`}
              </p>
            </div>

            {/* Tools Grid */}
            {filteredTools.length > 0 ? (
              selectedCategory === 'all' && !searchQuery ? (
                // Show grouped by category when no filters
                <ToolGrid
                  tools={filteredTools}
                  locale={locale}
                  localizedToolContent={localizedToolContent}
                  showCategoryHeaders
                />
              ) : (
                // Show flat grid when filtered
                <ToolGrid
                  tools={filteredTools}
                  locale={locale}
                  localizedToolContent={localizedToolContent}
                />
              )
            ) : selectedCategory === 'favorites' ? (
              // Empty favorites state
              <Card className="p-16 text-center glass-card border-dashed border-2">
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6">
                    <Star className="h-10 w-10 text-amber-500" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-[hsl(var(--color-foreground))] mb-2">
                    {t('tools.favorite.empty')}
                  </h3>
                  <p className="text-[hsl(var(--color-muted-foreground))] mb-8">
                    {t('tools.favorite.hint')}
                  </p>
                  <Button variant="outline" onClick={() => setSelectedCategory('all')} className="px-8">
                    {t('toolsPage.allTools')}
                  </Button>
                </div>
              </Card>
            ) : (
              // No results
              <Card className="p-16 text-center glass-card border-dashed border-2">
                <div className="max-w-md mx-auto flex flex-col items-center">
                  <div className="w-20 h-20 bg-[hsl(var(--color-muted))] rounded-full flex items-center justify-center mb-6">
                    <Search className="h-10 w-10 text-[hsl(var(--color-muted-foreground))]" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-[hsl(var(--color-foreground))] mb-2">
                    {t('toolsPage.noToolsFound')}
                  </h3>
                  <p className="text-[hsl(var(--color-muted-foreground))] mb-8">
                    {t('tools.search.noResults', { query: searchQuery })}
                  </p>
                  <Button variant="outline" onClick={handleClearFilters} className="px-8">
                    {t('toolsPage.clearFilters')}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Footer locale={locale} />
    </div>
  );
}
