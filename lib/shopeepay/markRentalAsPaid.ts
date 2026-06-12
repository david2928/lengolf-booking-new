// Lifted to lib/payments/markRentalAsPaid.ts during the Opn Payments
// migration (2026-06-12). Signature unchanged — this re-export keeps
// existing ShopeePay imports working. Safe to delete the shim after
// ShopeePay decommission (60 days post-Opn cutover).
export * from '@/lib/payments/markRentalAsPaid';
