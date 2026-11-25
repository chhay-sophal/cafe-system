export interface DailySummaryMetrics {
  totalOrders: number;
  grossRevenue: number;
  totalTax: number;
  totalDiscounts: number;
  netRevenue: number;
  // The fields below are missing from backends before profit was added.
  itemsSold?: number;
  // From today's recipes and Stock costs.
  ingredientCost?: number;
  // Sales before tax and after discounts, less ingredient cost.
  grossProfit?: number;
  voidedOrders?: number;
  voidedAmount?: number;
}

export interface PaymentBreakdownEntry {
  method: string;
  totalAmount: number;
}

export interface HourlyVolumeEntry {
  hour: number;
  orderCount: number;
  revenue: number;
}

export interface DailyVolumeEntry {
  date: string; // store-local YYYY-MM-DD
  orderCount: number;
  revenue: number;
}

// Revenue is item price plus modifiers, before order-level discounts.
export interface TopProductEntry {
  productId: string;
  productName: string;
  categoryName: string | null;
  quantity: number;
  revenue: number;
  // Ingredient cost and revenue less it. costComplete is false when part of
  // the cost is unknown (no recipe, or an ingredient with no cost), so the
  // profit is too high.
  cost?: number;
  profit?: number;
  costComplete?: boolean;
}

export interface DailySummaryReport {
  dateRange: { startDate: string; endDate: string };
  metrics: DailySummaryMetrics;
  // The same number of days immediately before dateRange.
  previousPeriod: { startDate: string; endDate: string; metrics: DailySummaryMetrics };
  paymentBreakdown: PaymentBreakdownEntry[];
  hourlyVolume: HourlyVolumeEntry[];
  // One entry per day in dateRange, zeros included.
  dailyVolume: DailyVolumeEntry[];
  // Every product sold in dateRange, highest revenue first.
  topProducts: TopProductEntry[];
  // Why profit may be too high.
  costCoverage?: { productsWithoutRecipe: number; uncostedIngredients: string[] };
}
