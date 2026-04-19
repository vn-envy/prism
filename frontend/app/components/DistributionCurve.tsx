'use client';

interface DistributionCurveProps {
  mu: number;
  sigma: number;
  lsl: number;
  width?: number;
  height?: number;
}

/**
 * Industrial-style Gaussian distribution plot.
 *
 * Draws the normal distribution N(mu, sigma) as an SVG path, shades the
 * tail below LSL in red (the "defect zone"), and marks both LSL and mu
 * with vertical reference lines — like a control chart in an instrument
 * panel. The x-range auto-adjusts so every curve is visually comparable:
 * the tighter the sigma, the narrower and taller the bell.
 */
export default function DistributionCurve({
  mu,
  sigma,
  lsl,
  width = 300,
  height = 150,
}: DistributionCurveProps) {
  // Plot padding so lines/labels don't clip against the SVG edge.
  const padX = 8;
  const padTop = 14;
  const padBottom = 18;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  // Choose an x-range that always contains LSL plus ~±4σ around mu.
  // This keeps the comparison honest across models with very different σ.
  const xMin = Math.min(mu - 4 * sigma, lsl - sigma);
  const xMax = Math.max(mu + 4 * sigma, lsl + sigma);
  const xSpan = xMax - xMin;

  // Peak of N(mu, sigma) is 1 / (sigma * sqrt(2π)). We scale y to plotH so
  // that a small σ looks tall and narrow (low defect tail), a large σ looks
  // short and wide (fat defect tail crossing LSL).
  const peak = 1 / (sigma * Math.sqrt(2 * Math.PI));

  const xToPx = (x: number) => padX + ((x - xMin) / xSpan) * plotW;
  const yToPx = (y: number) => padTop + (1 - y / peak) * plotH;

  const pdf = (x: number) =>
    (1 / (sigma * Math.sqrt(2 * Math.PI))) *
    Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

  // Sample the curve densely enough for a smooth bell.
  const N = 140;
  const samples: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * xSpan;
    samples.push({ x, y: pdf(x) });
  }

  const curvePath = samples
    .map((p, i) => {
      const px = xToPx(p.x).toFixed(2);
      const py = yToPx(p.y).toFixed(2);
      return `${i === 0 ? 'M' : 'L'}${px},${py}`;
    })
    .join(' ');

  // Build the shaded "defect zone" polygon — area under the curve with x < LSL.
  const defectSamples = samples.filter((p) => p.x <= lsl);
  let defectPath = '';
  if (defectSamples.length > 0) {
    const baselineY = yToPx(0);
    const firstX = xToPx(defectSamples[0].x).toFixed(2);
    const lastX = xToPx(defectSamples[defectSamples.length - 1].x).toFixed(2);
    // Start at baseline-left, trace the curve, return along the baseline.
    const curveTrace = defectSamples
      .map((p) => `L${xToPx(p.x).toFixed(2)},${yToPx(p.y).toFixed(2)}`)
      .join(' ');
    // If LSL falls between two samples, close the shaded area exactly at LSL.
    const closeAtLslX = xToPx(lsl).toFixed(2);
    const closeAtLslY = yToPx(pdf(lsl)).toFixed(2);
    defectPath =
      `M${firstX},${baselineY} ` +
      curveTrace +
      ` L${closeAtLslX},${closeAtLslY}` +
      ` L${closeAtLslX},${baselineY}` +
      ` L${lastX},${baselineY} Z`;
  }

  const lslX = xToPx(lsl);
  const muX = xToPx(mu);
  const baselineY = yToPx(0);
  const topY = yToPx(peak);

  // Only render the "Defect zone" label if there's enough room to its left.
  const showDefectLabel = lslX - padX > 44;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Output distribution: mu=${mu}, sigma=${sigma}, LSL=${lsl}`}
      className="block"
    >
      {/* Baseline rule */}
      <line
        x1={padX}
        x2={width - padX}
        y1={baselineY}
        y2={baselineY}
        stroke="#262626"
        strokeWidth={1}
      />

      {/* Defect zone shading (under-curve, x < LSL) */}
      {defectPath && (
        <path
          d={defectPath}
          fill="#ef4444"
          fillOpacity={0.28}
          stroke="none"
        />
      )}

      {/* Bell curve outline */}
      <path
        d={curvePath}
        fill="none"
        stroke="#e5e5e5"
        strokeWidth={1.25}
      />

      {/* LSL — solid red vertical */}
      <line
        x1={lslX}
        x2={lslX}
        y1={padTop - 4}
        y2={baselineY}
        stroke="#ef4444"
        strokeWidth={1.25}
      />
      <text
        x={lslX}
        y={padTop - 5}
        fill="#ef4444"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
        letterSpacing="0.1em"
      >
        LSL
      </text>

      {/* μ — dashed white vertical at distribution center */}
      <line
        x1={muX}
        x2={muX}
        y1={topY}
        y2={baselineY}
        stroke="#e5e5e5"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.75}
      />
      <text
        x={muX}
        y={topY - 4}
        fill="#e5e5e5"
        fontSize={9}
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
        letterSpacing="0.1em"
      >
        μ
      </text>

      {/* "Defect zone" label, if fitting */}
      {showDefectLabel && (
        <text
          x={(padX + lslX) / 2}
          y={baselineY + 12}
          fill="#ef4444"
          fontSize={8.5}
          fontFamily="ui-monospace, monospace"
          textAnchor="middle"
          letterSpacing="0.12em"
          opacity={0.9}
        >
          DEFECT ZONE
        </text>
      )}
    </svg>
  );
}
