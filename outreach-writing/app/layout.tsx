import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VC Outreach Email Generator',
  description: 'Generate personalized outreach emails to startups',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
