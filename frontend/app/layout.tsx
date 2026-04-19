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
  title: 'PRISM — Process Reliability Index for Supplier Models',
  description:
    'Six Sigma process control applied to LLM selection. Measure model capability (Cpk), sigma level, and DPMO before you deploy.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-panel text-neutral-200 font-sans antialiased">
        <nav className="border-b border-panel-border bg-panel">
          <div className="max-w-7xl mx-auto px-6 py-2 font-mono text-[11px] uppercase tracking-widest text-neutral-400 flex items-center gap-3">
            <Link
              href="/"
              className="hover:text-neutral-100 transition-colors"
            >
              PRISM
            </Link>
            <span className="text-neutral-700">|</span>
            <Link
              href="/dashboard"
              className="hover:text-neutral-100 transition-colors"
            >
              Dashboard
            </Link>
            <span className="text-neutral-700">|</span>
            <Link
              href="/memory/qwen-2.5-72b"
              className="hover:text-neutral-100 transition-colors"
            >
              Memory Explorer
            </Link>
            <span className="text-neutral-700">|</span>
            <Link
              href="/admin"
              className="hover:text-neutral-100 transition-colors"
            >
              Control Plan
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
