// Lifted to lib/payments/markRentalAsPaid.ts during the Opn Payments
// migration (2026-05-20). The signature changed: pass
// gatewayMetadata = { transactionRef } instead of { transactionSn }.
// All call sites updated in the same PR.
export * from '@/lib/payments/markRentalAsPaid';
