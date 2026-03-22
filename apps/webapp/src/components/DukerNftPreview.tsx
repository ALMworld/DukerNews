/**
 * DukerNftPreview — Live preview of the on-chain username NFT SVG.
 *
 * Mirrors the _buildSVG() function from DukerNews.sol so users can
 * see exactly what their soulbound NFT card will look like.
 */

interface DukerNftPreviewProps {
    name: string
    tokenId?: number | string   // "#?" when unknown
    dukiBps?: number            // 0–10000 (basis points), shown as percentage
    chain?: string              // defaults to "X Layer"
    className?: string
    style?: React.CSSProperties
}

/** Dynamic font size based on character count (Unicode-aware) */
function calcFontSize(name: string): number {
    const len = [...name].length  // character count, not byte length
    if (len <= 8) return 48
    if (len <= 14) return 36
    if (len <= 20) return 26
    return 20
}

export function DukerNftPreview({
    name,
    tokenId,
    dukiBps,
    chain = 'X Layer',
    className,
    style,
}: DukerNftPreviewProps) {
    const displayName = name.trim() || 'username'
    const displayId = tokenId ?? '?'
    const fs = calcFontSize(displayName)
    const pctStr = dukiBps != null ? `${(dukiBps / 100).toFixed(0)}%` : null

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 500 500"
            className={className}
            style={{ width: '100%', maxWidth: 320, height: 'auto', ...style }}
        >
            <defs>
                <linearGradient id="nft-bg" x1="0" y1="0" x2="500" y2="500" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1a0533" />
                    <stop offset="1" stopColor="#0f0a1e" />
                </linearGradient>
                <linearGradient id="nft-db" x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="#a855f7" />
                    <stop offset="1" stopColor="#7e22ce" />
                </linearGradient>
                <linearGradient id="nft-gd" x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="#FFD700" />
                    <stop offset="1" stopColor="#F0B000" />
                </linearGradient>
            </defs>

            {/* Background */}
            <rect width="500" height="500" rx="24" fill="url(#nft-bg)" />
            <rect x="2" y="2" width="496" height="496" rx="22" fill="none" stroke="#9333ea" strokeWidth="1.5" opacity=".3" />

            {/* DUKI logo circle + D glyph */}
            <g transform="translate(250,150)scale(.16)">
                <circle r="250" fill="url(#nft-db)" />
                <circle r="225" fill="none" stroke="#d8b4fe" strokeWidth="8" opacity=".3" />
                <g transform="translate(-130,-195)scale(.35)">
                    <path
                        d="M298 950l0-30 111 0q84 0 155-27.5 71-27.5 122.5-77.5 51.5-50 80-118 28.5-68 28.5-149 0-81-28.5-149-28.5-68-80-118-51.5-50-122.5-77.5-71-27.5-155-27.5l-111 0 0-30 111 0q91 0 167 29.5 76 29.5 132 83.5 56 54 87 127.5 31 73.5 31 161.5 0 88-31 161.5-31 73.5-87 127.5-56 54-132 83.5-76 29.5-167 29.5l-111 0z m-198-519l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 453l0-30 111 0q94 0 166-39 72-39 113-108.5 41-69.5 41-158.5 0-90-41-159-41-69-113-108-72-39-166-39l-111 0 0-30 111 0q103 0 182 43 79 43 124 119 45 76 45 174 0 98-45 174-45 76-124 119-79 43-182 43l-111 0z m0-66l0-30 111 0q76 0 132.5-30 56.5-30 88.5-84.5 32-54.5 32-125.5 0-72-32-126-32-54-88.5-84-56.5-30-132.5-30l-111 0 0-30 111 0q84 0 148 34 64 34 100 95 36 61 36 141 0 80-36 141-36 61-100 95-64 34-148 34l-111 0z m-288-321l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m0 66l0-30 399 0 0 30-399 0z m90 321l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z m66 0l0-285 30 0 0 285-30 0z"
                        fill="#FFD700"
                        stroke="#FFD700"
                        strokeWidth="30"
                        strokeLinejoin="round"
                    />
                </g>
            </g>

            {/* "DUKER NEWS" subtitle */}
            <text x="250" y="235" fontFamily="monospace" fontSize="13" fill="#9333ea" textAnchor="middle" letterSpacing="2">
                DUKER NEWS
            </text>

            {/* @username */}
            <text x="250" y="320" fontFamily="monospace" fontSize={`${fs}`} fontWeight="bold" fill="url(#nft-gd)" textAnchor="middle">
                @{displayName}
            </text>

            {/* Token ID + chain + percentage */}
            <text x="250" y="380" fontFamily="monospace" fontSize="16" fill="#d8b4fe" textAnchor="middle">
                #{displayId} · {chain}{pctStr ? ` · ${pctStr}` : ''}
            </text>
        </svg>
    )
}
