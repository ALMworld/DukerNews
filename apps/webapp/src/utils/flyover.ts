import type { GuaPalace } from '@/lib/yao-data';

/**
 * Generate binary tree node paths in DFS (depth-first) order.
 * Visits '0' child before '1' child, guaranteeing smaller binaryStrings
 * are visited first at each depth level.
 */
export function dfsOrder(maxDepth = 6): string[] {
    const result: string[] = [];
    function dfs(prefix: string, depth: number) {
        if (depth > maxDepth) return;
        if (prefix.length > 0) result.push(prefix);
        dfs(prefix + '0', depth + 1); // smaller binary first
        dfs(prefix + '1', depth + 1);
    }
    dfs('', 0);
    return result;
}

/**
 * Generate binary tree node paths in BFS (breadth-first) order.
 * Each level is explicitly sorted by binaryString (numeric value).
 */
export function bfsOrder(maxDepth = 6): string[] {
    const result: string[] = [];
    // Start with level 1
    let currentLevel = ['0', '1'];

    while (currentLevel.length > 0) {
        // Sort this level by binary value (smaller binaryString first)
        currentLevel.sort((a, b) => parseInt(a, 2) - parseInt(b, 2));
        result.push(...currentLevel);

        const depth = currentLevel[0].length;
        if (depth >= maxDepth) break;

        const nextLevel: string[] = [];
        for (const prefix of currentLevel) {
            nextLevel.push(prefix + '0');
            nextLevel.push(prefix + '1');
        }
        currentLevel = nextLevel;
    }

    return result;
}

export interface FlyoverStop {
    roomId: string;
    position: number;
    lat: number;
    lng: number;
    name: string;
}

/* ─── Route preview — shows all 64 hexagrams with POI counts ─── */

export interface RoutePreviewItem {
    roomId: string;
    /** Total anchor count (卦辞 + 爻) */
    poiCount: number;
}

/**
 * Get a preview of meaningful binary tree nodes in traversal order with POI counts.
 * Only includes: 1-bit (阴阳), 2-bit (四象), 3-bit (八卦), 6-bit (六十四卦).
 * Excludes 4-bit and 5-bit intermediates which have no traditional I Ching meaning.
 */
export function getRoutePreview(
    mode: 'dfs' | 'bfs',
    anchors: Record<string, GuaPalace>,
    homeAddress: GuaPalace | null,
): RoutePreviewItem[] {
    const order = mode === 'dfs' ? dfsOrder(6) : bfsOrder(6);
    const meaningful = order.filter(k => [1, 2, 3, 6].includes(k.length));

    // Build anchor count per roomId
    const anchorCounts = new Map<string, number>();
    for (const key of Object.keys(anchors)) {
        const [roomId] = key.split(':');
        anchorCounts.set(roomId, (anchorCounts.get(roomId) ?? 0) + 1);
    }

    const items: RoutePreviewItem[] = [];

    // Home is always first
    if (homeAddress) {
        items.push({ roomId: '☯', poiCount: 1 });
    }

    items.push(...meaningful.map(roomId => ({
        roomId,
        poiCount: anchorCounts.get(roomId) ?? 0,
    })));

    return items;
}

/**
 * Build a flyover route from home through anchored nodes.
 */
export function buildFlyoverRoute(
    mode: 'dfs' | 'bfs',
    anchors: Record<string, GuaPalace>,
    homeAddress: GuaPalace | null,
    includeYao = true,
): FlyoverStop[] {
    const stops: FlyoverStop[] = [];

    if (homeAddress) {
        stops.push({
            roomId: '☯',
            position: 0,
            lat: homeAddress.lat,
            lng: homeAddress.lng,
            name: homeAddress.name || '家',
        });
    }

    const anchorsByRoom = new Map<string, { position: number; anchor: GuaPalace }[]>();
    for (const [key, anchor] of Object.entries(anchors)) {
        const [roomId, posRaw] = key.split(':');
        const position = Number(posRaw);
        if (Number.isNaN(position)) continue;
        if (!includeYao && position > 0) continue;
        if (!anchorsByRoom.has(roomId)) anchorsByRoom.set(roomId, []);
        anchorsByRoom.get(roomId)!.push({ position, anchor });
    }

    const order = mode === 'dfs' ? dfsOrder() : bfsOrder();

    for (const roomId of order) {
        const entries = anchorsByRoom.get(roomId);
        if (!entries) continue;
        entries.sort((a, b) => a.position - b.position);
        for (const { position, anchor } of entries) {
            stops.push({
                roomId, position,
                lat: anchor.lat, lng: anchor.lng,
                name: anchor.name,
            });
        }
    }

    return stops;
}
