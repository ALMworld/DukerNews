import { useState } from 'react';
import { Section, BaguaSections, DualityDaoLoveSection } from './types';
import { iChingRawNames } from './data';

interface BaguaDukiDAOProps {
    onElementClick?: (id: Section) => void;
    bpsArr?: number[];
    showText?: boolean;
}

const radius = 92.5;
const centerX = 273.70739;
const centerY = 273.70739;

const getPointOnCircle = (section: Section, offset: number = 148) => {
    const textRotation = - (section.arr_index - 1) * 45;
    const radian = textRotation * Math.PI / 180;
    return {
        x: centerX + (radius + offset) * Math.sin(radian),
        y: centerY - (radius + offset) * Math.cos(radian),
        rotation: textRotation
    };
};

export const BaguaDukiDAO: React.FC<BaguaDukiDAOProps> = ({
    onElementClick,
    bpsArr = [0, 0, 0, 0, 0, 0, 0, 0, 0],
    showText = true
}) => {
    const [internalSection, setInternalSection] = useState<Section>(DualityDaoLoveSection);

    const getDynamicStyles = (section: Section): React.CSSProperties => {
        if (section.seq === internalSection.seq) {
            return {
                fill: section.color,
                opacity: section.opacity,
                stroke: '#00f',
                strokeWidth: section.seq === DualityDaoLoveSection.seq ? 8 : 0,
                transition: 'all 0.3s ease',
                cursor: 'pointer'
            };
        }
        return {
            fill: "#bb94f4",
            opacity: 0.4,
            cursor: 'pointer'
        };
    };

    const handleClick = (elementId: Section) => (event: React.MouseEvent) => {
        event.stopPropagation();
        setInternalSection(elementId);
        onElementClick?.(elementId);
    };

    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="547.41479" height="547.41479"
            viewBox="0 0 547.41479 547.41479"
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
            version="1.0">
            <defs>
                <filter id="f">
                    <feGaussianBlur stdDeviation="7.66" />
                </filter>
            </defs>

            <title id="bagua-duki">DAO IS LOVE - DUKI In Action</title>
            <g id="wills"
                style={{
                    fill: '#000000',
                    fillOpacity: 1,
                    fillRule: 'nonzero',
                    stroke: '#88888f',
                    strokeWidth: 1,
                    strokeLinecap: 'butt',
                    strokeLinejoin: 'round',
                    strokeMiterlimit: 4,
                    strokeOpacity: 1,
                    strokeDasharray: 'none'
                }}
            >
                <g id="Heaven" transform="matrix(-1.4142136,-1.4142136,1.4142136,-1.4142136,-562.57796,661.11673)"
                    style={getDynamicStyles(BaguaSections[7])} onClick={handleClick(BaguaSections[7])}
                >
                    <path d="m -56.150316,480.50277 -54.588464,54.58847 -4.01932,-10.09403 48.640965,-48.64096 9.966819,4.14652 z" />
                    <path d="m -91.443826,466.26491 -33.532824,33.53282 -4.10512,-10.4095 27.39416,-27.39416 10.243784,4.27084 z" />
                    <path d="m -73.703903,473.6613 -43.964727,43.78796 -4.07773,-10.00136 37.96615,-37.96616 10.076307,4.17956 z" />
                </g>

                <g id="Marsh" transform="matrix(1.4142136,1.4142136,1.4142136,-1.4142136,-115.23781,1109.1021)"
                    style={getDynamicStyles(BaguaSections[6])} onClick={handleClick(BaguaSections[6])}
                >
                    <path d="m -230.14704,456.98159 0,-47.42257 10.26339,4.45787 0,38.7412 -10.26339,4.2235 z" />
                    <g transform="matrix(0,-1,1,0,-427.916,688.859)" id="g19810">
                        <path d="m 216.82691,162.80702 34.69975,0 -0.17047,9.97964 -30.4137,0 -4.11558,-9.97964 z" />
                        <path d="m 294.34988,162.63518 -34.69975,0 0.17047,9.97964 30.4137,0 4.11558,-9.97964 z" />
                    </g>
                    <path d="m -247.92109,464.29558 0.125,-62.05053 9.95542,4.18865 0,53.69224 -10.08042,4.16964 z" />
                </g>

                <g id="Fire" transform="matrix(0,-1,1,0,-0.42408989,547.57552)"
                    style={getDynamicStyles(BaguaSections[5])} onClick={handleClick(BaguaSections[5])}
                >
                    <path id="rect1929" d="m 195.38414,61.18398 154.3995,0 -8.59094,19.95928 -137.5774,0 -8.23116,-19.95928 z" />
                    <g transform="matrix(2,0,0,2,414.98,-66.3153)" id="g13458">
                        <path d="m -102.64956,80.813527 27.51516,-0.04187 -0.0242,10.1728 -23.07441,0 -4.41655,-10.13093 z" />
                        <path d="m -39.74639,80.817927 -27.39016,-0.04187 0.0242,10.1728 23.07441,0 4.29155,-10.13093 z" />
                    </g>
                    <path id="path12570" d="m 225.16132,131.23192 94.84514,0 -8.91574,20.52678 -77.4824,0 -8.447,-20.52678 z" />
                </g>

                <g id="Thunder" transform="matrix(-1.4142136,1.4142136,1.4142136,1.4142136,-562.20899,-116.46155)"
                    style={getDynamicStyles(BaguaSections[4])} onClick={handleClick(BaguaSections[4])}
                >
                    <g transform="matrix(0,1,-1,0,111.22,177.682)" id="g19700">
                        <path d="m 216.82691,162.80702 34.69975,0 -0.17047,9.97964 -30.4137,0 -4.11558,-9.97964 z" />
                        <path d="m 294.34988,162.63518 -34.69975,0 0.17047,9.97964 30.4137,0 4.11558,-9.97964 z" />
                    </g>
                    <g transform="matrix(0,1,-1,0,11.871,504.468)" id="g19708">
                        <path d="m -102.64956,80.813527 27.51516,-0.04187 -0.0242,10.1728 -23.07441,0 -4.41655,-10.13093 z" />
                        <path d="m -39.74639,80.817927 -27.39016,-0.04187 0.0242,10.1728 23.07441,0 4.29155,-10.13093 z" />
                    </g>
                    <path d="m -86.90256,409.55903 0,47.42256 -10.26339,-4.45787 0,-38.74119 10.26339,-4.2235 z" />
                </g>

                <g id="Earth" transform="matrix(-1.4142136,1.4142136,-1.4142136,-1.4142136,660.0843,1109.2251)"
                    style={getDynamicStyles(BaguaSections[0])} onClick={handleClick(BaguaSections[0])}
                >
                    <g transform="matrix(0.707107,0.707107,-0.707107,0.707107,11.4016,362.538)">
                        <path d="m -102.64956,80.813527 27.51516,-0.04187 -0.0242,10.1728 -23.07441,0 -4.41655,-10.13093 z" />
                        <path d="m -39.74639,80.817927 -27.39016,-0.04187 0.0242,10.1728 23.07441,0 4.29155,-10.13093 z" />
                    </g>
                    <g transform="matrix(0.707107,0.707107,-0.707107,0.707107,-166.243,93.7181)">
                        <g transform="translate(-11.125,0.125)">
                            <path d="m 232.19323,162.71031 19.36354,0 -0.0174,10.57937 -14.91551,0 -4.43065,-10.57937 z" />
                            <path d="m 279.05677,162.83531 -19.36354,0 0.0174,10.57937 14.91551,0 4.43065,-10.57937 z" />
                        </g>
                    </g>
                    <g transform="matrix(0.707107,0.707107,-0.707107,0.707107,-149.671,61.4644)">
                        <path d="m 216.82691,162.80702 34.69975,0 -0.17047,9.97964 -30.4137,0 -4.11558,-9.97964 z" />
                        <path d="m 294.34988,162.63518 -34.69975,0 0.17047,9.97964 30.4137,0 4.11558,-9.97964 z" />
                    </g>
                </g>

                <g id="Mountain" transform="matrix(0,-2.0000001,2.0000001,0,-588.20858,-43.662709)"
                    style={getDynamicStyles(BaguaSections[1])} onClick={handleClick(BaguaSections[1])}
                >
                    <path d="m -206.06096,533.89948 -54.58846,-54.58847 10.09403,-4.0193 48.64096,48.64094 -4.14653,9.96683 z" />
                    <g transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,-328.778,501.339)">
                        <path d="m -102.64956,80.813527 27.51516,-0.04187 -0.0242,10.1728 -23.07441,0 -4.41655,-10.13093 z" />
                        <path d="m -39.74639,80.817927 -27.39016,-0.04187 0.0242,10.1728 23.07441,0 4.29155,-10.13093 z" />
                    </g>
                    <g transform="matrix(-0.707107,-0.707107,0.707107,-0.707107,-151.133,770.158)">
                        <g transform="translate(-11.125,0.125)">
                            <path d="m 232.19323,162.71031 19.36354,0 -0.0174,10.57937 -14.91551,0 -4.43065,-10.57937 z" />
                            <path d="m 279.05677,162.83531 -19.36354,0 0.0174,10.57937 14.91551,0 4.43065,-10.57937 z" />
                        </g>
                    </g>
                </g>

                <g id="Water" transform="matrix(0,-2.0000001,2.0000001,0,-593.37512,-42.477538)"
                    style={getDynamicStyles(BaguaSections[2])} onClick={handleClick(BaguaSections[2])}
                >
                    <g transform="matrix(1,0,0,-1,-403.22,666.434)">
                        <g transform="translate(-11.125,0.125)">
                            <path d="m 232.19323,162.71031 19.36354,0 -0.0174,10.57937 -14.91551,0 -4.43065,-10.57937 z" />
                            <path d="m 279.05677,162.83531 -19.36354,0 0.0174,10.57937 14.91551,0 4.43065,-10.57937 z" />
                        </g>
                    </g>
                    <g transform="matrix(1,0,0,-1,-414.308,701.313)">
                        <path d="m 216.82691,162.80702 34.69975,0 -0.17047,9.97964 -30.4137,0 -4.11558,-9.97964 z" />
                        <path d="m 294.34988,162.63518 -34.69975,0 0.17047,9.97964 30.4137,0 4.11558,-9.97964 z" />
                    </g>
                    <path d="m -189.74477,521.31812 62.05053,-0.125 -4.18865,-9.95542 -53.69224,0 -4.16964,10.08042 z" />
                </g>
                <g id="Wind" transform="matrix(0,2.0000001,-2.0000001,0,1137.4737,591.16344)"
                    style={getDynamicStyles(BaguaSections[3])} onClick={handleClick(BaguaSections[3])}
                >
                    <path d="m -261.04407,384.78595 54.58846,-54.58847 4.01933,10.09402 -48.64097,48.64096 -9.96682,-4.14651 z" />
                    <g transform="matrix(0.707107,-0.707107,0.707107,0.707107,-497.119,439.898)">
                        <g transform="translate(-11.125,0.125)">
                            <path d="m 232.19323,162.71031 19.36354,0 -0.0174,10.57937 -14.91551,0 -4.43065,-10.57937 z" />
                            <path d="m 279.05677,162.83531 -19.36354,0 0.0174,10.57937 14.91551,0 4.43065,-10.57937 z" />
                        </g>
                    </g>
                    <path d="m -243.57752,391.54037 43.96472,-43.78795 4.07773,10.00136 -37.96614,37.96614 -10.07631,-4.17955 z" />
                </g>

            </g>
            <g id="yinyang_dao_love" onClick={handleClick(DualityDaoLoveSection)} >
                <circle cx="273.70739" cy="273.70739" style={getDynamicStyles(internalSection)} r="85.5" opacity="0.5" filter="url(#f)" />

                {showText && BaguaSections.filter(section => section.seq !== DualityDaoLoveSection.seq).map((section) => {
                    const point = getPointOnCircle(section);
                    const isSelected = internalSection.seq === section.seq;

                    const trigramData = iChingRawNames[
                        section.seq === 0 ? '000' :
                            section.seq === 1 ? '001' :
                                section.seq === 2 ? '010' :
                                    section.seq === 3 ? '011' :
                                        section.seq === 4 ? '100' :
                                            section.seq === 5 ? '101' :
                                                section.seq === 6 ? '110' : '111'
                    ];

                    return (
                        <g key={section.seq}>
                            <text
                                x={point.x}
                                y={point.y}
                                transform={`rotate(${point.rotation}, ${point.x}, ${point.y})`}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={isSelected ? section.color : "white"}
                                fontSize={"18"}
                            >
                                {trigramData?.name || section.id}
                            </text>
                        </g>
                    );
                })}

                <circle cx="273.70739" cy="273.70739" r="83" fill="#fff" stroke="black" strokeWidth="2" />

                <path d="m273.70739,190.70739 a41.5,41.5 0 0 1 0,83 41.5,41.5 0 0 0 0,83 83,83 0 0 0 0,-166" fill="#000" />

                <circle cx="273.70739" cy="232.20739" r="12.9" fill="#000" />
                <circle cx="273.70739" cy="315.20739" r="12.9" fill="#fff" />

            </g>

        </svg>
    );
};
