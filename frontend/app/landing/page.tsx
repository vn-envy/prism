import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-panel">
      {/* ---- Hero Section ---- */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="font-mono text-xs text-neutral-500 tracking-widest uppercase mb-6">
          PRISM &mdash; Process Reliability Index for Supplier Models
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-neutral-100 leading-tight tracking-tight max-w-4xl">
          The LLM industry is stuck in 1985.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-neutral-400 max-w-3xl leading-relaxed">
          PRISM applies 40 years of industrial quality engineering to model
          selection. For the first time.
        </p>
      </section>

      {/* ---- The Motorola Story ---- */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="panel p-6 md:p-8 border-l-2 border-sigma-3">
          <div className="label-engraved mb-3">The Origin</div>
          <p className="text-base md:text-lg text-neutral-300 leading-relaxed max-w-3xl">
            In 1986, Motorola invented Six Sigma because 99% quality still meant{' '}
            <span className="font-mono text-sigma-3">10,000 defects per million</span>.
            The LLM industry hasn&rsquo;t learned this lesson yet.
          </p>
        </div>
      </section>

      {/* ---- The Insight Visual: Two Model Cards ---- */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="label-engraved mb-4">The Insight</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Model A — Qualified */}
          <div className="panel p-5" style={{ borderTop: '2px solid #22c55e' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-neutral-400">Model A</span>
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 text-sigma-4 border border-sigma-4">
                Qualified supplier
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="panel-inset p-2">
                <div className="label-engraved">&mu;</div>
                <div className="readout text-2xl text-neutral-100">92</div>
              </div>
              <div className="panel-inset p-2">
                <div className="label-engraved">&sigma;</div>
                <div className="readout text-2xl text-neutral-100">2</div>
              </div>
              <div className="panel-inset p-2">
                <div className="label-engraved">Cpk</div>
                <div className="readout text-2xl text-sigma-4">1.17</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="led-dot bg-sigma-4" />
              <span className="font-mono text-[10px] text-neutral-500">
                Low variance &middot; predictable output &middot; within spec
              </span>
            </div>
          </div>

          {/* Model B — Unqualified */}
          <div className="panel p-5" style={{ borderTop: '2px solid #ef4444' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-neutral-400">Model B</span>
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 text-sigma-1 border border-sigma-1">
                Unqualified
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="panel-inset p-2">
                <div className="label-engraved">&mu;</div>
                <div className="readout text-2xl text-neutral-100">95</div>
              </div>
              <div className="panel-inset p-2">
                <div className="label-engraved">&sigma;</div>
                <div className="readout text-2xl text-neutral-100">8</div>
              </div>
              <div className="panel-inset p-2">
                <div className="label-engraved">Cpk</div>
                <div className="readout text-2xl text-sigma-1">0.42</div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="led-dot bg-sigma-1" />
              <span className="font-mono text-[10px] text-neutral-500">
                High variance &middot; unpredictable &middot; will fail in production
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 panel-inset p-3">
          <p className="font-mono text-sm text-neutral-400 text-center">
            Every leaderboard ranks Model B higher. Every quality engineer ranks Model A higher.
          </p>
        </div>
      </section>

      {/* ---- What PRISM Measures ---- */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="label-engraved mb-4">What PRISM Measures</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-5">
            <div className="readout text-3xl text-sigma-4 mb-2">Cpk</div>
            <div className="label-engraved mb-2">Process Capability</div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Can this model hit spec every single time? Cpk measures the
              distance between your performance floor and the model&rsquo;s
              natural variation. Higher means more headroom before failure.
            </p>
          </div>

          <div className="panel p-5">
            <div className="readout text-3xl text-sigma-3 mb-2">DPMO</div>
            <div className="label-engraved mb-2">Defects Per Million</div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              How many outputs will fail in production? DPMO translates
              statistical capability into a count any PM can understand.
              Lower is better. Way lower.
            </p>
          </div>

          <div className="panel p-5">
            <div className="readout text-3xl text-neutral-300 mb-2">GR&amp;R</div>
            <div className="label-engraved mb-2">Gauge R&amp;R (Measurement Validity)</div>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Can we trust the evaluation itself? Gauge R&amp;R checks
              whether measurement noise is small relative to model variance.
              Below 30% means the gauge is reliable.
            </p>
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="max-w-5xl mx-auto px-6 pb-20 text-center">
        <Link
          href="/dashboard"
          className="inline-block bevel bevel-focus px-8 py-3 font-mono text-sm uppercase tracking-widest text-neutral-100 hover:bg-panel-border transition-colors"
        >
          Evaluate Your Intent &rarr;
        </Link>
      </section>

      {/* ---- Footer ---- */}
      <footer className="max-w-5xl mx-auto px-6 py-8 border-t border-panel-border">
        <div className="font-mono text-[10px] text-neutral-600 tracking-widest uppercase leading-relaxed text-center">
          Built by Neekhil &middot; Six Sigma Black Belt &middot; 8 years Amazon &amp; Adobe &middot; Open Source: github.com/vn-envy/prism
        </div>
      </footer>
    </main>
  );
}
