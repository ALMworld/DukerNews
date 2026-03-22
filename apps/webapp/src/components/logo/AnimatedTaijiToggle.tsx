import type React from 'react';
import { useEffect, useState, useRef } from 'react';
import HalfTaijiYang from './HalfTaijiYang';
import HalfTaijiYin from './HalfTaijiYin';

interface AnimatedTaijiToggleProps {
    yangColor?: string;
    yinColor?: string;
    borderColor?: string;
    periodicDivisionUnionAnimation?: boolean;
    animationInterval?: number;
    inactivityResumeDelay?: number;
    borderWidth?: number;
    size?: number;
    className?: string;
    onToggle?: (isDivided: boolean) => void;
}

const AnimatedTaijiToggle: React.FC<AnimatedTaijiToggleProps> = ({
    yangColor = 'white',
    yinColor = 'black',
    borderColor = '#000000',
    periodicDivisionUnionAnimation = false,
    animationInterval = 8000,
    inactivityResumeDelay = 16000,
    borderWidth = 2,
    size = 16,
    className = '',
    onToggle,
}) => {
    const [separatedDist, setSeparatedDist] = useState(size * (0.5)); // Adaptive: scales with size (original ratio 12/16=0.75)
    const [isDivided, setIsDivided] = useState(false);
    const [yangRotation, setYangRotation] = useState(0);
    const [yinRotation, setYinRotation] = useState(0);
    const [yinTranslateDist, setYinTranslateDist] = useState(separatedDist);
    const [yangTranslateDist, setYangTranslateDist] = useState(separatedDist);
    const [isPaused, setIsPaused] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Add this effect to handle size changes dynamically
    useEffect(() => {
        const sep = size * (0.5);
        setYinTranslateDist(sep);
        setYangTranslateDist(size);
        setSeparatedDist(0);
    }, [size, isDivided]);

    const handleToggle = (isUserClick = false) => {
        if (isUserClick) {
            setIsPaused(true);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                setIsPaused(false);
            }, inactivityResumeDelay);
        }

        setIsDivided((prevIsDivided) => {
            const willBeDivided = !prevIsDivided;

            if (willBeDivided) {
                setYangRotation(Math.random() * 360);
                setYinRotation(Math.random() * 360);
                setYinTranslateDist(0);
                setYangTranslateDist(0);
            } else {
                setYangRotation(0);
                setYinRotation(0);
                setYinTranslateDist(separatedDist);
                setYangTranslateDist(separatedDist);
            }
            onToggle?.(willBeDivided);

            return willBeDivided;
        });
    };

    useEffect(() => {
        if (periodicDivisionUnionAnimation && !isPaused) {
            intervalRef.current = setInterval(() => {
                handleToggle();
            }, animationInterval);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [periodicDivisionUnionAnimation, isPaused, animationInterval, inactivityResumeDelay]);

    // Separate effect for unmount-only cleanup of timeout
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, []);

    return (
        <div
            className={`relative cursor-pointer ${className}`}
            style={{ width: size, height: size }}
            onClick={() => handleToggle(true)}
        >
            <div className="absolute top-0 left-0 flex items-center justify-center w-full h-full">
                <div
                    className="transition-all duration-500 ease-in-out transform -translate-x-1/2"
                    style={{
                        transform: `rotate(${yangRotation}deg) translateX(${yangTranslateDist}px)`,
                    }}
                >
                    <HalfTaijiYang
                        yinColor={yinColor}
                        yangColor={yangColor}
                        borderColor={borderColor}
                        borderWidth={borderWidth}
                        size={size}
                    />
                </div>
                <div
                    className="transition-all duration-500 ease-in-out transform"
                    style={{
                        transform: `rotate(${yinRotation}deg) translateX(-${yinTranslateDist}px)`,
                    }}
                >
                    <HalfTaijiYin
                        yinColor={yinColor}
                        yangColor={yangColor}
                        borderColor={borderColor}
                        borderWidth={borderWidth}
                        size={size}
                    />
                </div>
            </div>
        </div>
    );
};

export default AnimatedTaijiToggle;