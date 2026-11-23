export interface DailySummaryMetrics {
  totalOrders: number;
  grossRevenue: number;
  totalTax: number;
  totalDiscounts: number;
  netRevenue: number;
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
}
