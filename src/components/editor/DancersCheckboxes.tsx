"use client";

import type { Dancer } from "@/types";

interface Props {
  dancers: Dancer[];
  selected: number[];
  onChange: (next: number[]) => void;
}

export function DancersCheckboxes({ dancers, selected, onChange }: Props) {
  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id].sort((a, b) => a - b));
  };
  if (dancers.length === 0) {
    return <span className="muted">No dancers — add one in the Dancers panel.</span>;
  }
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
      {dancers.map((d) => {
        const on = selected.includes(d.id);
        return (
          <span
            key={d.id}
            className={`chip${on ? " on" : ""}`}
            onClick={() => toggle(d.id)}
            role="checkbox"
            aria-checked={on}
          >
            {d.id}. {d.name}
          </span>
        );
      })}
    </div>
  );
}
