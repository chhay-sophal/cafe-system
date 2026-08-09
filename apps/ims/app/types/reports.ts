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

export interface DailySummaryReport {
  dateRange: { startDate: string; endDate: string };
  metrics: DailySummaryMetrics;
  paymentBreakdown: PaymentBreakdownEntry[];
  hourlyVolume: HourlyVolumeEntry[];
}
