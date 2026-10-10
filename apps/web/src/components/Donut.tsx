/**
 * Cirkel met de hele sessietijd (grijs) en daarop de gespeelde tijd in kleur.
 * Gebruikt in de samenvatting van vrij oefenen, het dashboard en het detailpaneel.
 */
export function Donut({ percent, size = 40, stroke, color = "var(--color-ok)", children }:
  { percent: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const w = stroke ?? Math.max(4, Math.round(size / 9));
  const r = (size - w) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, percent));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}
      role="img" aria-label={`${p}% van de tijd gespeeld`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={w} />
        {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={w} strokeLinecap={p < 100 ? "round" : "butt"}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDasharray={`${(c * p) / 100} ${c}`} />}
      </svg>
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</span>}
    </span>
  );
}
