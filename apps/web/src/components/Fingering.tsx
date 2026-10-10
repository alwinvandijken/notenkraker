import type { Instrument, KeyedLayout, KeyShape } from "@notenkraker/core";

/**
 * Greeptekening. Eén renderer per layout-soort; nu alleen `keys` (sax, klarinet,
 * fluit …). Nieuwe instrumentfamilies krijgen hier een eigen renderer.
 */
export function Fingering({ instrument, pressed, needed, showAll = false }:
  { instrument: Instrument; pressed: string[]; needed?: Set<string>; showAll?: boolean }) {
  switch (instrument.layout.kind) {
    case "keys": return <KeyedFingering layout={instrument.layout} pressed={pressed} needed={needed} showAll={showAll} />;
    default: return <div className="text-muted text-center p-4">Nog geen tekening voor {instrument.name}.</div>;
  }
}

function KeyedFingering({ layout, pressed, needed, showAll }: { layout: KeyedLayout; pressed: string[]; needed?: Set<string>; showAll: boolean }) {
  const on = new Set(pressed.map((k) => layout.merge[k] ?? k));
  const visible = (k: KeyShape) => {
    if (on.has(k.id)) return true;
    if (k.optional) return false;
    if (k.auto) return showAll || (needed?.has(k.id) ?? false);
    return true;
  };
  const shownGroups = new Set(layout.keys.filter(visible).map((k) => k.group).filter(Boolean));
  const [vx, vy, vw, vh] = layout.viewBox;
  return (
    <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="block w-full max-w-[260px] mx-auto">
      {layout.axis && <line x1={layout.axis.x} x2={layout.axis.x} y1={layout.axis.y1} y2={layout.axis.y2} stroke="var(--color-line)" strokeWidth={2} />}
      {layout.captions.filter((c) => !c.group || shownGroups.has(c.group)).map((c) => (
        <text key={c.text} x={c.x} y={c.y} fontSize={9} fill="var(--color-muted)" textAnchor="middle">{c.text}</text>
      ))}
      {layout.keys.filter(visible).map((k) => {
        const isOn = on.has(k.id);
        const fill = isOn ? "var(--color-pressed)" : "var(--color-open)", ink = isOn ? "var(--color-open)" : "currentColor";
        if (k.shape === "circle") {
          const r = k.r ?? 10;
          return (
            <g key={k.id}>
              <circle cx={k.x} cy={k.y} r={r} fill={fill} stroke="currentColor" strokeWidth={2} />
              {k.label && <text x={k.x} y={k.y + (r > 10 ? 5 : 3)} fontSize={r > 10 ? 14 : 8} fontWeight={700} textAnchor="middle" fill={ink} fontFamily="var(--font-display)">{k.label}</text>}
            </g>
          );
        }
        const w = k.w ?? 30, h = k.h ?? 14;
        return (
          <g key={k.id}>
            {k.shape === "oval"
              ? <ellipse cx={k.x} cy={k.y} rx={w / 2} ry={h / 2} fill={fill} stroke="currentColor" strokeWidth={2} transform={`rotate(-8 ${k.x} ${k.y})`} />
              : <rect x={k.x - w / 2} y={k.y - h / 2} width={w} height={h} rx={h / 2} fill={fill} stroke="currentColor" strokeWidth={2} />}
            <text x={k.x} y={k.y + 3.5} fontSize={k.shape === "oval" ? 10 : 9} fontWeight={700} textAnchor="middle" fill={ink}>{k.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
