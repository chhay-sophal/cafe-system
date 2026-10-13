import {
  createSortedRowModel,
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
