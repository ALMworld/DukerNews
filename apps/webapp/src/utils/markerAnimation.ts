import { animate, spring } from 'animejs';

/**
 * Anime.js-powered marker pulse animation.
 * Applies a bounce scale + glow shadow to a marker's DOM element.
 */
export function pulseMarkerElement(el: HTMLElement): void {
    // Reset any prior transform
    el.style.transformOrigin = 'center bottom';

    animate(el, {
        scale: [
            { to: 1.6, ease: 'out(2)', duration: 300 },
            { to: 1, ease: spring({ stiffness: 300, damping: 12 }), duration: 600 },
        ],
        filter: [
            'drop-shadow(0 0 0px rgba(255,200,50,0))',
            'drop-shadow(0 0 12px rgba(255,200,50,0.8))',
            'drop-shadow(0 0 4px rgba(255,200,50,0.3))',
        ],
        duration: 900,
    });
}

/**
 * Reset marker element to its default visual state.
 */
export function resetMarkerElement(el: HTMLElement): void {
    animate(el, {
        scale: 1,
        filter: 'drop-shadow(0 0 0px rgba(255,200,50,0))',
        duration: 300,
        ease: 'out(2)',
    });
}

/**
 * Calculate the bearing (heading) in degrees from point A to point B.
 * Returns a value in [0, 360) where 0 = North, 90 = East, etc.
 */
export function calcBearing(
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
): number {
    const toRad = Math.PI / 180;
    const dLng = (toLng - fromLng) * toRad;
    const lat1 = fromLat * toRad;
    const lat2 = toLat * toRad;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}
