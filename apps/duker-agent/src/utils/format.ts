/**
 * Display formatting utilities for the terminal UI.
 */

/** Truncate an EVM address: 0x1234...abcd */
export function truncAddr(addr: string, chars = 4): string {
    if (addr.length <= chars * 2 + 2) return addr
    return `${addr.slice(0, chars + 2)}...${addr.slice(-chars)}`
}

/** Format USDT micro-units (6 decimals) to human-readable string */
export function fmtUsdt(microUnits: bigint | number): string {
    const n = Number(microUnits) / 1_000_000
    return n.toFixed(2)
}

/** Relative time string: "2m ago", "3h ago", "1d ago" */
export function timeAgo(unixMs: bigint | number): string {
    const ms = Date.now() - Number(unixMs)
    const secs = Math.floor(ms / 1000)
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

/** Pad string to fixed width (right-pad with spaces) */
export function pad(s: string, width: number): string {
    return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length)
}

/** Truncate string with ellipsis if too long */
export function ellipsis(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…'
}
