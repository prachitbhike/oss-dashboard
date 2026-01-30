'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Generate' },
  { href: '/emails', label: 'Saved Emails' },
  { href: '/analysis', label: 'Analysis' },
];

export default function Navigation() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="flex gap-6 border-b border-neutral-200">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`pb-3 text-sm font-medium transition-colors ${
            isActive(item.href)
              ? 'text-neutral-900 border-b-2 border-neutral-900'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
