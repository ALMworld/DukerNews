import { iChingRawNames, WUJI_KEY } from './data';
import React, { useMemo, useState } from 'react';
import ShaderCanvas from './ShaderCanvas2';
import { IChingDiagramGroup } from './IChingDiagram';

// ── Color theme types ──
export type GuaColorStyle = { fill: string; opacity: number };
export type BaguaColorTheme = {
    name: string;
    /** Per-gua element colors shown in the normal (unfocused) state */
    guaColorMap: Record<string, GuaColorStyle>;
    /** Consistent style applied to the focused/selected gua */
    focusStyle: GuaColorStyle;
};

// ── Pre-built theme presets ──
// Key mapping: 111=乾天, 110=兑泽, 101=离火, 100=震雷, 011=巽风, 010=坎水, 001=艮山, 000=坤地
export const BAGUA_THEMES: BaguaColorTheme[] = [
    {
        name: '阴阳',
        focusStyle: { fill: 'var(--color-purple-500)', opacity: 1 },
        guaColorMap: {
            // Layer 1: yin=black, yang=white
            '0': { fill: '#000000', opacity: 1 },   // 阴 Yin — black
            '1': { fill: '#FFFFFF', opacity: 1 },   // 阳 Yang — white
            // Layer 2: 0/3 → 3/3 linear gradient
            '00': { fill: '#000000', opacity: 1 },   // 太阴 — 0/3
            '01': { fill: '#555555', opacity: 1 },   // 少阳 — 1/3
            '10': { fill: '#AAAAAA', opacity: 1 },   // 少阴 — 2/3
            '11': { fill: '#FFFFFF', opacity: 1 },   // 太阳 — 3/3
            // Layer 3: 0/7 → 7/7 linear gradient (000=black → 111=white)
            '000': { fill: '#000000', opacity: 1 },   // 坤 地 — 0/7
            '001': { fill: '#242424', opacity: 1 },   // 艮 山 — 1/7
            '010': { fill: '#494949', opacity: 1 },   // 坎 水 — 2/7
            '011': { fill: '#6D6D6D', opacity: 1 },   // 巽 风 — 3/7
            '100': { fill: '#929292', opacity: 1 },   // 震 雷 — 4/7
            '101': { fill: '#B6B6B6', opacity: 1 },   // 离 火 — 5/7
            '110': { fill: '#DBDBDB', opacity: 1 },   // 兑 泽 — 6/7
            '111': { fill: '#FFFFFF', opacity: 1 },   // 乾 天 — 7/7
        }
    },
    {
        name: '自然',
        focusStyle: { fill: 'var(--color-purple-500)', opacity: 1 },
        guaColorMap: {
            '1': { fill: '#F5C542', opacity: 0.7 },   // 阳 Yang — Gold
            '0': { fill: '#2196F3', opacity: 0.7 },   // 阴 Yin — Blue
            '11': { fill: '#FFD54F', opacity: 0.6 },   // 太阳 Greater Yang — Bright Gold
            '10': { fill: '#AB47BC', opacity: 0.6 },   // 少阴 Lesser Yin — Purple
            '01': { fill: '#26A69A', opacity: 0.6 },   // 少阳 Lesser Yang — Teal
            '00': { fill: '#1565C0', opacity: 0.6 },   // 太阴 Greater Yin — Deep Blue
            '111': { fill: '#F5C542', opacity: 0.5 },   // 乾 Qián 天 Heaven — Gold
            '110': { fill: '#26C6DA', opacity: 0.5 },   // 兑 Duì 泽 Lake — Cyan
            '101': { fill: '#FF6B35', opacity: 0.5 },   // 离 Lí 火 Fire — Orange-Red
            '100': { fill: '#7E57C2', opacity: 0.5 },   // 震 Zhèn 雷 Thunder — Violet
            '011': { fill: '#66BB6A', opacity: 0.5 },   // 巽 Xùn 风 Wind — Green
            '010': { fill: '#2196F3', opacity: 0.5 },   // 坎 Kǎn 水 Water — Blue
            '001': { fill: '#A1887F', opacity: 0.5 },   // 艮 Gèn 山 Mountain — Brown
            '000': { fill: '#5D4037', opacity: 0.5 },   // 坤 Kūn 地 Earth — Dark Earth
        }
    },
    {
        name: '五彩',
        focusStyle: { fill: 'var(--color-purple-500)', opacity: 1 },
        guaColorMap: {
            '1': { fill: '#FF9800', opacity: 0.7 },
            '0': { fill: '#3F51B5', opacity: 0.7 },
            '11': { fill: '#FF5722', opacity: 0.6 },
            '10': { fill: '#E91E63', opacity: 0.6 },
            '01': { fill: '#009688', opacity: 0.6 },
            '00': { fill: '#1A237E', opacity: 0.6 },
            '111': { fill: '#FFD700', opacity: 0.5 },   // 乾 — Gold
            '110': { fill: '#00ACC1', opacity: 0.5 },   // 兑 — Aqua
            '101': { fill: '#F44336', opacity: 0.5 },   // 离 — Red
            '100': { fill: '#9C27B0', opacity: 0.5 },   // 震 — Purple
            '011': { fill: '#4CAF50', opacity: 0.5 },   // 巽 — Green
            '010': { fill: '#2962FF', opacity: 0.5 },   // 坎 — Blue
            '001': { fill: '#795548', opacity: 0.5 },   // 艮 — Brown
            '000': { fill: '#37474F', opacity: 0.5 },   // 坤 — Dark Gray
        }
    },
    {
        name: '道',
        focusStyle: { fill: 'var(--color-purple-500, #a855f7)', opacity: 1 },
        guaColorMap: {
            '1': { fill: '#ef4444', opacity: 0.7 },   // 阳 Yang — Red
            '0': { fill: '#991b1b', opacity: 0.7 },   // 阴 Yin — Dark Red
            '11': { fill: '#f87171', opacity: 0.6 },   // 太阳 — Light Red
            '10': { fill: '#dc2626', opacity: 0.6 },   // 少阴 — Medium Red
            '01': { fill: '#b91c1c', opacity: 0.6 },   // 少阳 — Deep Red
            '00': { fill: '#7f1d1d', opacity: 0.6 },   // 太阴 — Darkest Red
            '111': { fill: '#fca5a5', opacity: 0.5 },   // 乾 天 — Rose
            '110': { fill: '#f87171', opacity: 0.5 },   // 兑 泽 — Light Red
            '101': { fill: '#ef4444', opacity: 0.5 },   // 离 火 — Red
            '100': { fill: '#dc2626', opacity: 0.5 },   // 震 雷 — Medium Red
            '011': { fill: '#b91c1c', opacity: 0.5 },   // 巽 风 — Deep Red
            '010': { fill: '#991b1b', opacity: 0.5 },   // 坎 水 — Dark Red
            '001': { fill: '#7f1d1d', opacity: 0.5 },   // 艮 山 — Darker Red
            '000': { fill: '#450a0a', opacity: 0.5 },   // 坤 地 — Deepest Red
        }
    },
    {
        name: 'Light',
        focusStyle: { fill: 'var(--color-purple-500, #a855f7)', opacity: 1 },
        guaColorMap: {
            '0': { fill: '#999999', opacity: 1 },
            '1': { fill: '#ffffff', opacity: 1 },
            '00': { fill: '#808080', opacity: 1 },
            '01': { fill: '#aaaaaa', opacity: 1 },
            '10': { fill: '#d5d5d5', opacity: 1 },
            '11': { fill: '#ffffff', opacity: 1 },
            '000': { fill: '#666666', opacity: 1 },
            '001': { fill: '#808080', opacity: 1 },
            '010': { fill: '#999999', opacity: 1 },
            '011': { fill: '#b3b3b3', opacity: 1 },
            '100': { fill: '#cccccc', opacity: 1 },
            '101': { fill: '#d9d9d9', opacity: 1 },
            '110': { fill: '#ececec', opacity: 1 },
            '111': { fill: '#ffffff', opacity: 1 },
        }
    },
    {
        name: 'Dark',
        focusStyle: { fill: 'var(--color-purple-500, #a855f7)', opacity: 1 },
        guaColorMap: {
            '0': { fill: '#000000', opacity: 1 },
            '1': { fill: '#555555', opacity: 1 },
            '00': { fill: '#000000', opacity: 1 },
            '01': { fill: '#1a1a1a', opacity: 1 },
            '10': { fill: '#333333', opacity: 1 },
            '11': { fill: '#555555', opacity: 1 },
            '000': { fill: '#000000', opacity: 1 },
            '001': { fill: '#0d0d0d', opacity: 1 },
            '010': { fill: '#1a1a1a', opacity: 1 },
            '011': { fill: '#262626', opacity: 1 },
            '100': { fill: '#333333', opacity: 1 },
            '101': { fill: '#404040', opacity: 1 },
            '110': { fill: '#4d4d4d', opacity: 1 },
            '111': { fill: '#595959', opacity: 1 },
        }
    },
];

export interface DaoBaguaDiagramProps {
    className?: string;
    style?: React.CSSProperties;
    onItemClick?: (key: string) => void;
    hideTaiChi?: boolean;
    curvedYao?: boolean;
    hideInnerText?: boolean;
    showDebug?: boolean;
    /** Color theme for gua elements. Defaults to BAGUA_THEMES[0] (阴阳 grayscale). */
    colorTheme?: BaguaColorTheme;
    /** Whether the host app is in dark mode. Defaults to true. */
    isDark?: boolean;
    /** Currently focused/selected gua key (e.g. '111', '010', '☯'). */
    focusedKey?: string;
    /** Called when the focused gua changes (e.g. user clicks a trigram). */
    onFocusChange?: (key: string) => void;
}

function generateLayerKeys(layer: number, base: number, groupSize: number, wujiKey: string): string[] {
    if (layer === 0) return [wujiKey];
    if (layer > groupSize) throw new Error('Invalid layer');
    const len = layer;
    const half = Math.pow(base, len - 1);
    const max = Math.pow(base, len) - 1;
    const keys: string[] = [];
    for (let num = half; num <= max; num++) {
        keys.push(num.toString(base).padStart(len, '0'));
    }
    for (let num = half - 1; num >= 0; num--) {
        keys.push(num.toString(base).padStart(len, '0'));
    }
    return keys;
}

/**
 * Generate SVG path for an annular sector.
 * When curved=true, inner/outer edges follow circle arcs.
 * When curved=false, all edges are straight lines (trapezoid).
 */
function annularSectorPath(
    cx: number, cy: number,
    r1: number, r2: number,
    startDeg: number, endDeg: number,
    curved: boolean = true
): string {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;

    const x1Inner = cx + r1 * Math.cos(startRad);
    const y1Inner = cy + r1 * Math.sin(startRad);
    const x2Inner = cx + r1 * Math.cos(endRad);
    const y2Inner = cy + r1 * Math.sin(endRad);
    const x1Outer = cx + r2 * Math.cos(startRad);
    const y1Outer = cy + r2 * Math.sin(startRad);
    const x2Outer = cx + r2 * Math.cos(endRad);
    const y2Outer = cy + r2 * Math.sin(endRad);

    // Determine arc sweep: angular span < 180° → small arc (0)
    let angleDelta = endDeg - startDeg;
    if (angleDelta < 0) angleDelta += 360;
    const largeArc = angleDelta > 180 ? 1 : 0;

    if (curved) {
        // Inner arc: startAngle → endAngle at r1 (sweep clockwise if endDeg > startDeg)
        // Outer arc: endAngle → startAngle at r2 (reverse direction)
        return [
            `M${x1Inner},${y1Inner}`,
            `A${r1},${r1} 0 ${largeArc},1 ${x2Inner},${y2Inner}`,
            `L${x2Outer},${y2Outer}`,
            `A${r2},${r2} 0 ${largeArc},0 ${x1Outer},${y1Outer}`,
            'Z'
        ].join(' ');
    }

    return [
        `M${x1Inner},${y1Inner}`,
        `L${x2Inner},${y2Inner}`,
        `L${x2Outer},${y2Outer}`,
        `L${x1Outer},${y1Outer}`,
        'Z'
    ].join(' ');
}

/**
 * Generate two SVG paths for a broken yin yao line — split in the middle
 * with a constant-width gap. When curved=true, inner/outer edges follow circle arcs.
 */
function yinSectorPaths(
    cx: number, cy: number,
    r1: number, r2: number,
    startDeg: number, endDeg: number,
    gapWidth: number,
    curved: boolean = true
): [string, string] {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const midDeg = (startDeg + endDeg) / 2;

    // Four corners: A(inner-start), B(inner-end), C(outer-end), D(outer-start)
    const ax = cx + r1 * Math.cos(startRad), ay = cy + r1 * Math.sin(startRad);
    const bx = cx + r1 * Math.cos(endRad), by = cy + r1 * Math.sin(endRad);
    const ccx = cx + r2 * Math.cos(endRad), ccy = cy + r2 * Math.sin(endRad);
    const dx = cx + r2 * Math.cos(startRad), dy = cy + r2 * Math.sin(startRad);

    // Gap half-width in angular terms at each radius
    const innerGapHalfDeg = (gapWidth / (2 * r1)) * (180 / Math.PI);
    const outerGapHalfDeg = (gapWidth / (2 * r2)) * (180 / Math.PI);

    // Gap edge angles (in radians) for precise points on the circles
    const gapInnerStartRad = ((midDeg - innerGapHalfDeg) * Math.PI) / 180;
    const gapInnerEndRad = ((midDeg + innerGapHalfDeg) * Math.PI) / 180;
    const gapOuterStartRad = ((midDeg - outerGapHalfDeg) * Math.PI) / 180;
    const gapOuterEndRad = ((midDeg + outerGapHalfDeg) * Math.PI) / 180;

    // Gap edge points on inner circle
    const gIsx = cx + r1 * Math.cos(gapInnerStartRad), gIsy = cy + r1 * Math.sin(gapInnerStartRad);
    const gIex = cx + r1 * Math.cos(gapInnerEndRad), gIey = cy + r1 * Math.sin(gapInnerEndRad);
    // Gap edge points on outer circle
    const gOsx = cx + r2 * Math.cos(gapOuterStartRad), gOsy = cy + r2 * Math.sin(gapOuterStartRad);
    const gOex = cx + r2 * Math.cos(gapOuterEndRad), gOey = cy + r2 * Math.sin(gapOuterEndRad);

    // Determine arc sizes (all sub-arcs are small since each half is < 45°)
    const largeArc = 0;

    if (curved) {
        // Left half: A → gapInnerStart (arc at r1), line to gapOuterStart, arc back to D (at r2)
        const left = [
            `M${ax},${ay}`,
            `A${r1},${r1} 0 ${largeArc},1 ${gIsx},${gIsy}`,
            `L${gOsx},${gOsy}`,
            `A${r2},${r2} 0 ${largeArc},0 ${dx},${dy}`,
            'Z'
        ].join(' ');

        // Right half: gapInnerEnd → B (arc at r1), line to C, arc back to gapOuterEnd (at r2)
        const right = [
            `M${gIex},${gIey}`,
            `A${r1},${r1} 0 ${largeArc},1 ${bx},${by}`,
            `L${ccx},${ccy}`,
            `A${r2},${r2} 0 ${largeArc},0 ${gOex},${gOey}`,
            'Z'
        ].join(' ');

        return [left, right];
    }

    // Straight-line fallback: use linear midpoints for the gap
    const mIx = (ax + bx) / 2, mIy = (ay + by) / 2;
    const mOx = (dx + ccx) / 2, mOy = (dy + ccy) / 2;

    const iDx = bx - ax, iDy = by - ay;
    const iLen = Math.sqrt(iDx * iDx + iDy * iDy);
    const iNx = iDx / iLen, iNy = iDy / iLen;

    const oDx = ccx - dx, oDy = ccy - dy;
    const oLen = Math.sqrt(oDx * oDx + oDy * oDy);
    const oNx = oDx / oLen, oNy = oDy / oLen;

    const hg = gapWidth / 2;

    const left = [
        `M${ax},${ay}`,
        `L${mIx - hg * iNx},${mIy - hg * iNy}`,
        `L${mOx - hg * oNx},${mOy - hg * oNy}`,
        `L${dx},${dy}`,
        'Z'
    ].join(' ');

    const right = [
        `M${mIx + hg * iNx},${mIy + hg * iNy}`,
        `L${bx},${by}`,
        `L${ccx},${ccy}`,
        `L${mOx + hg * oNx},${mOy + hg * oNy}`,
        'Z'
    ].join(' ');

    return [left, right];
}

/**
 * Unified function to render yao line sectors for a single gua key.
 * Returns an array of <path> elements (yang = 1 path per yao, yin = 2 paths per yao).
 */
function renderYaoLines(params: {
    keyPrefix: string;
    key: string;
    cx: number; cy: number;
    ringInnerR: number;
    yaoCount: number;
    angle: number;
    halfSpan: number;
    yaoThickness: number;
    radialGap: number;
    yinGapWidth: number;
    curved: boolean;
    fill: string;
    opacity: number;
    stroke: string;
    strokeWidth: number;
    focusFilter?: string;
    onClick: () => void;
}): React.ReactElement[] {
    const {
        keyPrefix, key, cx, cy, ringInnerR, yaoCount, angle, halfSpan,
        yaoThickness, radialGap, yinGapWidth, curved,
        fill, opacity, stroke, strokeWidth, focusFilter, onClick
    } = params;
    const elements: React.ReactElement[] = [];

    for (let i = 0; i < yaoCount; i++) {
        const isYang = key[i] === '1';
        const r1 = ringInnerR + i * (yaoThickness + radialGap);
        const r2 = r1 + yaoThickness;

        if (isYang) {
            elements.push(
                <path key={`${keyPrefix}-${i}`}
                    d={annularSectorPath(cx, cy, r1, r2, angle - halfSpan, angle + halfSpan, curved)}
                    fill={fill} opacity={opacity}
                    stroke={stroke} strokeWidth={strokeWidth}
                    filter={focusFilter}
                    className="cursor-pointer" onClick={onClick} />
            );
        } else {
            const [leftPath, rightPath] = yinSectorPaths(
                cx, cy, r1, r2,
                angle - halfSpan, angle + halfSpan,
                yinGapWidth, curved
            );
            elements.push(
                <path key={`${keyPrefix}-${i}-a`} d={leftPath}
                    fill={fill} opacity={opacity} stroke={stroke} strokeWidth={strokeWidth}
                    filter={focusFilter}
                    className="cursor-pointer" onClick={onClick} />
            );
            elements.push(
                <path key={`${keyPrefix}-${i}-b`} d={rightPath}
                    fill={fill} opacity={opacity} stroke={stroke} strokeWidth={strokeWidth}
                    filter={focusFilter}
                    className="cursor-pointer" onClick={onClick} />
            );
        }
    }
    return elements;
}

export const DaoBaguaDiagram: React.FC<DaoBaguaDiagramProps> = ({
    className,
    style: styleProp,
    onItemClick,
    hideTaiChi: hideTaiChiProp = false,
    curvedYao: curvedYaoProp = true,
    hideInnerText: hideInnerTextProp = true,
    showDebug: showDebugProp = false,
    colorTheme: colorThemeProp = BAGUA_THEMES[0],
    isDark: isDarkProp = true,
    focusedKey: focusedKeyProp = '',
    onFocusChange,
}) => {
    const currentTheme = isDarkProp ? 'dark' : 'light';

    // Use props directly — fully controlled from outside
    const curvedYao = curvedYaoProp;
    const hideInnerText = hideInnerTextProp;
    const hideTaiChi = hideTaiChiProp;
    const activeTheme = colorThemeProp || BAGUA_THEMES[0];

    const handleClick = (key: string) => {
        onFocusChange?.(key);
        onItemClick?.(key);
    };

    const branchingFactor = 2;
    const groupSize = 3;
    const numLayers = 4;

    // ── Ring configuration ──
    const ringInnerR = 140;
    const ringOuterR = 265;
    const radialGap = 4;       // gap between yao bands
    const gapPixels = 6;       // consistent pixel-width gap between trigrams at all radii
    const yinGapWidth = 8;     // pixel width of gap in broken (yin) lines
    const yaoThickness = (ringOuterR - ringInnerR - (3 - 1) * radialGap) / 3;

    // Tree outerRadius = ringInnerR so connecting lines end at ring inner edge
    const outerRadius = ringInnerR;

    const radii = useMemo(() => {
        const r: number[] = [];
        for (let i = 0; i < numLayers; i++) {
            r.push((i / (numLayers - 1)) * outerRadius);
        }
        return r;
    }, [numLayers, outerRadius]);

    const joinLineColor = 'rgba(255,255,255,0.35)';
    const baguaStroke = 'rgba(80,40,120,0.6)';


    const layerKeys = useMemo(() => {
        const lk: string[][] = [];
        for (let l = 0; l < numLayers; l++) {
            lk.push(generateLayerKeys(l, branchingFactor, groupSize, WUJI_KEY));
        }
        return lk;
    }, [branchingFactor, groupSize, numLayers]);

    const startAngle = 112.5; // yang at 180° (left), yin at 0° (right)
    const groupGapFactor = 1;

    const positions = useMemo(() => {
        const pos: Record<string, { x: number; y: number; angle: number }> = {};

        const L = numLayers - 1;
        const r_outer = radii[L];
        const r_parent = radii[L - 1];
        const num_groups = layerKeys[L - 1].length;
        const items_per_group = layerKeys[L].length / num_groups;
        const advance = 360 / num_groups;
        const withinStep = advance / (items_per_group - 1 + groupGapFactor);
        const groupGap = groupGapFactor * withinStep;

        let currentAngle = startAngle;
        for (let g = 0; g < num_groups; g++) {
            const groupStart = currentAngle;
            let groupCurrent = currentAngle;
            for (let j = 0; j < items_per_group; j++) {
                const angleDeg = groupCurrent;
                const angleRad = (angleDeg * Math.PI) / 180;
                const x = r_outer * Math.cos(angleRad);
                const y = r_outer * Math.sin(angleRad);
                const key = layerKeys[L][g * items_per_group + j];
                pos[key] = { x, y, angle: angleDeg };
                groupCurrent += withinStep;
            }
            currentAngle = groupCurrent + groupGap - withinStep;

            const midAngle = groupStart + ((items_per_group - 1) * withinStep) / 2;
            const midRad = (midAngle * Math.PI) / 180;
            const px = r_parent * Math.cos(midRad);
            const py = r_parent * Math.sin(midRad);
            const pkey = layerKeys[L - 1][g];
            pos[pkey] = { x: px, y: py, angle: midAngle };
        }

        for (let pl = numLayers - 2; pl > 0; pl--) {
            const cl = pl + 1;
            const branch = layerKeys[cl].length / layerKeys[pl].length;
            for (let g = 0; g < layerKeys[pl].length; g++) {
                const startIdx = g * branch;
                const childKeys = layerKeys[cl].slice(startIdx, startIdx + branch);
                let sumCos = 0;
                let sumSin = 0;
                childKeys.forEach((ck) => {
                    const caRad = (pos[ck].angle * Math.PI) / 180;
                    sumCos += Math.cos(caRad);
                    sumSin += Math.sin(caRad);
                });
                const avgCos = sumCos / branch;
                const avgSin = sumSin / branch;
                let avgAngle = Math.atan2(avgSin, avgCos) * (180 / Math.PI);
                if (avgAngle < 0) avgAngle += 360;
                const pr = radii[pl];
                const px = pr * Math.cos((avgAngle * Math.PI) / 180);
                const py = pr * Math.sin((avgAngle * Math.PI) / 180);
                const pkey = layerKeys[pl][g];
                pos[pkey] = { x: px, y: py, angle: avgAngle };
            }
        }

        pos[WUJI_KEY] = { x: 0, y: 0, angle: 0 };
        return pos;
    }, [radii, numLayers, groupGapFactor, startAngle, layerKeys]);

    const pathStrings = useMemo(() => {
        const ps: string[] = [];
        for (let pl = 0; pl < numLayers - 1; pl++) {
            const cl = pl + 1;
            const branch = Math.round(layerKeys[cl].length / layerKeys[pl].length);
            for (let g = 0; g < layerKeys[pl].length; g++) {
                const startIdx = g * branch;
                const childKeys = layerKeys[cl].slice(startIdx, startIdx + branch);
                const pkey = layerKeys[pl][g];
                const parent = positions[pkey];
                const r_p = radii[pl];
                childKeys.forEach((ck) => {
                    const child = positions[ck];
                    let d: string;
                    if (r_p === 0) {
                        d = `M0,0L${child.x},${child.y}`;
                    } else {
                        let delta = child.angle - parent.angle;
                        if (delta > 180) delta -= 360;
                        if (delta < -180) delta += 360;
                        const sweep = delta > 0 ? 1 : 0;
                        const cRad = (child.angle * Math.PI) / 180;
                        const projX = r_p * Math.cos(cRad);
                        const projY = r_p * Math.sin(cRad);
                        d = `M${parent.x},${parent.y}A${r_p},${r_p} 0 0,${sweep} ${projX},${projY}L${child.x},${child.y}`;
                    }
                    ps.push(d);
                });
            }
        }
        return ps;
    }, [positions, radii, numLayers, layerKeys]);

    const cx = 295;
    const cy = 295;

    // ── Inner ring configuration ──
    const innerYaoThickness = 14;
    const innerRadialGap = 3;
    const innerYinGapWidth = 6;
    // Center yao rings at the same radii as the text symbols they replace
    const yinYangRingInner = radii[1] - innerYaoThickness / 2;  // 1 yao band centered at radii[1]
    const bigramTotalHeight = 2 * innerYaoThickness + innerRadialGap;
    const bigramRingInner = radii[2] - bigramTotalHeight / 2;   // 2 yao bands centered at radii[2]
    // All rings use a consistent ~45° base angular span per sector
    const innerBaseSpan = 45;

    // ── Theme-based color lookups ──
    const { guaColorMap, focusStyle } = activeTheme;

    // ── All yao line rings: yin/yang (layer 1), bigrams (layer 2), trigrams (layer 3) ──
    const allYaoRings = useMemo(() => {
        const elements: React.ReactElement[] = [];

        // Layer config: [layerIndex, ringInnerR, yaoCount, yaoThickness, radialGap, yinGapWidth, strokeWidth, baseSpan]
        // Only include inner layers (1, 2) when hideInnerText is true; trigrams (3) always shown
        const layerConfigs: [number, number, number, number, number, number, number, number][] = [
            ...(hideInnerText ? [
                [1, yinYangRingInner, 1, innerYaoThickness, innerRadialGap, innerYinGapWidth, 1, innerBaseSpan] as [number, number, number, number, number, number, number, number],
                [2, bigramRingInner, 2, innerYaoThickness, innerRadialGap, innerYinGapWidth, 1, innerBaseSpan] as [number, number, number, number, number, number, number, number],
            ] : []),
            [3, ringInnerR, 3, yaoThickness, radialGap, yinGapWidth, 1.5, 45],
        ];

        layerConfigs.forEach(([layerIdx, rInner, yaoCount, yaoTh, rGap, yinGap, sw, baseSpan]) => {
            const keys = layerKeys[layerIdx];
            keys.forEach((key) => {
                const θ = positions[key].angle;
                const isFocused = focusedKeyProp === key;
                const focusFilter = isFocused ? 'url(#purpleGlow)' : undefined;
                // Unfocused: show per-gua element color; Focused: consistent purple style
                const { fill, opacity } = isFocused
                    ? focusStyle
                    : (guaColorMap[key] || { fill: 'rgb(187,148,244)', opacity: 0.4 });

                // Compute angular gap from pixel gap at this ring's mid-radius
                const midR = rInner + yaoTh / 2;
                const angularGapDeg = (gapPixels / midR) * (180 / Math.PI);
                const halfSpan = (baseSpan - angularGapDeg) / 2;

                elements.push(...renderYaoLines({
                    keyPrefix: `L${layerIdx}-${key}`,
                    key, cx, cy,
                    ringInnerR: rInner,
                    yaoCount,
                    angle: θ,
                    halfSpan,
                    yaoThickness: yaoTh,
                    radialGap: rGap,
                    yinGapWidth: yinGap,
                    curved: curvedYao,
                    fill, opacity,
                    stroke: baguaStroke,
                    strokeWidth: sw,
                    focusFilter,
                    onClick: () => handleClick(key),
                }));
            });
        });

        return <g>{elements}</g>;
    }, [positions, layerKeys, focusedKeyProp, baguaStroke, cx, cy, curvedYao,
        ringInnerR, yaoThickness, radialGap, gapPixels, yinGapWidth,
        yinYangRingInner, bigramRingInner, innerYaoThickness, innerRadialGap,
        innerYinGapWidth, innerBaseSpan, hideInnerText, activeTheme,
        guaColorMap, focusStyle]);

    const pathsGroup = useMemo(() => (
        <g role="graphics-symbol" aria-roledescription="path mark container">
            {pathStrings.map((d, index) => (
                <path
                    key={index}
                    transform={`translate(${cx},${cy})`}
                    d={d}
                    stroke={joinLineColor}
                    strokeDasharray="1,5,5"
                    strokeWidth="0.3"
                />
            ))}
        </g>
    ), [pathStrings, joinLineColor]);

    // ── Inner layers 0-2 only (center + yin/yang + bigrams) ──
    const innerSymbols = useMemo(() => (
        <g role="graphics-symbol" aria-roledescription="inner symbol container">
            {layerKeys.slice(0, numLayers - 1).map((keys, layerIndex) => {
                return keys.map((key) => {
                    const pos = positions[key];
                    let rot = pos.angle - 90 + 180;

                    const isFocused = focusedKeyProp === key;
                    // Graduated gray based on yang count: more yang = whiter
                    const yangCount = key.split('').filter((c: string) => c === '1').length;
                    const keyLen = key.length || 1;
                    const brightness = Math.round((yangCount / keyLen) * 255);
                    const symbolColor = `rgb(${brightness},${brightness},${brightness})`;
                    const focusFilter = isFocused ? 'url(#purpleGlow)' : undefined;

                    if (key === '☯' || key === '') {
                        if (hideTaiChi) return null;
                        return (
                            <IChingDiagramGroup
                                key={key}
                                cx={cx + pos.x}
                                cy={cy + pos.y}
                                rotation={rot + 90}
                                showMonograms={false}
                                focusedKey={focusedKeyProp}
                                onItemClick={(k) => handleClick(k)}
                            />
                        );
                    }

                    // Skip text for layers 1 & 2 when hideInnerText is true (yao rings shown instead)
                    if (hideInnerText && layerIndex > 0) return null;

                    const fontSize = layerIndex === 0 ? '32px' : '64px';
                    const displayText = iChingRawNames[key]?.symbol || '';

                    return (
                        <g key={key} className="cursor-pointer"
                            transform={`translate(${cx + pos.x},${cy + pos.y}) rotate(${rot})`}
                            filter={focusFilter}>
                            <text textAnchor="middle" x={0}
                                y={(key === "0" || key === '1') ? -14 : 0}
                                dominantBaseline="middle" fontFamily="Lato"
                                fontSize={fontSize} fontWeight="400"
                                fill={symbolColor} opacity="1"
                                onClick={() => handleClick(key)}>
                                {displayText}
                            </text>
                        </g>
                    );
                });
            })}
        </g>
    ), [hideTaiChi, isDarkProp, focusedKeyProp, positions, layerKeys, hideInnerText, currentTheme]);

    return (
        <div className={className} style={{ position: 'relative', ...styleProp }}>
            <div style={{ position: 'absolute', top: '0%', left: '0%', width: '100%', height: '100%', borderRadius: '0%', overflow: 'hidden' }}>
                <ShaderCanvas bgColor={currentTheme === 'dark' ? '#1e1b4b' : '#ede9fe'} />
            </div>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
                version="1.1"
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
                viewBox="0 0 590 590"
            >
                <defs>
                    <radialGradient id="purpleBg" cx="50%" cy="50%" r="55%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="35%" stopColor="#6b21a8" />
                        <stop offset="70%" stopColor="#4c1d95" />
                        <stop offset="100%" stopColor="#1e1b4b" />
                    </radialGradient>
                    <radialGradient id="lightBg" cx="50%" cy="50%" r="55%">
                        <stop offset="0%" stopColor="#7c3aed" />
                        <stop offset="40%" stopColor="#6d28d9" />
                        <stop offset="75%" stopColor="#5b21b6" />
                        <stop offset="100%" stopColor="#ddd6fe" />
                    </radialGradient>
                    <radialGradient id="centerGlow" cx="50%" cy="50%" r="35%">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={currentTheme === 'dark' ? 0.4 : 0.15} />
                        <stop offset="60%" stopColor="#7c3aed" stopOpacity={currentTheme === 'dark' ? 0.1 : 0.05} />
                        <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
                    </radialGradient>
                    <filter id="purpleGlow" x="-40%" y="-40%" width="180%" height="180%">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                        <feFlood floodColor="#a78bfa" floodOpacity="0.8" result="glowColor" />
                        <feComposite in="glowColor" in2="blur" operator="in" result="glow" />
                        <feMerge>
                            <feMergeNode in="glow" />
                            <feMergeNode in="glow" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <style>{`text { cursor: pointer; }`}</style>
                <rect x="0" y="0" width="590" height="590" rx="16" fill="url(#purpleBg)" opacity={0.3} />
                <g fill="none" strokeMiterlimit={10}>
                    {allYaoRings}
                    {pathsGroup}
                    {innerSymbols}
                </g>
            </svg>
        </div>
    );
};

export default DaoBaguaDiagram;
