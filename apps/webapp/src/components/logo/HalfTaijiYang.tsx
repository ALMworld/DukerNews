import React from 'react';

const HalfTaijiYang = ({ 
  size = 200, 
  yangColor = '#ffffff', 
  yinColor = '#000000', 
  borderColor = '#000000', 
  borderWidth = 2,
  className = ''
}) => {
  const radius = size / 2;
  const smallCircleRadius = radius / 2;
  const eyeRadius = radius / 8;
  const center = radius;

  // Yang path - corresponds to drawYang function in Dart
  const yangPath = `
    M ${center} ${center - radius}
    A ${radius} ${radius} 0 0 0 ${center} ${center + radius}
    A ${smallCircleRadius} ${smallCircleRadius} 0 0 1 ${center} ${center}
    A ${smallCircleRadius} ${smallCircleRadius} 0 0 0 ${center} ${center - radius}
    Z
  `;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Yang path (light side) */}
      <path
        d={yangPath}
        fill={yangColor}
      />
      
      {/* Yin eye in the bottom small circle area - matches Dart: Offset(0, -smallCircleRadius) */}
      <circle
        cx={center}
        cy={center - smallCircleRadius}
        r={eyeRadius}
        fill={yinColor}
      />
    </svg>
  );
};

export default HalfTaijiYang;