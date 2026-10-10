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
    <span className="inline-flex flex-wrap rounded-3xl bg-surface p-1 gap-1" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={clsx("min-h-11 px-4 rounded-full text-[15px] cursor-pointer", v === value ? "bg-fg text-bg font-semibold" : "bg-transparent text-muted font-medium")}>{text}</button>
      ))}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-3xl bg-surface p-5 lg:p-6", className)}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="font-display font-semibold text-lg mt-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
}
