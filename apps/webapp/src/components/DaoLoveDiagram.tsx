import { TextType } from '../utils/iChingUtils';
import { iChingRawNames, WUJI_KEY } from '../utils/iChingData';
import React, { useCallback, useMemo } from 'react';
import { iChingLocales } from '../utils/iChingData';
import { guaRelatedColorMap, useUiStore, RelatedType, ringGuaRelatedColorMap } from '../utils/uiStore';

interface TaiChiDiagramProps {
    className?: string;
    onItemClick?: (key: string) => void;
    textType?: TextType
    hideTaiChi?: boolean;
}

function generateLayerKeys(layer: number, base: number, groupSize: number, wujiKey: string, natural: boolean = false): string[] {
    if (layer === 0) return [wujiKey];
    if (layer > groupSize + 1) throw new Error('Invalid layer');
    if (layer <= groupSize) {
        if (natural) {
            const len = layer;
            const max = Math.pow(base, len) - 1;
            const keys: string[] = [];
            for (let num = 0; num <= max; num++) {
                keys.push(num.toString(base).padStart(len, '0'));
            }
            return keys.reverse();
        }
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
    } else {
        if (natural) {
            const len = groupSize;
            const max = Math.pow(base, len) - 1;
            const keys: string[] = [];
            for (let pre = 0; pre <= max; pre++) {
                const preStr = pre.toString(base).padStart(len, '0');
                for (let post = 0; post <= max; post++) {
                    const postStr = post.toString(base).padStart(len, '0');
                    keys.push(preStr + postStr);
                }
            }
            return keys.reverse();
        }
        const len = groupSize;
        const half = Math.pow(base, len - 1);
        const max = Math.pow(base, len) - 1;
        const keys: string[] = [];
        for (let pre = half; pre <= max; pre++) {
            const preStr = pre.toString(base).padStart(len, '0');
            for (let post = 0; post <= max; post++) {
                const postStr = post.toString(base).padStart(len, '0');
                keys.push(preStr + postStr);
            }
        }
        for (let pre = half - 1; pre >= 0; pre--) {
            const preStr = pre.toString(base).padStart(len, '0');
            for (let post = max; post >= 0; post--) {
                const postStr = post.toString(base).padStart(len, '0');
                keys.push(preStr + postStr);
            }
        }
        return keys;
    }
}

export const DaoLoveDiagram: React.FC<TaiChiDiagramProps> = ({
    className,
    textType = 'SYMBOL',
    hideTaiChi = false
}) => {
    const iChingMap = iChingRawNames;
    const { isDark, zenIChingTarget, zenFocusOn, relatedHexagrams } = useUiStore();

    const branchingFactor = 2;
    const groupSize = 3;
    const numLayers = 5;
    const outerRadius = 280;

    const radii = useMemo(() => {
        const r: number[] = [];
        for (let i = 0; i < numLayers; i++) {
            r.push((i / (numLayers - 1)) * outerRadius);
        }
        return r;
    }, [numLayers, outerRadius]);

    const fontSizes = useMemo(() => {
        const fs: number[] = [];
        for (let i = 0; i < numLayers; i++) {
            if (i === 0) fs.push(32);
            else if (i === numLayers - 1) fs.push(28);
            else fs.push(64);
        }
        return fs;
    }, [numLayers]);

    const roundFontSizes = useMemo(() => fontSizes.map(fontSize => `${fontSize}px`), [fontSizes]);

    const joinLineColor = isDark ? "#ffffff" : "#000000";

    const layerColors = useMemo(() => isDark ? [
        '#ffffff',
        '#ccc',
        '#ccc',
        '#ffffff',
        '#ffffff'
    ] : [
        '#000000',
        '#000000',
        '#000000',
        '#000000',
        '#000000'
    ], [isDark]);

    const c = useCallback((key: string) => {
        if (iChingMap === undefined || iChingMap[key] === undefined) {
            return '';
        }
        const val = iChingMap[key];

        if (textType === '') {
            return val.name;
        } else if (textType === 'SYMBOL') {
            return iChingRawNames[key]?.symbol || '';
        } else if (textType === 'NAME') {
            return val.name;
        }
        return '';
    }, []);

    const layerKeys = useMemo(() => {
        const lk: string[][] = [];
        for (let l = 0; l < numLayers; l++) {
            lk.push(generateLayerKeys(l, branchingFactor, groupSize, WUJI_KEY));
        }
        return lk;
    }, [branchingFactor, groupSize, numLayers]);

    const startAngle = 93;
    const groupGapFactor = 2;

    const positions = useMemo(() => {
        const pos: Record<string, { x: number; y: number; angle: number }> = {};

        // Place outermost layer and its parent layer
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

        // Place inner layers
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

        // Layer 0 (center)
        pos[WUJI_KEY] = { x: 0, y: 0, angle: 0 };

        return pos;
    }, [radii, numLayers, groupGapFactor, startAngle]);

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
    }, [positions, radii, numLayers]);

    const pathsGroup = useMemo(() => (
        <g role="graphics-symbol" aria-roledescription="path mark container">
            {pathStrings.map((d, index) => (
                <path
                    key={index}
                    transform="translate(295,295)"
                    d={d}
                    stroke={joinLineColor}
                    strokeDasharray="1,5,5"
                    strokeWidth="0.3"
                />
            ))}
        </g>
    ), [pathStrings, joinLineColor]);

    const symbolsGroup = useMemo(() => (
        <g role="graphics-symbol" aria-roledescription="symbol mark container">
            {layerKeys.map((keys, layerIndex) => {
                const color = layerColors[layerIndex % layerColors.length];
                const fontSize = roundFontSizes[layerIndex];
                return keys.map((key) => {
                    const pos = positions[key];
                    let rot = pos.angle - 90;
                    rot += 180; // Add 180 degrees to rotate each element around its center

                    let textAnchor = 'middle';
                    let offsetX = 0;
                    let offsetY = 0;

                    // const relatedType = relatedHexagrams.relatedValueMap[key];
                    const isFocused = zenIChingTarget === key;
                    const symbolColor = isFocused ? ringGuaRelatedColorMap['identity'] : color;

                    // console.log(key, isFocused, symbolColor);

                    if (key === '☯' || key === '') {
                        if (hideTaiChi) {
                            return null;
                        }
                        rot += 90;
                        textAnchor = 'middle';
                        const size = parseFloat(fontSize);
                        const radius = size / 2;
                        const smallRadius = radius * 0.125;
                        const largeRadius = radius * 0.975;

                        return (
                            <g
                                key={key}
                                transform={`translate(${295 + pos.x},${295 + pos.y}) rotate(${rot}) translate(${offsetX},${offsetY})`}
                                onClick={() => zenFocusOn?.(key)}
                            >
                                <g transform={`rotate(180) translate(-16, ${-(largeRadius + 31)})`}
                                    className="cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); zenFocusOn?.('❤'); }}>
                                    <svg viewBox="0 0 24 24" width="32" height="32"
                                        fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <g transform="translate(12,12)">
                                            <animateTransform attributeName="transform" type="scale"
                                                values="1;1.06;1;1.02;1" dur="8s" repeatCount="indefinite" additive="sum" />
                                            <g transform="translate(-12,-12)">
                                                <path d="M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762" />
                                            </g>
                                        </g>
                                    </svg>
                                </g>
                                <g>
                                    <circle r={largeRadius} fill="#000" />
                                    {/* <circle r={largeRadius + 1.2} fill="none" stroke={symbolColor} strokeWidth={3} /> */}
                                    <circle r={largeRadius + 1.2} fill="none" stroke="red" strokeWidth={2} />
                                    <path
                                        fill="#fff"
                                        d={`M0,${largeRadius}a${largeRadius},${largeRadius} 0 0 1 0,-${largeRadius * 2}a${radius / 2},${radius / 2} 0 0 1 0,${largeRadius}a${radius / 2},${radius / 2} 0 0 0 0,${largeRadius}`}
                                    />
                                    <circle r={smallRadius} cy={radius / 2} fill="#fff" />
                                    <circle r={smallRadius} cy={-radius / 2} fill="#000" />
                                    {/* Heart-handshake icon on top of taichi */}

                                </g>
                            </g>
                        )
                    }
                    return (
                        <g
                            key={key}
                            className='cursor-pointer'
                            transform={`translate(${295 + pos.x},${295 + pos.y}) rotate(${rot})`}
                        >

                            <text
                                textAnchor={textAnchor as 'middle' | 'start' | 'end'}
                                x={0}
                                y={(key === "0" || key === '1') ? -14 : 0}
                                dominantBaseline="middle"
                                fontFamily="Lato"
                                fontSize={fontSize}
                                fontWeight="400"
                                fill={symbolColor}
                                opacity="1"
                                onClick={() => zenFocusOn?.(key)}
                            >
                                {c(key)}
                            </text>
                        </g>
                    );
                });
            })}
        </g>
    ), [hideTaiChi, c, isDark, zenIChingTarget]);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            version="1.1"
            className={className}
            viewBox="0 0 592 592"
        >
            <style>
                {`
                text {
                    cursor: pointer;
                    fontSize: 14px;
                }
                `}
            </style>
            <g fill="none" strokeMiterlimit={10} transform="translate(1,1)">
                <g role="graphics-object" aria-roledescription="group mark container">
                    <g transform="translate(0,0)">
                        <path
                            className="background"
                            aria-hidden="true"
                            d="M0,0h590v590h-590Z"
                        />
                        <g>
                            {/* Paths */}
                            {pathsGroup}

                            {/* Symbols */}
                            {symbolsGroup}
                        </g>
                    </g>
                </g>
            </g>
        </svg>
    );
};

export default DaoLoveDiagram;