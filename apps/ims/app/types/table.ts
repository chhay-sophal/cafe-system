// A filter shown in TableFilters' dropdown panel. Each type needs its column
// to use the matching filterFn from utils/table.ts's filteringFeatures:
//   select      -> "equals" (option values compared with ===), or
//                  "contains" when the column's value is an array
//   numberRange -> "inNumberRange"
//   dateRange   -> "inDayRange"
export type TableFilterDef =
  | {
      type: "select";
      columnId: string;
      label: string;
      options: Array<{ value: string | number | boolean; label: string }>;
    }
  | { type: "numberRange"; columnId: string; label: string }
  | { type: "dateRange"; columnId: string; label: string };
