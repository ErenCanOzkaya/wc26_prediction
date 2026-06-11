"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveGroupOrder } from "@/lib/predictions/actions";
import type { TeamLite } from "@/components/MatchPredictionRow";

function Badge({ n }: { n: number }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
        n <= 2 ? "bg-green/20 text-green" : "bg-white/8 text-muted"
      }`}
    >
      {n}
    </span>
  );
}

function Crest({ team }: { team: TeamLite }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/8">
      {team.crest_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest_url} alt="" className="h-4 w-4" />
      ) : null}
    </span>
  );
}

function SortableTeam({ team, index }: { team: TeamLite; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab touch-none items-center gap-2 rounded-xl border border-white/8 bg-bg/40 px-2 py-2 active:cursor-grabbing ${
        isDragging ? "opacity-70 shadow-xl" : ""
      }`}
    >
      <Badge n={index + 1} />
      <Crest team={team} />
      <span className="truncate text-sm font-bold">
        {team.short_name || team.name}
      </span>
      <span className="ml-auto text-white/15">⠿</span>
    </li>
  );
}

export function GroupSortable({
  groupLabel,
  locked,
  initial,
  accent,
}: {
  groupLabel: string;
  locked: boolean;
  initial: TeamLite[];
  accent: string;
}) {
  const [items, setItems] = useState<TeamLite[]>(initial);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(next: TeamLite[]) {
    startTransition(async () => {
      const res = await saveGroupOrder(
        groupLabel,
        next.map((t) => t.id),
      );
      setStatus(res.error ? "error" : "ok");
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((t) => t.id === active.id);
    const newIndex = items.findIndex((t) => t.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    persist(next);
  }

  return (
    <div className="surface relative overflow-hidden p-3">
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent }}
      />
      <div className="mb-2 flex items-center justify-between pt-0.5">
        <h3 className="display text-xl">
          Group <span style={{ color: accent }}>{groupLabel}</span>
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {locked ? (
            <span className="text-muted">locked</span>
          ) : status === "ok" ? (
            <span className="text-green">saved</span>
          ) : status === "error" ? (
            <span className="text-red">error</span>
          ) : (
            <span className="text-muted">drag</span>
          )}
        </span>
      </div>

      {locked ? (
        <ol className="space-y-1.5">
          {items.map((team, i) => (
            <li
              key={team.id}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-bg/40 px-2 py-2"
            >
              <Badge n={i + 1} />
              <Crest team={team} />
              <span className="truncate text-sm font-bold">
                {team.short_name || team.name}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <DndContext
          id={`group-dnd-${groupLabel}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1.5">
              {items.map((team, i) => (
                <SortableTeam key={team.id} team={team} index={i} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
