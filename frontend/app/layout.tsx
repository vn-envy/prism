import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PRISM — Model Qualification for Production AI',
  description:
    'Six Sigma process control applied to LLM selection. Measure Cpk, sigma level, and DPMO before you deploy.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-panel text-neutral-200 font-sans antialiased grain">
        <nav className="sticky top-0 z-50 border-b border-panel-border/60 bg-panel/70 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
            <Link
              href="/"
              className="text-gradient font-bold text-brand-400 hover:text-brand-300 transition-colors"
            >
              PRISM
            </Link>
            <span className="text-neutral-700 mx-1">·</span>
            <Link
              href="/dashboard"
              className="hover:text-neutral-100 transition-colors px-2 py-1"
            >
              Dashboard
            </Link>
            <span className="text-neutral-700 mx-1">·</span>
            <Link
              href="/catalog"
              className="hover:text-neutral-100 transition-colors px-2 py-1"
            >
              Pricing
            </Link>
            <span className="text-neutral-700 mx-1">·</span>
            <Link
              href="/traces"
              className="hover:text-neutral-100 transition-colors px-2 py-1"
            >
              History
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
