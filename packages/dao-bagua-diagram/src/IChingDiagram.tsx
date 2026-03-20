import React from 'react';
import { AnimatedHeartHandshake } from './AnimatedHeartHandshake';

// ── 易 SVG path data (shared constant) ──
const YI_PATH = "M 38.62642,0.50927058 C 13.66512,4.4383596 -6.5680699,31.79403 14.66652,53.03013 C 20.64122,59.00523 40.93602,62.72853 39.39342,72.07023 C 37.01812,86.45463 17.22892,81.54523 7.6264201,83.29863 C 2.6984101,84.19853 -1.6331399,88.82243 0.37333409,94.02703 C 5.1022401,106.29323 24.38952,97.28343 31.62642,93.05863 C 32.78952,92.37963 40.92172,86.47733 41.80932,88.09263 C 43.18462,90.59553 38.01422,95.58583 36.58322,97.03013 C 29.57642,104.10223 21.11872,105.68323 12.64572,109.98623 C 10.18492,111.23523 7.0566901,113.66923 8.7128401,116.79523 C 10.84492,120.82023 17.89382,120.31923 21.62642,119.76923 C 33.85352,117.96823 43.31382,108.37823 51.62642,100.07023 C 53.64472,98.05303 60.61172,89.01933 63.81002,93.44673 C 67.04452,97.92423 58.22832,105.86223 55.45662,108.49123 C 44.30612,119.06423 30.35102,124.97323 16.62722,131.37923 C 12.73672,133.19623 6.7617801,136.69223 9.6696201,141.92223 C 12.38622,146.80723 21.21682,145.24123 25.62642,144.17023 C 40.20312,140.63023 52.69842,129.00723 62.34092,118.07023 C 63.92542,116.27323 71.89562,104.85823 74.46202,106.27723 C 80.97342,109.87623 68.97302,125.46623 66.53302,128.05523 C 50.49532,145.07423 25.32632,149.31723 11.98602,169.07023 C 7.5753301,175.60123 -4.0879399,198.85323 11.62642,199.94223 C 22.43692,200.69123 21.32042,178.80023 27.72052,172.10923 C 47.12182,151.82823 94.74812,139.78923 88.29772,103.07023 C 86.44112,92.50133 76.92552,84.10503 67.62642,79.86263 C 61.51812,77.07603 51.40602,78.12093 51.21822,69.12893 C 51.12442,64.63663 56.36032,64.77763 59.62642,63.91433 C 68.41112,61.59233 76.52482,57.32073 82.23602,50.06943 C 105.30142,20.78433 65.27782,-3.6858404 38.62642,0.50927058 M 40.62642,10.37043 C 52.34042,8.6824396 66.54062,11.42003 74.23292,21.08493 C 86.80372,36.87923 69.26662,52.72423 53.62642,54.78083 C 42.03822,56.30463 28.91852,54.13393 20.84012,45.03013 C 6.8325201,29.24433 24.46082,12.69983 40.62642,10.37043 M 62.49292,25.02163 C 57.96082,25.12373 53.37662,27.50473 48.62642,27.61503 C 43.46362,27.73483 35.59512,25.13883 30.94432,28.24923 C 27.35462,30.65003 28.89132,35.88723 31.85482,38.06173 C 36.50662,41.47493 44.14362,41.29663 49.62642,41.03013 C 54.71952,40.78253 60.55802,39.12053 63.77152,34.88193 C 65.64572,32.40983 67.88782,24.90003 62.49292,25.02163 z";

// Heart path for static (inactive) heart icon
const HEART_PATH = "M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762";

// ── Colors ──
const ACTIVE_COLOR = '#a855f7';   // vivid purple when active
const MUTED_COLOR = '#6b7280';    // muted gray for 易 when inactive
const RED_COLOR = '#ef4444';      // red for heart & taiji when inactive

export interface IChingDiagramProps {
    /** Size of the taiji symbol (default: 32) */
    size?: number;
    /** Rotation angle in degrees (default: 180) */
    rotation?: number;
    /** Called when a part is clicked. Keys: '❤' (love), '☯' (taiji), '1' (yang), '0' (yin) */
    onItemClick?: (key: string) => void;
    /** Currently focused/active key — that part gets highlighted in purple */
    focusedKey?: string | null;
    /** Whether to show the component (default: true) */
    visible?: boolean;
    /** Show yin/yang monogram symbols behind 易 (default: true). Set false inside bagua to avoid duplication. */
    showMonograms?: boolean;
    /** Number of yao lines per side: 1 = monogram, 3 = trigram (乾/坤) (default: 3) */
    yaoLineCount?: 1 | 3;
    /** Yao line position: 'side' = vertical beside 易, 'top' = horizontal above 易 (default: 'side') */
    yaoPosition?: 'side' | 'top';
}

/**
 * IChingDiagramGroup — the center taiji (yin-yang) piece with HeartHand icon
 * and decorative 易 characters. Each part is independently clickable.
 * The active part is highlighted in purple; inactive parts are muted.
 */
export const IChingDiagramGroup: React.FC<IChingDiagramProps & {
    cx?: number;
    cy?: number;
}> = ({
    size = 32,
    rotation = 180,
    onItemClick,
    focusedKey,
    visible = true,
    showMonograms = true,
    yaoLineCount = 1,
    yaoPosition = 'top',
    cx = 0,
    cy = 0,
}) => {
        if (!visible) return null;

        const radius = size / 2;
        const smallRadius = radius * 0.125;
        const largeRadius = radius * 0.975;
        const isHeartActive = focusedKey === '❤';
        const isYiLeftActive = focusedKey === '1';
        const isYiRightActive = focusedKey === '0';
        const fullSize = 32;
        const bottomY = isHeartActive ? -(largeRadius - 1) : -(largeRadius + 1);

        const color = (key: string) => {
            // Heart & taiji always stay red
            if (key === '❤' || key === '☯') return RED_COLOR;
            // 易 parts: purple when active, gray when inactive
            return focusedKey === key ? ACTIVE_COLOR : MUTED_COLOR;
        };

        const handleClick = (key: string) => (e: React.MouseEvent) => {
            e.stopPropagation();
            onItemClick?.(key);
        };

        return (
            <g transform={`translate(${cx},${cy}) rotate(${rotation})`}>
                {/* HeartHand icon — love */}
                <g transform={`rotate(180) translate(0, ${bottomY})`}
                    className="cursor-pointer"
                    onClick={handleClick('❤')}>
                    {isHeartActive ? (
                        /* Active: anime.js animated heart via foreignObject */
                        <foreignObject
                            x={-fullSize / 2} y={-fullSize}
                            width={fullSize} height={fullSize}
                            overflow="visible"
                        >
                            <AnimatedHeartHandshake size={fullSize} color={RED_COLOR} />
                        </foreignObject>
                    ) : (
                        /* Inactive: small static heart */
                        <g transform={`scale(0.5) translate(-${fullSize / 2}, -${fullSize})`}>
                            <rect x={-4} y={-5} width={fullSize + 8} height={fullSize + 8} fill="transparent" />
                            <svg viewBox="0 0 24 24" width={fullSize} height={fullSize}
                                fill="none" stroke={color('❤')} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d={HEART_PATH} />
                            </svg>
                        </g>
                    )}
                </g>
                {/* Taiji (yin-yang) symbol */}
                <g className="cursor-pointer" onClick={handleClick('☯')}>
                    <circle r={largeRadius} fill="#fff" />
                    <circle r={largeRadius + 1.2} fill="none" stroke={color('☯')} strokeWidth={2} />
                    <path fill="#000"
                        d={`M0,${largeRadius}a${largeRadius},${largeRadius} 0 0 1 0,-${largeRadius * 2}a${radius / 2},${radius / 2} 0 0 1 0,${largeRadius}a${radius / 2},${radius / 2} 0 0 0 0,${largeRadius}`} />
                    <circle r={smallRadius} cy={radius / 2} fill="#000" />
                    <circle r={smallRadius} cy={-radius / 2} fill="#fff" />
                </g>
                {/* ── Yao line layout constants ──
                 * 易 is rendered at scale=0.17 from a ~90×200 path → ~15×34 visual.
                 * yaoH   = total yao line height (≈ 易 visual height × 0.6)
                 * yaoW   = line stroke width
                 * yaoGap = gap between yin halves
                 * yaoX   = horizontal offset from 易 center to outer edge
                 * yaoY   = vertical center of yao line (align with 易 center)
                 */}
                {(() => {
                    const yiScale = 0.17;
                    const yiVisualH = 200 * yiScale;       // ~34
                    const yiVisualW = 90 * yiScale;        // ~15.3
                    const yaoH = yiVisualH * 0.55;         // ~18.7 — shorter than 易 (side mode)
                    const yaoW = 2;
                    const yaoGap = 4;
                    const yaoX = yiVisualW + 4;             // well outside 易 edge (side mode)
                    const yaoY = -(yaoH / 2);              // centered vertically (side mode)
                    const yaoSegH = (yaoH - yaoGap) / 2;   // each yin segment (side mode)

                    // Horizontal (top) mode constants
                    const hLineW = yiVisualW * 0.7;         // ~10.7 — shorter than 易 width
                    const hLineH = 1.5;                     // thin stroke
                    const hLineSpacing = 2;                 // compact gap between stacked lines
                    const hYinGap = 2;                      // gap in broken yin line
                    // 易 center Y: translate is (0, -16), path spans 0..200, scale=0.17 → center ≈ -16 + 100*0.17 = 1
                    const yiCenterY = -16 + 100 * yiScale;
                    // top of 易 visual + small offset down
                    const hBaseY = yiCenterY - yiVisualH / 2;

                    const yangFill = isYiLeftActive ? ACTIVE_COLOR : '#ffffff';
                    const yinFill = isYiRightActive ? ACTIVE_COLOR : '#000000';
                    const yTranslateY = 4;

                    return (
                        <>
                            {/* Left 易 (mirrored) — white/yang side */}
                            <g transform={`rotate(180) translate(-${largeRadius + 2}, ${yTranslateY})`}
                                className="cursor-pointer" onClick={handleClick('1')}>
                                {showMonograms && (
                                    <>
                                        {yaoPosition === 'side'
                                            ? Array.from({ length: yaoLineCount }).map((_, i) => {
                                                const lineX = -yaoX - yaoW - i * (yaoW + 2);
                                                return (
                                                    <rect key={i} x={lineX} y={yaoY} width={yaoW} height={yaoH} rx={1}
                                                        fill={yangFill} opacity={0.9} />
                                                );
                                            })
                                            : Array.from({ length: yaoLineCount }).map((_, i) => {
                                                const lineY = hBaseY - (i + 1) * (hLineH + hLineSpacing);
                                                // Left 易 is mirrored: scale(-0.17), so visual center is at x = -yiVisualW/2
                                                const cx = -yiVisualW / 2;
                                                return (
                                                    <rect key={i} x={cx - hLineW / 2} y={lineY} width={hLineW} height={hLineH} rx={0.5}
                                                        fill={yangFill} opacity={0.9} />
                                                );
                                            })
                                        }
                                    </>
                                )}
                                <g transform={`translate(0, -16) scale(-${yiScale}, ${yiScale})`}>
                                    <path d={YI_PATH} fill={yangFill} stroke="none" opacity="0.9" />
                                </g>
                            </g>
                            {/* Right 易 — black/yin side */}
                            <g transform={`rotate(180) translate(${largeRadius + 2}, ${yTranslateY})`}
                                className="cursor-pointer" onClick={handleClick('0')}>
                                {showMonograms && (
                                    <>
                                        {yaoPosition === 'side'
                                            ? Array.from({ length: yaoLineCount }).map((_, i) => {
                                                const lineX = yaoX + i * (yaoW + 2);
                                                return (
                                                    <React.Fragment key={i}>
                                                        <rect x={lineX} y={yaoY} width={yaoW} height={yaoSegH} rx={1}
                                                            fill={yinFill} opacity={0.9} />
                                                        <rect x={lineX} y={yaoY + yaoSegH + yaoGap} width={yaoW} height={yaoSegH} rx={1}
                                                            fill={yinFill} opacity={0.9} />
                                                    </React.Fragment>
                                                );
                                            })
                                            : Array.from({ length: yaoLineCount }).map((_, i) => {
                                                const lineY = hBaseY - (i + 1) * (hLineH + hLineSpacing);
                                                const halfW = (hLineW - hYinGap) / 2;
                                                // Right 易 is normal: scale(0.17), so visual center is at x = yiVisualW/2
                                                const cx = yiVisualW / 2;
                                                return (
                                                    <React.Fragment key={i}>
                                                        <rect x={cx - hLineW / 2} y={lineY} width={halfW} height={hLineH} rx={0.5}
                                                            fill={yinFill} opacity={0.9} />
                                                        <rect x={cx - hLineW / 2 + halfW + hYinGap} y={lineY} width={halfW} height={hLineH} rx={0.5}
                                                            fill={yinFill} opacity={0.9} />
                                                    </React.Fragment>
                                                );
                                            })
                                        }
                                    </>
                                )}
                                <g transform={`translate(0, -16) scale(${yiScale}, ${yiScale})`}>
                                    <path d={YI_PATH} fill={yinFill} stroke="none" opacity="0.9" />
                                </g>
                            </g>
                        </>
                    );
                })()}
            </g>
        );
    };

/**
 * Standalone IChingDiagram — pure SVG centered on the taiji circle.
 * Heart icon extends above with overflow:visible.
 */
export const IChingDiagram: React.FC<IChingDiagramProps & {
    className?: string;
    style?: React.CSSProperties;
}> = ({
    className,
    style,
    ...props
}) => {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className={className}
                style={{ overflow: 'visible', ...style }}
                viewBox="-35 -35 70 70"
            >
                <IChingDiagramGroup {...props} cx={0} cy={0} />
            </svg>
        );
    };

export default IChingDiagram;
