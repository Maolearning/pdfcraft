import type { Metadata } from 'next';
import '@/app/globals.css';
import { FloatingNav } from '@/components/layout/FloatingNav';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'PDF处理',
  description: 'Free online PDF tools for merging, splitting, compressing, and converting PDF files. All processing happens in your browser for maximum privacy.',
  metadataBase: new URL(siteConfig.url),
  icons: {
    icon: '/favicon-32.png',
    shortcut: '/favicon-32.png',
    apple: '/apple-touch-icon.png',
  },
};

// Root layout - provides shared document structure and site-wide UI.
// Locale-specific providers and typography remain in [locale]/layout.tsx.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: 'html{scrollbar-gutter:stable}' }} />
          <script
            dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.classList.remove('dark')
              } catch (_) {}
            `,
            }}
          />
          <script
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/coi-serviceworker.js`}
            data-coi="true"
            async
          />
      </head>
      <body className="min-h-screen text-foreground antialiased">
        {children}
        <FloatingNav />
      </body>
    </html>
  );
}
