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

// Spread into tableFeatures({...}) for TableFilters: the search box uses the
// global filter, and each TableFilterDef type needs its column to use the
// matching filterFn here - "equals" for select, "inNumberRange" for
// numberRange, "inDayRange" for dateRange (see StockTable.vue).
export const filteringFeatures = {
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equals: filterFn_equals,
    equalsString: filterFn_equalsString,
    inNumberRange: filterFn_inNumberRange,
    inDayRange: filterFn_inDayRange,
  },
};
