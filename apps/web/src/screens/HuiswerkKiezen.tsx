import { useState } from "react";
import clsx from "clsx";
import { useApp } from "@/lib/store";
import { Avatar } from "@/screens/Dashboard";
import { Chip } from "@/components/ui";

/**
 * De tab Huiswerk van ouder en leraar (AC-120): eerst kiezen voor wie, dan naar "Huiswerk geven".
 * Voorlopig; PR 6 maakt van huiswerk geven drie stappen (Wat · Doel · Versturen).
 */
export function HuiswerkKiezen({ onGive, onAdd }: { onGive(studentIds: string[]): void; onAdd(): void }) {
  const { profile, students } = useApp();
  const isOuder = profile?.role === "ouder";
  const [chosen, setChosen] = useState<string[]>(() => (students.length === 1 ? [students[0]!.id] : []));

  if (students.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-6 flex flex-col items-start gap-3">
        <p className="m-0">{isOuder ? "Voeg eerst een kind toe." : "Voeg eerst een leerling toe."}</p>
        <Chip primary onClick={onAdd}>{isOuder ? "+ kind" : "+ leerling"}</Chip>
      </div>
    );
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <p className="text-muted m-0">Voor wie is het huiswerk?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => {
          const on = chosen.includes(s.id);
          return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => toggle(s.id)}
              className={clsx("rounded-2xl bg-surface p-3 flex items-center gap-3 text-left cursor-pointer border-2", on ? "border-accent" : "border-transparent")}>
              <Avatar name={s.name} />
              <b className="font-display flex-1 min-w-0 truncate">{s.name}</b>
              <span aria-hidden="true" className={clsx("w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm", on ? "bg-accent border-accent text-white" : "border-line")}>{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <Chip primary disabled={chosen.length === 0} onClick={() => onGive(chosen)} className="self-start py-3">
        {chosen.length > 1 ? `Huiswerk geven aan ${chosen.length}` : "Huiswerk geven"}
      </Chip>
    </div>
  );
}
