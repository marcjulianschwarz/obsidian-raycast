export const SORT_ORDERS = ["az", "za", "mn", "mo", "cn", "co"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// This function handles file dates as both Date objects and strings representing dates.
// This ensures robustness against possible changes to the created and modified attributes in notes,
// such as adjustments made in LoadNotes (vault.service).
export function sortNotesByOrder<T extends { title?: string; created?: Date | string | number; modified?: Date | string | number }>(
  notes: T[],
  order: SortOrder
): T[] {
  const safeTitle = (n: T) => (n.title ?? "").trim();
  const ts = (d?: Date | string | number) => {
    if (d instanceof Date) return d.getTime();
    if (typeof d === "number") return Number.isFinite(d) ? d : 0;
    if (typeof d === "string") {
      const t = Date.parse(d);
      return Number.isNaN(t) ? 0 : t;
    }
    return 0;
  };
  const arr = [...notes]; // never mutate caller

  switch (order) {
    case "az":
      return arr.sort((a, b) => safeTitle(a).localeCompare(safeTitle(b), undefined, { sensitivity: "base", numeric: true }));
    case "za":
      return arr.sort((a, b) => safeTitle(b).localeCompare(safeTitle(a), undefined, { sensitivity: "base", numeric: true }));
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