import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/* Kleine set basiscomponenten in huisstijl. Groeit mee met shadcn/ui-componenten waar nodig. */

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" aria-pressed={active}
      className={clsx("font-display font-semibold rounded-full border-2 px-4 py-2 cursor-pointer transition focus-visible:outline-3 focus-visible:outline-accent",
        active ? "border-accent bg-accent-soft" : "border-line bg-surface", className)} {...props} />
  );
}

export function Ghost({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={clsx("font-display font-semibold rounded-full border-2 border-dashed border-line bg-surface text-muted px-3 py-1.5 text-sm cursor-pointer", className)} {...props} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <span className="inline-flex rounded-full border-2 border-line overflow-hidden" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={clsx("px-3 py-1 text-sm font-bold cursor-pointer", v === value ? "bg-fg text-bg" : "bg-surface text-muted")}>{text}</button>
      ))}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-2xl border-2 border-line bg-surface p-4", className)}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="font-display font-semibold text-lg mt-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}
