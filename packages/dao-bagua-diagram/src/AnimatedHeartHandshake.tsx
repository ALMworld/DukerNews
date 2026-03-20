import { useEffect, useRef } from 'react';
import { animate, createScope, svg } from 'animejs';

interface AnimatedHeartHandshakeProps {
    size?: number;
    className?: string;
    color?: string;
}

const HEART_PATH = "M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762";

/**
 * HeartHandshake SVG animated with anime.js v4:
 *  1. Glowing particle traces the heart path via createMotionPath
 *  2. Line drawing animation via createDrawable
 */
export function AnimatedHeartHandshake({ size = 32, className = '', color = '#ef4444' }: AnimatedHeartHandshakeProps) {
    const root = useRef<HTMLDivElement>(null);
    const scope = useRef<ReturnType<typeof createScope> | null>(null);

    useEffect(() => {
        if (!root.current) return;

        scope.current = createScope({ root }).add(() => {
            // Particle follows the heart path
            animate('.heart-particle', {
                ease: 'linear',
                duration: 5000,
                loop: true,
                ...svg.createMotionPath('.heart-path'),
            });
        });

        return () => scope.current?.revert();
    }, []);

    return (
        <div ref={root} className={className} style={{ position: 'relative', width: size, height: size }}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ overflow: 'visible' }}
            >
                <path className="heart-path" d={HEART_PATH} />
            </svg>
            {/* Glowing particle that follows the heart path */}
            <div
                className="heart-particle"
                style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: 3,
                    height: 3,
                    borderRadius: '50%',
                    background: '#a855f7',
                    boxShadow: '0 0 6px 2px #a855f7',
                    pointerEvents: 'none',
                }}
            />
        </div>
    );
}

export default AnimatedHeartHandshake;
