/**
 * DealFlowChart (package version)
 * • Dagre auto-positions the main DAG (no cycles in layout).
 * • Back-edges (deal→buyer, deal→producer, alm→buyer, alm→producer)
 *   are drawn as explicit SVG arcs that sweep outside the main flow.
 * • HTML divs for nodes, one SVG overlay for all edges.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react'
import Dagre from '@dagrejs/dagre'
import { getLocaleData, type FlowStrings } from './data'

const BREAKPOINT = 500

// ── colours ──────────────────────────────────────────────────────────────────
const P  = '#7c3aed'
const PL = '#a78bfa'
const PD = '#1e1b4b'
const PM = '#6d28d9'
const TX = '#ddd6fe'
const TK = 'rgba(109,40,217,0.6)'

// ── types ─────────────────────────────────────────────────────────────────────
type NodeV = 'brand' | 'pill' | 'circle' | 'token' | 'combined'
interface NDef { id: string; label: string; label2?: string; w: number; h: number; v?: NodeV }
interface EDef { src: string; tgt: string; label?: string; dashed?: boolean; back?: boolean; dir?: 'up' | 'dn'; noRender?: boolean }

// ── graph definition ──────────────────────────────────────────────────────────
function getNodes(f: FlowStrings): NDef[] {
    return [
        { id: 'kindness',  label: f.title,                  w: 108, h: 66,  v: 'brand'    },
        { id: 'buyer',     label: `🧑 ${f.buyer}`,         w: 112, h: 28                  },
        { id: 'producer',  label: `🏭 ${f.producer}`,      w: 112, h: 28                  },
        { id: 'deal',      label: f.deal,                   w: 58,  h: 58,  v: 'circle'   },
        { id: 'treasury',  label: `🏛 ${f.treasury}`,      w: 112, h: 28                  },
        { id: 'duki',  label: '🪙 DUKI', label2: `+ ${f.distributed}`,  w: 115, h: 44, v: 'combined' },
        { id: 'alm',   label: '🗳 ALM',  label2: `+ ${f.governance}`,   w: 115, h: 44, v: 'combined' },
        { id: 'everyone',  label: `🌍 ${f.everyone}`,      w: 90,  h: 28                  },
    ]
}

function getEdges(f: FlowStrings): EDef[] {
    return [
        { src: 'kindness',   tgt: 'buyer',     dashed: true },
        { src: 'kindness',   tgt: 'producer',  dashed: true },
        { src: 'buyer',     tgt: 'deal', label: f.stablecoin },
        { src: 'producer',  tgt: 'deal', label: f.goods },
        { src: 'deal',       tgt: 'treasury',  label: f.dealToTreasury },
        { src: 'treasury',   tgt: 'duki',     noRender: true },
        { src: 'treasury',   tgt: 'alm',      noRender: true },
        { src: 'duki',       tgt: 'everyone', noRender: true },
        { src: 'deal',     tgt: 'producer', label: f.stablecoin, dashed: true, back: true, dir: 'up' },
        { src: 'deal',     tgt: 'buyer',    label: f.goods,      dashed: true, back: true, dir: 'dn' },
        { src: 'alm',      tgt: 'producer',                      dashed: true, back: true, dir: 'up' },
        { src: 'alm',      tgt: 'buyer',    label: f.governance, dashed: true, back: true, dir: 'dn' },
        { src: 'everyone', tgt: 'kindness',                      dashed: true, back: true, dir: 'up' },
    ]
}

// ── layout ────────────────────────────────────────────────────────────────────
interface LNode extends NDef { cx: number; cy: number }
interface LEdge extends EDef { path: string; lx: number; ly: number }

function computeLayout(f: FlowStrings, vert: boolean, topPad = 0, botPad = 0) {
    const g = new Dagre.graphlib.Graph()
    g.setGraph({ rankdir: vert ? 'TB' : 'LR', ranksep: 55, nodesep: 24, marginx: 20, marginy: 20 })
    g.setDefaultEdgeLabel(() => ({}))

    const nodes = getNodes(f)
    const EDGES = getEdges(f)
    for (const n of nodes) g.setNode(n.id, { width: n.w, height: n.h })
    for (const e of EDGES.filter(e => !e.back)) g.setEdge(e.src, e.tgt)
    Dagre.layout(g)

    const lnodes: LNode[] = nodes.map(n => {
        const p = g.node(n.id)
        return { ...n, cx: p.x, cy: p.y + topPad }
    })

    const gi = g.graph()
    const gW  = gi.width  ?? 400
    const gH  = gi.height ?? 300
    const evN = lnodes.find(n => n.id === 'everyone')!
    if (vert) {
        evN.cx = gW + 60
        evN.cy = (gH + topPad) / 2
    } else {
        evN.cx = gW / 2
        evN.cy = (gH + topPad) + 100
    }

    const dukiN = lnodes.find(n => n.id === 'duki')!
    const almN  = lnodes.find(n => n.id === 'alm')!
    const GAP = 20
    if (!vert) {
        const midY = (dukiN.cy + almN.cy) / 2
        dukiN.cy = midY
        almN.cy  = midY
        const baseCx = dukiN.cx
        almN.cx  = baseCx
        dukiN.cx = baseCx + almN.w / 2 + GAP + dukiN.w / 2
    } else {
        const midX = (dukiN.cx + almN.cx) / 2
        dukiN.cx = midX
        almN.cx  = midX
        const baseCy = dukiN.cy
        almN.cy  = baseCy
        dukiN.cy = baseCy + almN.h / 2 + GAP + dukiN.h / 2
    }

    const GB_PAD = 8
    const groupBox = {
        left:   Math.min(dukiN.cx - dukiN.w / 2, almN.cx - almN.w / 2) - GB_PAD,
        top:    Math.min(dukiN.cy - dukiN.h / 2, almN.cy - almN.h / 2) - GB_PAD,
        width:  Math.max(dukiN.cx + dukiN.w / 2, almN.cx + almN.w / 2)
               - Math.min(dukiN.cx - dukiN.w / 2, almN.cx - almN.w / 2) + GB_PAD * 2,
        height: Math.max(dukiN.cy + dukiN.h / 2, almN.cy + almN.h / 2)
               - Math.min(dukiN.cy - dukiN.h / 2, almN.cy - almN.h / 2) + GB_PAD * 2,
    }

    const lmap = new Map(lnodes.map(n => [n.id, n]))

    function ep(id: string, side: 'src' | 'tgt', vert: boolean): [number, number] {
        const n = lmap.get(id)!
        if (vert) return side === 'src' ? [n.cx, n.cy + n.h / 2] : [n.cx, n.cy - n.h / 2]
        return side === 'src' ? [n.cx + n.w / 2, n.cy] : [n.cx - n.w / 2, n.cy]
    }
    function bezier(sx: number, sy: number, tx: number, ty: number, vert: boolean): string {
        if (vert) {
            const dy = ty - sy
            return `M${sx},${sy} C${sx},${sy + dy * .5} ${tx},${ty - dy * .5} ${tx},${ty}`
        }
        const dx = tx - sx
        return `M${sx},${sy} C${sx + dx * .5},${sy} ${tx - dx * .5},${ty} ${tx},${ty}`
    }

    const ledges: LEdge[] = EDGES.filter(e => !e.back && !e.noRender).map(e => {
        const [sx, sy] = ep(e.src, 'src', vert)
        const [tx, ty] = ep(e.tgt, 'tgt', vert)
        const path = bezier(sx, sy, tx, ty, vert)
        return { ...e, path, lx: (sx + tx) / 2, ly: (sy + ty) / 2 }
    })

    const trsN = lmap.get('treasury')!
    const gbCx = groupBox.left + groupBox.width  / 2
    const gbCy = groupBox.top  + groupBox.height / 2
    const [tSx, tSy] = vert ? [trsN.cx, trsN.cy + trsN.h / 2] : [trsN.cx + trsN.w / 2, trsN.cy]
    const [tTx, tTy] = vert ? [gbCx,    groupBox.top]           : [groupBox.left,         gbCy]
    const groupEntryEdge: LEdge = {
        src: 'treasury', tgt: 'alm', path: bezier(tSx, tSy, tTx, tTy, vert),
        lx: (tSx + tTx) / 2, ly: (tSy + tTy) / 2,
    }

    const dkEvEdge: LEdge = (() => {
        const dk = lmap.get('duki')!
        const ev = lmap.get('everyone')!
        let path: string, lx: number, ly: number
        if (vert) {
            const sx = dk.cx + dk.w / 2, sy = dk.cy
            const tx = ev.cx,            ty = ev.cy + ev.h / 2
            path = `M${sx},${sy} C${sx + 60},${sy} ${tx},${ty + 60} ${tx},${ty}`
            lx = (sx + tx) / 2 + 20; ly = (sy + ty) / 2
        } else {
            const sx = dk.cx,            sy = dk.cy + dk.h / 2
            const tx = ev.cx + ev.w / 2, ty = ev.cy
            path = `M${sx},${sy} C${sx},${(sy + ty * 2) / 3} ${tx + 40},${ty} ${tx},${ty}`
            lx = (sx + tx) / 2 + 20; ly = (sy + ty) / 2
        }
        return { src: 'duki', tgt: 'everyone', dashed: true, path, lx, ly } as LEdge
    })()

    const backEdges: LEdge[] = EDGES.filter(e => e.back).map((e) => {
        const src  = lmap.get(e.src)!
        const tgt  = lmap.get(e.tgt)!
        const isAlm     = e.src === 'alm'
        const isEveryone = e.src === 'everyone'
        const offset    = isEveryone ? 160 : isAlm ? 105 : 70
        const up        = e.dir === 'up'
        let path: string, lx: number, ly: number

        if (vert) {
            if (e.src === 'everyone' && e.tgt === 'kindness') {
                const sx = src.cx, sy = src.cy - src.h / 2
                const tx = tgt.cx + tgt.w / 2, ty = tgt.cy
                path = `M${sx},${sy} C${sx},${(sy + ty) / 2} ${tx + 80},${ty} ${tx},${ty}`
                lx = (sx + tx) / 2 + 20; ly = (sy + ty) / 2
            } else {
                const sign = up ? -1 : 1
                const sx = src.cx + sign * (src.w / 2)
                const tx = tgt.cx + sign * (tgt.w / 2)
                const sy = src.cy, ty = tgt.cy
                const off = sign * offset
                path = `M${sx},${sy} C${sx+off},${sy} ${tx+off},${ty} ${tx},${ty}`
                lx = (sx + tx) / 2 + off * 0.5; ly = (sy + ty) / 2
            }
        } else if (e.src === 'everyone' && e.tgt === 'kindness') {
            const sx = src.cx - src.w / 2, sy = src.cy
            const tx = tgt.cx,              ty = tgt.cy + tgt.h / 2
            path = `M${sx},${sy} C${sx - 120},${sy} ${tx},${ty + 100} ${tx},${ty}`
            lx = (sx + tx) / 2 - 40; ly = sy + 30
        } else {
            const sign = up ? -1 : 1
            const sx = src.cx,  sy = src.cy + sign * (src.h / 2)
            const tx = tgt.cx,  ty = tgt.cy + sign * (tgt.h / 2)
            const off = sign * offset
            path = `M${sx},${sy} C${sx},${sy+off} ${tx},${ty+off} ${tx},${ty}`
            lx = (sx + tx) / 2; ly = up
                ? Math.min(sy, ty) + off
                : Math.max(sy, ty) + off * 0.85
        }
        return { ...e, path, lx, ly }
    })

    const totalH = vert
        ? gH + topPad + botPad
        : Math.max(gH + topPad + botPad, evN.cy + evN.h / 2 + 40)
    const totalW = vert
        ? Math.max(gW, evN.cx + evN.w / 2 + 20)
        : gW

    return { nodes: lnodes, edges: [groupEntryEdge, dkEvEdge, ...ledges, ...backEdges], groupBox,
        w: totalW, h: totalH }
}

// ── node style ────────────────────────────────────────────────────────────────
const BASE: React.CSSProperties = {
    position: 'absolute', fontSize: 11, lineHeight: 1.2,
    border: `1px solid ${PM}`, background: PD, color: TX,
    whiteSpace: 'nowrap', userSelect: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
}
function nstyle(n: LNode): React.CSSProperties {
    const left = n.cx - n.w / 2, top = n.cy - n.h / 2
    switch (n.v) {
        case 'brand': return { ...BASE, left, top, width: n.w, height: n.h, borderRadius: 8,
            flexDirection: 'column', gap: 3, fontWeight: 700, fontSize: 11, textAlign: 'center',
            border: `1.5px solid ${PL}`, color: '#e9d5ff',
            background: 'linear-gradient(135deg,rgba(109,40,217,.65),rgba(76,29,149,.45))',
            boxShadow: '0 0 14px rgba(167,139,250,.3)', padding: '6px 10px' }
        case 'circle': return { ...BASE, left, top, width: n.w, height: n.h, borderRadius: '50%',
            flexDirection: 'column', gap: 1, border: `1.5px solid ${PL}` }
        case 'combined': return { ...BASE, left, top, width: n.w, height: n.h, borderRadius: 6,
            flexDirection: 'column', gap: 1, textAlign: 'center',
            border: `1px solid ${PL}`, background: TK, lineHeight: 1.3 }
        case 'token': return { ...BASE, left, top, width: n.w, height: n.h, borderRadius: 6,
            fontWeight: 700, border: `1px solid ${PL}`, background: TK }
        default: return { ...BASE, left, top, width: n.w, height: n.h, borderRadius: 6, padding: '4px 8px' }
    }
}

// ── component ─────────────────────────────────────────────────────────────────
export interface DealFlowChartProps {
    locale?: string
}

export default function DealFlowChart({ locale = 'en' }: DealFlowChartProps) {
    const f = getLocaleData(locale).flow
    const containerRef = useRef<HTMLDivElement>(null)
    const [isVertical, setIsVertical]       = useState(false)
    const [containerWidth, setContainerWidth] = useState(600)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const ro = new ResizeObserver(entries => {
            const w = entries[0].contentRect.width
            setContainerWidth(w)
            setIsVertical(w < BREAKPOINT)
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const layout = useMemo(() => {
        const tp = isVertical ? 20  : 170
        const bp = isVertical ? 20  : 120
        return computeLayout(f, isVertical, tp, bp)
    }, [isVertical, f])

    const scale     = Math.min(1, containerWidth / (layout.w + 1))
    const scaledH   = Math.ceil(layout.h * scale)
    const leftOff   = Math.max(0, (containerWidth - layout.w * scale) / 2)

    return (
        <div ref={containerRef} style={{
            borderRadius: 8, marginTop: 20,
            border: '1px solid #6d28d9',
            background: 'rgba(30,27,75,0.5)',
            overflow: 'hidden',
            height: scaledH,
        }}>
            <div style={{
                position: 'relative', width: layout.w, height: layout.h,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
                marginLeft: leftOff,
            }}>
                {/* DUKI + ALM group box */}
                <div style={{
                    position: 'absolute',
                    left: layout.groupBox.left, top: layout.groupBox.top,
                    width: layout.groupBox.width, height: layout.groupBox.height,
                    border: `1px dashed ${PL}`, borderRadius: 10,
                    background: 'rgba(109,40,217,0.08)', pointerEvents: 'none',
                }} />

                {/* SVG — all edges */}
                <svg style={{ position: 'absolute', inset: 0, width: layout.w, height: layout.h,
                    overflow: 'visible', pointerEvents: 'none' }}>
                    <defs>
                        <marker id="ah"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                            <path d="M0 0 L7 3.5 L0 7 Z" fill={P} />
                        </marker>
                        <marker id="ahd" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                            <path d="M0 0 L7 3.5 L0 7 Z" fill={PL} />
                        </marker>
                    </defs>
                    {layout.edges.map(e => (
                        <g key={`${e.src}-${e.tgt}`}>
                            <path d={e.path} fill="none"
                                stroke={e.dashed ? PL : P}
                                strokeWidth={e.dashed ? 1.1 : 1.5}
                                strokeDasharray={e.dashed ? '5 4' : undefined}
                                markerEnd={`url(#${e.dashed ? 'ahd' : 'ah'})`}
                            />
                            {e.label && (
                                <text x={e.lx} y={e.ly - 4} textAnchor="middle"
                                    fontSize={8} fill={PL} fontWeight={600}
                                    style={{ userSelect: 'none' }}>
                                    {e.label}
                                </text>
                            )}
                        </g>
                    ))}
                </svg>

                {/* HTML nodes */}
                {layout.nodes.map(n => (
                    <div key={n.id} style={nstyle(n)}>
                        {n.v === 'brand'  && <span style={{ fontSize: 18 }}>☯</span>}
                        {n.v === 'circle' && <span style={{ fontSize: 18 }}>☯</span>}
                        <span style={{ fontWeight: n.v === 'combined' ? 700 : undefined }}>{n.label}</span>
                        {n.label2 && (
                            <span style={{ fontSize: 9, color: PL, opacity: 0.85, letterSpacing: '0.02em' }}>
                                {n.label2}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
