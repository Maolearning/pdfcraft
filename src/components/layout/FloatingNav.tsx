import React from 'react';
import Script from 'next/script';

export const FloatingNav = () => (
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
