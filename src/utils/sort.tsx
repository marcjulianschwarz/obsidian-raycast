// src/utils/sort.ts
export type SortOrder = "az" | "za" | "mn" | "mo" | "cn" | "co";

export function sortNotesByOrder<T extends { title?: string; created?: string; modified?: string }>(
  notes: T[],
  order: SortOrder
): T[] {
  const safeTitle = (n: T) => (n.title ?? "").trim();
  const ts = (d?: string) => (d ? Date.parse(d) : 0);
  const arr = [...notes]; // don’t mutate caller

  switch (order) {
    case "az":
      return arr.sort((a, b) =>
        safeTitle(a).localeCompare(safeTitle(b), undefined, { sensitivity: "base", numeric: true })
      );
    case "za":
      return arr.sort((a, b) =>
        safeTitle(b).localeCompare(safeTitle(a), undefined, { sensitivity: "base", numeric: true })
      );
    case "mn":
      return arr.sort((a, b) => ts(b.modified) - ts(a.modified));
    case "mo":
      return arr.sort((a, b) => ts(a.modified) - ts(b.modified));
    case "cn":
      return arr.sort((a, b) => ts(b.created) - ts(a.created));
    case "co":
      return arr.sort((a, b) => ts(a.created) - ts(b.created));
  }
}