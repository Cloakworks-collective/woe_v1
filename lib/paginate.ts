// Shared pagination for the ladder and the chronicle feeds. Pure — the page
// number is clamped into range so a bad ?page= never throws or renders empty.

export interface Paged<T> {
  shown: T[];
  pageNo: number;
  pages: number;
  start: number; // zero-based index of the first shown item
  total: number;
}

export function paginate<T>(items: T[], page: unknown, size: number): Paged<T> {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const pageNo = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
  const start = (pageNo - 1) * size;
  return { shown: items.slice(start, start + size), pageNo, pages, start, total };
}
