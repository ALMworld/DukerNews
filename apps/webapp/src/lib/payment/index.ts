/**
 * lib/payment — Payment settlement modules.
 *
 * Exports:
 *   - verifyPayment()  — Phase 1: verify signature (no money moves)
 *   - settlePayment()  — Phase 2: settle USDT transfer
 *   - SettleResult     — Return type for settle
 */
export { verifyPayment, settlePayment } from './settlement'
export type { SettleResult } from './x402-payment'
