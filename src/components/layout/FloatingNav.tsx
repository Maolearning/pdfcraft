import React from 'react';
import Script from 'next/script';
import { type Locale } from '@/lib/i18n/config';

interface FloatingNavProps {
  locale: Locale;
}

export const FloatingNav: React.FC<FloatingNavProps> = () => (
  <>
    {React.createElement('site-dock')}
    <Script
      id="shared-site-dock"
      src="https://081400.xyz/assets/components/site-dock.js"
      strategy="afterInteractive"
    />
  </>
);

export default FloatingNav;
