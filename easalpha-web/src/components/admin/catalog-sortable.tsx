"use client";
import type { CSSProperties, ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** What a row needs to take part in the drag: attach ref and style to the row element, spread handleProps on the grip. */
export interface SortHandle {
  ref: (node: HTMLElement | null) => void;
  style: CSSProperties;
  handleProps: Record<string, unknown>;
  dragging: boolean;
}

function SortableItem<T>({ id, item, index, children }: { id: string; item: T; index: number; children: (item: T, index: number, handle: SortHandle) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, position: isDragging ? "relative" : undefined, zIndex: isDragging ? 10 : undefined };
  return <>{children(item, index, { ref: setNodeRef, style, handleProps: { ...attributes, ...listeners }, dragging: isDragging })}</>;
}

/** SPEC Arrange mode: a drag-and-drop sortable list (pointer and keyboard). Renders no wrapper element of its own, so it
 *  works inside a <tbody> as well as a <div>. onReorder gets the full reordered list when a drop changes the order. */
export function SortableList<T>({ items, getId, onReorder, disabled, children }: { items: T[]; getId: (item: T) => string; onReorder: (items: T[]) => void; disabled?: boolean; children: (item: T, index: number, handle: SortHandle) => ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map(getId);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {items.map((it, i) => <SortableItem key={getId(it)} id={getId(it)} item={it} index={i}>{children}</SortableItem>)}
      </SortableContext>
    </DndContext>
  );
}

/** The grip users drag by. */
export function DragHandle({ handle, className, label = "Drag to reorder" }: { handle: SortHandle; className?: string; label?: string }) {
  return (
    <button type="button" aria-label={label} className={cn("inline-flex h-8 w-8 cursor-grab items-center justify-center rounded-full text-fg-muted hover:bg-fg/8 active:cursor-grabbing", handle.dragging && "cursor-grabbing bg-fg/8", className)} {...handle.handleProps}>
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

/** A table row that takes part in the drag. Mirrors the UI kit's TR classes (TR itself does not forward refs). */
export function SortableRow({ handle, className, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { handle: SortHandle }) {
  return <tr ref={handle.ref as React.Ref<HTMLTableRowElement>} style={handle.style} className={cn("border-t transition-colors hover:bg-fg/[0.04]", handle.dragging && "bg-card shadow-[var(--elev-1)]", className)} {...props} />;
}
