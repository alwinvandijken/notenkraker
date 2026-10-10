import { ledgerLines, parseId, staffPosition, type Clef, type NoteId, noteName, type NamingScheme } from "@notenkraker/core";

/** Eén noot groot op een notenbalk. */
export function StaffNote({ note, clef, color = "var(--color-accent)" }: { note: NoteId; clef: Clef; color?: string }) {
  const sp = 14, half = sp / 2, w = 260, h = 190, base = 128, cx = 170;
  const p = parseId(note);
  const pos = staffPosition(p, clef);
  const y = (s: number) => base - s * half;
  const cy = y(pos);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full max-w-[320px] mx-auto">
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={10} x2={w - 10} y1={base - i * sp} y2={base - i * sp} stroke="currentColor" strokeWidth={1.3} />)}
      <text x={18} y={base + 4} fontSize={74} fill="currentColor" fontFamily="serif">{clef === "G" ? "𝄞" : "𝄢"}</text>
      {ledgerLines(pos).map((s) => <line key={s} x1={cx - 16} x2={cx + 16} y1={y(s)} y2={y(s)} stroke="currentColor" strokeWidth={1.3} />)}
      {p.accidental && <text x={cx - 24} y={cy + 7} fontSize={24} fill={color} textAnchor="middle" fontFamily="serif">{p.accidental === "#" ? "♯" : "♭"}</text>}
      <ellipse cx={cx} cy={cy} rx={8.5} ry={6} fill={color} transform={`rotate(-20 ${cx} ${cy})`} />
      {pos < 4
        ? <line x1={cx + 7.5} x2={cx + 7.5} y1={cy - 1} y2={cy - 42} stroke={color} strokeWidth={2} />
        : <line x1={cx - 7.5} x2={cx - 7.5} y1={cy + 1} y2={cy + 42} stroke={color} strokeWidth={2} />}
    </svg>
  );
}

export interface StaffRowNote { id: NoteId; color?: string; label?: string; sub?: string; selected?: boolean; badge?: { text: string; color: string } }

/** Rij noten op één balk; klikbaar. Vaste hoogte, scrolt horizontaal. */
export function StaffRow({ notes, clef, naming = "nl", onSelect, cursor, height = 230 }:
  { notes: StaffRowNote[]; clef: Clef; naming?: NamingScheme; onSelect?: (id: NoteId, index: number) => void; cursor?: number; height?: number }) {
  const sp = 12, half = sp / 2, x0 = 70, dx = 58, w = x0 + Math.max(notes.length, 1) * dx + 6, h = height, base = 150;
  const y = (s: number) => base - s * half;
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-line bg-surface px-1 py-2">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block mx-auto" style={{ height, width: "auto", maxWidth: "none" }}>
        {cursor !== undefined && cursor < notes.length && (
          <rect x={x0 + cursor * dx - 24} y={20} width={48} height={h - 30} rx={8} fill="var(--color-accent-soft)" />
        )}
        {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={8} x2={w - 8} y1={base - i * sp} y2={base - i * sp} stroke="currentColor" strokeWidth={1.2} />)}
        <text x={14} y={base + 3} fontSize={64} fill="currentColor" fontFamily="serif">{clef === "G" ? "𝄞" : "𝄢"}</text>
        {notes.map((n, i) => {
          const p = parseId(n.id), pos = staffPosition(p, clef), cx = x0 + i * dx, cy = y(pos), col = n.color ?? "currentColor";
          const top = Math.min(cy, base - 4 * sp) - 50;
          return (
            <g key={i} className={onSelect ? "cursor-pointer" : undefined} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined}
               onClick={() => onSelect?.(n.id, i)} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(n.id, i); } }}>
              <rect x={cx - 26} y={top} width={52} height={h - top} rx={10} fill={n.selected ? "var(--color-bg)" : "transparent"} stroke={n.selected ? "currentColor" : "none"} strokeWidth={2} />
              {ledgerLines(pos).map((s) => <line key={s} x1={cx - 13} x2={cx + 13} y1={y(s)} y2={y(s)} stroke="currentColor" strokeWidth={1.2} />)}
              {p.accidental && <text x={cx - 19} y={cy + 6} fontSize={18} fill={col} textAnchor="middle" fontFamily="serif">{p.accidental === "#" ? "♯" : "♭"}</text>}
              <ellipse cx={cx} cy={cy} rx={7} ry={5} fill={col} transform={`rotate(-20 ${cx} ${cy})`} />
              {pos < 4
                ? <line x1={cx + 6.3} x2={cx + 6.3} y1={cy - 1} y2={cy - 34} stroke={col} strokeWidth={1.6} />
                : <line x1={cx - 6.3} x2={cx - 6.3} y1={cy + 1} y2={cy + 34} stroke={col} strokeWidth={1.6} />}
              {n.badge && <><circle cx={cx} cy={34} r={14} fill={n.badge.color} /><text x={cx} y={39} fontSize={13} fontWeight={800} textAnchor="middle" fill="#fff" fontFamily="var(--font-display)">{n.badge.text}</text></>}
              <text x={cx} y={h - 26} fontSize={19} fontWeight={800} fill={col} textAnchor="middle" fontFamily="var(--font-display)">{n.label ?? noteName(p, naming)}</text>
              {n.sub && <text x={cx} y={h - 9} fontSize={10} fill="var(--color-muted)" textAnchor="middle">{n.sub}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
