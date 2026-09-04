'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { type Locale } from '@/lib/i18n/config';

export interface FooterProps {
  locale: Locale;
}

export const Footer: React.FC<FooterProps> = () => {
  const t = useTranslations('common');

  return (
    <footer className="hidden" aria-hidden="true">
      <span className="hidden" data-testid="footer-brand-name">{t('brand') || 'PDFCraft'}</span>
    </footer>
  );
};

export default Footer;
