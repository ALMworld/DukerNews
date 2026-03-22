/**
 * Interaction bit constants — shared between server and client.
 * NO server-side imports — safe for client bundles.
 *
 * Bits layout within `bits_flag`:
 *   bits 0-1: vote (00=none, 01=up, 10=down)
 *   bit  2:   flag
 *   bit  3:   hide
 *   bit  4:   favorite
 *   bit  5:   vouch
 */

export const VOTE_MASK  = 0b11       // 3  — covers bits 0-1
export const VOTE_UP    = 0b01       // 1
export const VOTE_DOWN  = 0b10       // 2
export const VOTE_NONE  = 0b00       // 0

export const BIT_FLAG     = 1 << 2   // 4
export const BIT_HIDE     = 1 << 3   // 8
export const BIT_FAVORITE = 1 << 4   // 16
export const BIT_VOUCH    = 1 << 5   // 32
