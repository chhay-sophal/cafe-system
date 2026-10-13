import {
  columnFilteringFeature,
  constructFilterFn,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equals,
  filterFn_equalsString,
  filterFn_includesString,
  filterFn_inNumberRange,
  globalFilteringFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
} from "@tanstack/vue-table";
import type { Row } from "@tanstack/vue-table";

// Spread into a table's tableFeatures({...}) to make its accessor columns
// sortable from DataTable's header buttons. Display-only columns (actions,
// images) have no accessor and so never get a sort button. "auto" sorting
// picks text/alphanumeric for strings and basic for numbers/booleans, so
// those are the sort functions registered here.
export const sortingFeatures = {
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text },
};

// Keeps rows whose "YYYY-MM-DD HH:MM:SS" (SQLite CURRENT_TIMESTAMP) value
// falls on or between two "YYYY-MM-DD" days from <input type="date">.
// Compares the day part as text: both sides share the same format, and this
// avoids the built-in inDateRange's Date parsing, which treats a bare "to"
// day as midnight and so would drop everything later that same day.
const filterFn_inDayRange = constructFilterFn({
  filter: (dataValue, filterValue) => {
    if (typeof dataValue !== "string" || dataValue.length < 10) {
      return false;
    }
    const [from, to] = filterValue as [string | null, string | null];
    const day = dataValue.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  },
  autoRemove: (value) => !Array.isArray(value) || (!value[0] && !value[1]),
});

// The text a cell shows: its column's `cell` function output when that's
// plain text (e.g. a translated role, "#123", a formatted date), otherwise
// the raw value. Columns drawn by a DataTable slot have no `cell` function,
// so they fall back to the raw value - give them one too if their search
// text should differ.
function displayTextOf(row: Row<any, any>, columnId: string): string {
  const cell = row.getAllCells().find((candidate) => candidate.column.id === columnId);
  const cellDef = cell?.column.columnDef.cell;
  if (cell && typeof cellDef === "function") {
    const rendered = (cellDef as (context: unknown) => unknown)(cell.getContext());
    if (typeof rendered === "string" || typeof rendered === "number") {
      return String(rendered);
    }
  }
  const raw = row.getValue(columnId);
  return raw == null ? "" : String(raw);
}

// Search-box matching: case-insensitive "contains" against what each cell
// displays rather than its raw value, ignoring leading/trailing spaces.
const filterFn_includesDisplayText = constructFilterFn({
  filter: (_dataValue, filterValue, row, columnId) =>
    displayTextOf(row as Row<any, any>, columnId as string).toLowerCase().includes(filterValue as string),
  resolveFilterValue: (value) => String(value).trim().toLowerCase(),
  autoRemove: (value) => value == null || String(value).trim() === "",
});

// Spread into tableFeatures({...}) for TableFilters: the search box uses the
// global filter - pass `globalFilterFn: "includesDisplayText"` to useTable to
// search displayed text - and each TableFilterDef type needs its column to use
// the matching filterFn here - "equals" for select, "inNumberRange" for
// numberRange, "inDayRange" for dateRange (see StockTable.vue).
export const filteringFeatures = {
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    includesDisplayText: filterFn_includesDisplayText,
    equals: filterFn_equals,
    equalsString: filterFn_equalsString,
    inNumberRange: filterFn_inNumberRange,
    inDayRange: filterFn_inDayRange,
  },
};
