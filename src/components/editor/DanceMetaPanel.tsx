"use client";

import type { DanceProject, Dancer } from "@/types";

interface Props {
  dance: DanceProject;
  onChange: (next: DanceProject) => void;
}

// Renumbers dancers to 1..N (matching their array order) AND remaps every
// `actions[].dancers` reference in timeline events + legacy steps so saved
// data stays consistent. Returns a fully re-keyed DanceProject.
function renumberDancers(
  dance: DanceProject,
  newDancers: ReadonlyArray<Dancer>,
  idMap: ReadonlyMap<number, number>,
): DanceProject {
  const remap = (oldIds: ReadonlyArray<number>): number[] =>
    oldIds
      .map((id) => idMap.get(id))
      .filter((id): id is number => id !== undefined);

  return {
    ...dance,
    dancers: [...newDancers],
    sections: dance.sections.map((s) => ({
      ...s,
      steps: s.steps.map((step) => ({
        ...step,
        actions: step.actions.map((a) => ({ ...a, dancers: remap(a.dancers) })),
      })),
    })),
    ...(dance.timelineEvents !== undefined && {
      timelineEvents: dance.timelineEvents.map((e) => ({
        ...e,
        actions: e.actions.map((a) => ({ ...a, dancers: remap(a.dancers) })),
      })),
    }),
  };
}

export function DanceMetaPanel({ dance, onChange }: Props) {
  const setMeta = <K extends keyof DanceProject>(key: K, value: DanceProject[K]) =>
    onChange({ ...dance, [key]: value });

  // Only the name is user-editable; id is fixed by position.
  const renameDancer = (id: number, name: string) =>
    onChange({
      ...dance,
      dancers: dance.dancers.map((d) => (d.id === id ? { ...d, name } : d)),
    });

  const addDancer = () => {
    const newId = dance.dancers.length + 1;
    const fresh: Dancer = { id: newId, name: `Dancer ${newId}` };
    onChange({ ...dance, dancers: [...dance.dancers, fresh] });
  };

  const deleteDancer = (id: number) => {
    // Build the remaining list, assigning sequential ids 1..N. Track the
    // old→new id mapping so we can rewrite every action's `dancers` array.
    const idMap = new Map<number, number>();
    const remaining: Dancer[] = [];
    let nextId = 1;
    for (const d of dance.dancers) {
      if (d.id === id) continue;
      idMap.set(d.id, nextId);
      remaining.push({ ...d, name: d.name, id: nextId });
      nextId++;
    }
    onChange(renumberDancers(dance, remaining, idMap));
  };

  return (
    <div className="card">
      <div className="col" style={{ gap: 10 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="group-label">Song name</span>
          <input value={dance.name} onChange={(e) => setMeta("name", e.target.value)} />
        </label>

        <div className="row" style={{ gap: 12 }}>
          <label className="col" style={{ gap: 4, flex: 1 }}>
            <span className="group-label">BPM</span>
            <input
              type="number"
              min={1}
              value={dance.bpm}
              onChange={(e) => setMeta("bpm", Number(e.target.value) || 0)}
            />
          </label>
          <label className="col" style={{ gap: 4, flex: 1 }}>
            <span className="group-label">Beat unit</span>
            <select
              value={String(dance.beatUnit)}
              onChange={(e) => setMeta("beatUnit", Number(e.target.value))}
            >
              <option value="1">1 beat</option>
              <option value="0.5">1/2 beat</option>
              <option value="0.25">1/4 beat</option>
            </select>
          </label>
        </div>

        <hr className="hr" />

        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <span className="group-label">Dancers</span>
            <span className="muted" style={{ fontSize: 11 }}>
              · ids are auto-assigned 1..N by position
            </span>
            <span className="spacer" />
            <button onClick={addDancer}>+ Add dancer</button>
          </div>
          {dance.dancers.length === 0 && <span className="muted">No dancers yet.</span>}
          {dance.dancers.map((d) => (
            <div key={d.id} className="row" style={{ gap: 6 }}>
              <span
                style={{
                  width: 36,
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: "#475569",
                  textAlign: "center",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: 4,
                  padding: "4px 0",
                }}
                title="Dancer id (matches DANCER constant in .ino; fixed by position)"
              >
                #{d.id}
              </span>
              <input
                value={d.name}
                onChange={(e) => renameDancer(d.id, e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="ghost danger"
                onClick={() => deleteDancer(d.id)}
                title="Delete dancer (renumbers the rest)"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
