'use client';

import React from 'react';
import { type Locale } from '@/lib/i18n/config';

interface FloatingNavProps {
  locale: Locale;
}

export const FloatingNav: React.FC<FloatingNavProps> = ({ locale }) => {
  const navItems = [
    {
      label: '首页',
      href: 'https://081400.xyz/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      active: false
    },
    {
      label: '形式发票',
      href: 'https://081400.xyz/pi/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      ),
      active: false
    },
    {
      label: '文本对比',
      href: 'https://081400.xyz/text-compare/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2" ry="2"></rect>
          <line x1="12" y1="3" x2="12" y2="21"></line>
        </svg>
      ),
      active: false
    },
    {
      label: '商品生图',
      href: 'https://081400.xyz/ai-model/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
        </svg>
      ),
      active: false
    },
    {
      label: '消除笔',
      href: 'https://081400.xyz/watermark-remover/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
          <path d="m16 20 5-5"></path>
        </svg>
      ),
      active: false
    },
    {
      label: 'PDF工具',
      href: `/${locale}`,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
      ),
      active: true // Active because we are currently on the pdf tools sub-app
    },
    {
      label: '会员中心',
      href: 'https://081400.xyz/member/',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      ),
      active: false
    }
  ];

  return (
    <div className="floating-nav" role="navigation" aria-label="Unified Navigation">
      {navItems.map((item, index) => (
        <a
          key={index}
          href={item.href}
          className={`floating-nav-btn ${item.active ? 'active' : ''}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
};

export default FloatingNav;
