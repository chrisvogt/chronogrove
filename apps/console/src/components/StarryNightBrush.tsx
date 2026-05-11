'use client'

import { useEffect, useRef } from 'react'

/**
 * Full-viewport canvas evoking Starry Night–style impasto: swirling cobalt sky,
 * dark cypress, golden stars. Static composition with optional slow “living” drift.
 */

interface Stroke {
  points: Array<{ x: number; y: number }>
  width: number
  color: string
}

type BezierCurveSpec = Readonly<{
  mx: number
  my: number
  c1x: number
  c1y: number
  c2x: number
  c2y: number
  ex: number
  ey: number
  width: number
  color: string
  segments: number
}>

function buildSwirlStrokes(w: number, h: number): Stroke[] {
  const nx = (x: number) => x * w
  const ny = (y: number) => y * h
  const strokes: Stroke[] = []

  const addBezier = (spec: BezierCurveSpec) => {
    const { mx, my, c1x, c1y, c2x, c2y, ex, ey, width, color, segments } = spec
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const u = 1 - t
      const x =
        u * u * u * nx(mx) +
        3 * u * u * t * nx(c1x) +
        3 * u * t * t * nx(c2x) +
        t * t * t * nx(ex)
      const y =
        u * u * u * ny(my) +
        3 * u * u * t * ny(c1y) +
        3 * u * t * t * ny(c2y) +
        t * t * t * ny(ey)
      pts.push({ x, y })
    }
    strokes.push({ points: pts, width, color })
  }

  // Back: deep indigo washes (chunky segments read like dry brush)
  addBezier({
    mx: 0.85,
    my: 0.92,
    c1x: 0.98,
    c1y: 0.55,
    c2x: 0.35,
    c2y: 0.05,
    ex: 0.05,
    ey: 0.35,
    width: 55,
    color: 'rgba(25, 35, 85, 0.34)',
    segments: 28,
  })
  addBezier({
    mx: 0.1,
    my: 0.15,
    c1x: 0.35,
    c1y: 0.0,
    c2x: 0.55,
    c2y: 0.25,
    ex: 0.72,
    ey: 0.42,
    width: 48,
    color: 'rgba(30, 45, 95, 0.30)',
    segments: 24,
  })

  // Mid: cobalt spirals (Van Gogh sky rhythm)
  addBezier({
    mx: 0.72,
    my: 0.18,
    c1x: 0.95,
    c1y: 0.32,
    c2x: 0.88,
    c2y: 0.62,
    ex: 0.42,
    ey: 0.78,
    width: 38,
    color: 'rgba(70, 110, 195, 0.26)',
    segments: 32,
  })
  addBezier({
    mx: 0.38,
    my: 0.12,
    c1x: 0.55,
    c1y: 0.42,
    c2x: 0.2,
    c2y: 0.65,
    ex: 0.08,
    ey: 0.55,
    width: 32,
    color: 'rgba(90, 130, 210, 0.22)',
    segments: 28,
  })
  addBezier({
    mx: 0.55,
    my: 0.25,
    c1x: 0.75,
    c1y: 0.1,
    c2x: 0.92,
    c2y: 0.35,
    ex: 0.68,
    ey: 0.48,
    width: 28,
    color: 'rgba(120, 155, 235, 0.18)',
    segments: 26,
  })
  addBezier({
    mx: 0.5,
    my: 0.55,
    c1x: 0.72,
    c1y: 0.45,
    c2x: 0.65,
    c2y: 0.72,
    ex: 0.35,
    ey: 0.88,
    width: 36,
    color: 'rgba(75, 115, 200, 0.20)',
    segments: 30,
  })
  addBezier({
    mx: 0.22,
    my: 0.72,
    c1x: 0.08,
    c1y: 0.55,
    c2x: 0.22,
    c2y: 0.38,
    ex: 0.42,
    ey: 0.28,
    width: 30,
    color: 'rgba(85, 125, 215, 0.17)',
    segments: 24,
  })

  // Light cerulean highlights
  addBezier({
    mx: 0.62,
    my: 0.38,
    c1x: 0.78,
    c1y: 0.28,
    c2x: 0.82,
    c2y: 0.52,
    ex: 0.58,
    ey: 0.62,
    width: 22,
    color: 'rgba(160, 190, 255, 0.14)',
    segments: 22,
  })
  addBezier({
    mx: 0.48,
    my: 0.42,
    c1x: 0.58,
    c1y: 0.35,
    c2x: 0.52,
    c2y: 0.58,
    ex: 0.4,
    ey: 0.72,
    width: 18,
    color: 'rgba(180, 205, 255, 0.10)',
    segments: 20,
  })

  // Warm glow near “moon” / horizon (subtle)
  addBezier({
    mx: 0.18,
    my: 0.88,
    c1x: 0.12,
    c1y: 0.7,
    c2x: 0.28,
    c2y: 0.58,
    ex: 0.35,
    ey: 0.72,
    width: 40,
    color: 'rgba(232, 188, 56, 0.06)',
    segments: 18,
  })

  return strokes
}

function buildCypressStrokes(w: number, h: number): Stroke[] {
  const strokes: Stroke[] = []
  const baseX = w * 0.1
  const tipY = h * 0.22

  // Vertical dark masses — stacked tapered strokes
  for (let i = 0; i < 14; i++) {
    const t = i / 13
    const xOff = (Math.sin(t * Math.PI * 2.1) * 0.018 + t * 0.04 - 0.02) * w
    const top = tipY + t * t * h * 0.58
    const bottom = h * 0.98
    const width = 22 + (1 - t) * 28
    const alpha = 0.12 + (1 - t) * 0.1
    strokes.push({
      points: [
        { x: baseX + xOff - width * 0.15, y: bottom },
        { x: baseX + xOff * 0.7, y: (top + bottom) * 0.55 },
        { x: baseX + xOff + width * 0.2, y: top },
      ],
      width,
      color: `rgba(8, 12, 28, ${alpha.toFixed(3)})`,
    })
  }
  // Edge highlight on cypress (cool rim)
  strokes.push({
    points: [
      { x: baseX + w * 0.035, y: h * 0.95 },
      { x: baseX + w * 0.02, y: h * 0.4 },
      { x: baseX + w * 0.055, y: tipY + h * 0.06 },
    ],
    width: 12,
    color: 'rgba(55, 85, 140, 0.14)',
  })
  return strokes
}

function drawStrokeImpasto(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  driftX: number,
  driftY: number,
  wobble: number
) {
  const { points, width, color } = stroke
  if (points.length < 2) return

  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'

  // Main pass
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(points[0]!.x + driftX, points[0]!.y + driftY)
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const j = Math.sin(i * 0.7 + wobble) * 1.2
    ctx.lineTo(p.x + driftX + j, p.y + driftY + j * 0.4)
  }
  ctx.stroke()

  // Second thinner pass for bristle texture
  ctx.globalAlpha = 0.45
  ctx.lineWidth = Math.max(2, width * 0.35)
  ctx.beginPath()
  ctx.moveTo(points[0]!.x + driftX * 1.1, points[0]!.y + driftY * 1.1)
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    ctx.lineTo(p.x + driftX * 1.1 - 1, p.y + driftY * 1.1 + 1)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, twinkle: number) {
  const stars: Array<{ x: number; y: number; r: number; a: number }> = [
    { x: 0.78, y: 0.12, r: 2.8, a: 0.95 },
    { x: 0.22, y: 0.18, r: 2.2, a: 0.85 },
    { x: 0.88, y: 0.28, r: 1.6, a: 0.75 },
    { x: 0.42, y: 0.08, r: 1.4, a: 0.7 },
    { x: 0.65, y: 0.2, r: 1.8, a: 0.8 },
    { x: 0.52, y: 0.15, r: 1.2, a: 0.65 },
    { x: 0.92, y: 0.45, r: 1.0, a: 0.6 },
    { x: 0.3, y: 0.35, r: 1.3, a: 0.55 },
    { x: 0.7, y: 0.52, r: 1.1, a: 0.5 },
    { x: 0.15, y: 0.42, r: 0.9, a: 0.5 },
    { x: 0.58, y: 0.42, r: 1.5, a: 0.72 },
    { x: 0.82, y: 0.58, r: 1.0, a: 0.48 },
  ]

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]!
    const x = s.x * w
    const y = s.y * h
    const pulse = 0.88 + 0.12 * Math.sin(twinkle * 0.002 + i * 0.9)
    const r = s.r * pulse
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4)
    g.addColorStop(0, `rgba(255, 248, 220, ${(s.a * pulse).toFixed(3)})`)
    g.addColorStop(0.35, `rgba(232, 188, 56, ${(s.a * 0.45 * pulse).toFixed(3)})`)
    g.addColorStop(1, 'rgba(232, 188, 56, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r * 4, 0, Math.PI * 2)
    ctx.fill()

    // Star cross (Van Gogh pin lights)
    ctx.strokeStyle = `rgba(255, 252, 235, ${(s.a * 0.35 * pulse).toFixed(3)})`
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.moveTo(x - r * 2.2, y)
    ctx.lineTo(x + r * 2.2, y)
    ctx.moveTo(x, y - r * 2.2)
    ctx.lineTo(x, y + r * 2.2)
    ctx.stroke()
  }

  // Soft moon disc (upper right mood)
  const mx = w * 0.88
  const my = h * 0.1
  const moon = ctx.createRadialGradient(mx, my, 0, mx, my, h * 0.09)
  moon.addColorStop(0, 'rgba(255, 245, 210, 0.22)')
  moon.addColorStop(0.4, 'rgba(232, 200, 120, 0.08)')
  moon.addColorStop(1, 'rgba(232, 188, 56, 0)')
  ctx.fillStyle = moon
  ctx.beginPath()
  ctx.arc(mx, my, h * 0.09, 0, Math.PI * 2)
  ctx.fill()
}

function drawVillageBand(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bandH = h * 0.14
  const y0 = h - bandH
  const g = ctx.createLinearGradient(0, y0, 0, h)
  g.addColorStop(0, 'rgba(12, 14, 35, 0)')
  g.addColorStop(0.35, 'rgba(10, 12, 28, 0.75)')
  g.addColorStop(1, 'rgba(6, 8, 20, 0.92)')
  ctx.fillStyle = g
  ctx.fillRect(0, y0, w, bandH)

  // Rooftop silhouettes
  ctx.fillStyle = 'rgba(6, 8, 22, 0.55)'
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, h - bandH * 0.35)
  ctx.lineTo(w * 0.06, h - bandH * 0.55)
  ctx.lineTo(w * 0.12, h - bandH * 0.4)
  ctx.lineTo(w * 0.2, h - bandH * 0.62)
  ctx.lineTo(w * 0.32, h - bandH * 0.45)
  ctx.lineTo(w * 0.42, h - bandH * 0.7)
  ctx.lineTo(w * 0.55, h - bandH * 0.38)
  ctx.lineTo(w * 0.68, h - bandH * 0.58)
  ctx.lineTo(w * 0.82, h - bandH * 0.42)
  ctx.lineTo(w, h - bandH * 0.5)
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
}

export function StarryNightBrush({ className }: Readonly<{ className?: string }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[] | null>(null)
  const cypressRef = useRef<Stroke[] | null>(null)
  const sizeRef = useRef({ w: 0, h: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const paint = (time: number) => {
      const w = sizeRef.current.w
      const h = sizeRef.current.h
      if (!w || !h) return

      const driftX = reduced ? 0 : Math.sin(time * 0.00012) * 6
      const driftY = reduced ? 0 : Math.cos(time * 0.0001) * 4
      const wobble = reduced ? 0 : time * 0.00008

      // Base sky
      const sky = ctx.createLinearGradient( 0, 0, w * 0.9, h)
      sky.addColorStop(0, '#07091c')
      sky.addColorStop(0.45, '#101632')
      sky.addColorStop(1, '#0a0e24')
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      const swirls = strokesRef.current ?? buildSwirlStrokes(w, h)
      const cypress = cypressRef.current ?? buildCypressStrokes(w, h)
      if (!strokesRef.current) strokesRef.current = swirls
      if (!cypressRef.current) cypressRef.current = cypress

      for (const s of swirls) {
        drawStrokeImpasto(ctx, s, driftX * 0.5, driftY * 0.5, wobble)
      }
      for (const s of cypress) {
        drawStrokeImpasto(ctx, s, driftX * 0.25, 0, wobble * 0.5)
      }

      drawVillageBand(ctx, w, h)
      drawStars(ctx, w, h, reduced ? 0 : time)
    }

    let raf = 0
    const loop = (time: number) => {
      paint(time)
      if (!reduced) raf = requestAnimationFrame(loop)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
      const rect = canvas.getBoundingClientRect()
      const bw = Math.max(1, rect.width)
      const bh = Math.max(1, rect.height)
      canvas.width = Math.floor(bw * dpr)
      canvas.height = Math.floor(bh * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current.w = bw
      sizeRef.current.h = bh
      strokesRef.current = null
      cypressRef.current = null
      paint(performance.now())
      if (reduced && !raf) {
        /* static frame already painted */
      }
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas.parentElement ?? canvas)

    if (!reduced) {
      raf = requestAnimationFrame(loop)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div aria-hidden className={className} style={{ width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>
  )
}
