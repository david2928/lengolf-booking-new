// Lifted to lib/payments/order-summary.ts during the Opn Payments
// migration (2026-06-12). This re-export keeps existing ShopeePay
// imports working unchanged. Safe to delete the shim after ShopeePay
// decommission (60 days post-Opn cutover).
export * from '@/lib/payments/order-summary';
