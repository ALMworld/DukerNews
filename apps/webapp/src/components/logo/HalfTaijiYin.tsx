import React from 'react';

const HalfTaijiYin = ({ 
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

  // Yin path - corresponds to drawYin function in Dart
  const yinPath = `
    M ${center} ${center + radius}
    A ${radius} ${radius} 0 0 0 ${center} ${center - radius}
    A ${smallCircleRadius} ${smallCircleRadius} 0 0 1 ${center} ${center}
    A ${smallCircleRadius} ${smallCircleRadius} 0 0 0 ${center} ${center + radius}
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
      {/* Yin path (dark side) */}
      <path
        d={yinPath}
        fill={yinColor}
      />
      
      {/* Yang eye in the top small circle area - matches Dart: Offset(0, smallCircleRadius) */}
      <circle
        cx={center}
        cy={center + smallCircleRadius}
        r={eyeRadius}
        fill={yangColor}
      />
    </svg>
  );
};

export default HalfTaijiYin;