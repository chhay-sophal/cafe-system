// A dropdown filter rendered by TableFilters: picking an option filters
// `columnId` to that value, picking the "all" entry clears the filter.
export interface TableSelectFilter {
  columnId: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}
