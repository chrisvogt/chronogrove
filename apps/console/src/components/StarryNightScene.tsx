'use client'

import { useEffect, useRef } from 'react'
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  CatmullRomCurve3,
  TubeGeometry,
  MeshBasicMaterial,
  Mesh,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
  CanvasTexture,
  Group,
  SphereGeometry,
  ConeGeometry,
  FogExp2,
  Color,
  DoubleSide,
  TorusGeometry,
  BoxGeometry,
  PlaneGeometry,
} from 'three'

/* ── Glow sprite (higher res for halo quality) ───────────────────────── */

function makeGlow(size = 128): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.18, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.25)')
  g.addColorStop(0.72, 'rgba(255,255,255,0.06)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(c)
}

/* ── Elastic pop-in ease ─────────────────────────────────────────────── */

function elasticOut(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1
}

/* ── Vertex-color gradient on tube geometry ──────────────────────────── */

function applyTubeGradient(geo: BufferGeometry, c1: Color, c2: Color, c3: Color) {
  const pos = geo.attributes.position!
  const count = pos.count
  const cols = new Float32Array(count * 3)
  const bbox = geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox!)
  const yMin = bbox.min.y, yRange = bbox.max.y - bbox.min.y || 1

  for (let i = 0; i < count; i++) {
    const t = ((pos.getY(i) - yMin) / yRange)
    const mixed = t < 0.5
      ? new Color().copy(c1).lerp(c2, t * 2)
      : new Color().copy(c2).lerp(c3, (t - 0.5) * 2)
    cols[i * 3] = mixed.r; cols[i * 3 + 1] = mixed.g; cols[i * 3 + 2] = mixed.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3))
}

/* ── Brush-stroke bundle: many offset tubes per swirl ────────────────── */

interface BundleDef {
  center: Vector3[]
  tubeCount: number
  spread: number
  baseRadius: number
  colors: [number, number, number]  // [dark, mid, bright]
  speed: number
  delay: number
  opacity: number
  segments: number
}

function buildBundles(): BundleDef[] {
  return [
    // === DOMINANT SPIRAL (upper center-right) ===
    {
      center: [
        new Vector3(-4, 3.5, -4), new Vector3(-1, 5.2, -3.5),
        new Vector3(2.5, 5, -4.5), new Vector3(5, 3.5, -3.8),
        new Vector3(3.5, 1.8, -5), new Vector3(0.5, 2.2, -3.5),
        new Vector3(-2, 3.8, -4.5), new Vector3(-3.5, 3.2, -4),
      ],
      tubeCount: 10, spread: 0.45, baseRadius: 0.14,
      colors: [0x101838, 0x2a5298, 0x6aace0],
      speed: 0.065, delay: 0, opacity: 0.48, segments: 72,
    },
    // === SECOND SPIRAL (upper left) ===
    {
      center: [
        new Vector3(-7, 4.5, -5), new Vector3(-5, 5.5, -4),
        new Vector3(-3, 5, -5.5), new Vector3(-4.5, 3.5, -4.5),
        new Vector3(-6, 4, -5),
      ],
      tubeCount: 8, spread: 0.38, baseRadius: 0.12,
      colors: [0x0e1530, 0x1a3560, 0x4e8fcb],
      speed: -0.055, delay: 0.3, opacity: 0.42, segments: 60,
    },
    // === WIDE HORIZON SWEEP (mid-field) ===
    {
      center: [
        new Vector3(-8, 1, -5), new Vector3(-4, 2.5, -4),
        new Vector3(0, 1.5, -5.5), new Vector3(4, 2, -4),
        new Vector3(8, 0.5, -5),
      ],
      tubeCount: 8, spread: 0.55, baseRadius: 0.16,
      colors: [0x141e48, 0x3d6aa0, 0x8ab8e8],
      speed: 0.04, delay: 0.6, opacity: 0.38, segments: 64,
    },
    // === SMALL TIGHT SWIRL (right of center) ===
    {
      center: [
        new Vector3(5, 4, -3), new Vector3(6.5, 4.5, -3.5),
        new Vector3(7, 3, -4), new Vector3(5.5, 2.5, -3.2),
        new Vector3(5, 3.5, -3.8),
      ],
      tubeCount: 7, spread: 0.28, baseRadius: 0.10,
      colors: [0x1a3060, 0x4e8fcb, 0xa0c8f0],
      speed: 0.09, delay: 0.9, opacity: 0.45, segments: 52,
    },
    // === DEEP BACKGROUND WASH ===
    {
      center: [
        new Vector3(-6, -1, -8), new Vector3(-2, 0.5, -7),
        new Vector3(2, -0.5, -9), new Vector3(6, 0, -7.5),
      ],
      tubeCount: 6, spread: 0.7, baseRadius: 0.22,
      colors: [0x060a18, 0x101838, 0x1a2850],
      speed: 0.03, delay: 0.15, opacity: 0.55, segments: 48,
    },
    // === LOWER LEFT SWIRL ===
    {
      center: [
        new Vector3(-7, -1.5, -5), new Vector3(-4, 0, -4.5),
        new Vector3(-2, -1, -5.5), new Vector3(-3.5, -2.5, -5),
        new Vector3(-6, -1, -5.5),
      ],
      tubeCount: 7, spread: 0.35, baseRadius: 0.12,
      colors: [0x0e1530, 0x2a4580, 0x5590c0],
      speed: -0.05, delay: 0.5, opacity: 0.40, segments: 56,
    },
    // === WISPY HIGHLIGHT (near top) ===
    {
      center: [
        new Vector3(-5, 5.5, -2.5), new Vector3(-1, 6, -3),
        new Vector3(3, 5.8, -2.5), new Vector3(7, 5, -3.5),
      ],
      tubeCount: 5, spread: 0.25, baseRadius: 0.06,
      colors: [0x3d6aa0, 0x8ab8e8, 0xc0d8f4],
      speed: -0.07, delay: 1.1, opacity: 0.30, segments: 48,
    },
    // === ANOTHER TIGHT SWIRL (lower right) ===
    {
      center: [
        new Vector3(3, -0.5, -4), new Vector3(5, 0.5, -3.5),
        new Vector3(6.5, -0.5, -4.5), new Vector3(5, -1.5, -4),
        new Vector3(3.5, -0.8, -4.2),
      ],
      tubeCount: 6, spread: 0.30, baseRadius: 0.10,
      colors: [0x101838, 0x2a5298, 0x5a98d0],
      speed: 0.07, delay: 0.8, opacity: 0.38, segments: 48,
    },
  ]
}

/* ── Starburst: core sphere + spike quads + concentric rings ─────────── */

interface StarDef {
  pos: Vector3
  coreSize: number
  spikeLen: number
  ringCount: number
  ringBase: number
  delay: number
}

function buildStarDefs(): StarDef[] {
  return [
    { pos: new Vector3(-3.5, 4.8, -2), coreSize: 0.10, spikeLen: 0.5, ringCount: 3, ringBase: 0.22, delay: 0.6 },
    { pos: new Vector3(5.5, 4.2, -2.5), coreSize: 0.12, spikeLen: 0.65, ringCount: 3, ringBase: 0.28, delay: 1.0 },
    { pos: new Vector3(2.2, 5.5, -2), coreSize: 0.09, spikeLen: 0.45, ringCount: 2, ringBase: 0.20, delay: 1.4 },
    { pos: new Vector3(-6, 3.2, -3), coreSize: 0.07, spikeLen: 0.35, ringCount: 2, ringBase: 0.16, delay: 1.8 },
    { pos: new Vector3(7, 3.5, -3.5), coreSize: 0.08, spikeLen: 0.38, ringCount: 2, ringBase: 0.18, delay: 2.1 },
    { pos: new Vector3(-1, 5.8, -1.5), coreSize: 0.11, spikeLen: 0.55, ringCount: 3, ringBase: 0.25, delay: 2.4 },
    { pos: new Vector3(4, 2.8, -2.2), coreSize: 0.06, spikeLen: 0.30, ringCount: 2, ringBase: 0.14, delay: 2.7 },
    { pos: new Vector3(-3, 2.2, -1.8), coreSize: 0.05, spikeLen: 0.25, ringCount: 1, ringBase: 0.12, delay: 3.0 },
    { pos: new Vector3(0.5, 3.8, -1.5), coreSize: 0.10, spikeLen: 0.52, ringCount: 3, ringBase: 0.24, delay: 3.2 },
    { pos: new Vector3(6.5, 5.2, -3), coreSize: 0.07, spikeLen: 0.32, ringCount: 2, ringBase: 0.15, delay: 3.5 },
    { pos: new Vector3(-5, 5.3, -3.5), coreSize: 0.06, spikeLen: 0.28, ringCount: 2, ringBase: 0.13, delay: 3.8 },
    { pos: new Vector3(3.5, 5, -1.8), coreSize: 0.08, spikeLen: 0.40, ringCount: 2, ringBase: 0.18, delay: 1.2 },
  ]
}

function buildStarburstGroup(def: StarDef): Group {
  const g = new Group()
  g.position.copy(def.pos)

  // Central glowing sphere
  const coreGeo = new SphereGeometry(def.coreSize, 16, 16)
  g.add(new Mesh(coreGeo, new MeshBasicMaterial({
    color: 0xfff8dc, transparent: true, opacity: 0,
  })))

  // Inner warm sphere (slightly larger, dimmer)
  const innerGeo = new SphereGeometry(def.coreSize * 1.8, 12, 12)
  g.add(new Mesh(innerGeo, new MeshBasicMaterial({
    color: 0xf0c030, transparent: true, opacity: 0,
  })))

  // Radiating spike quads (4 axes = 8 spikes)
  const hw = def.coreSize * 0.6  // spike half-width at base
  const axes: [number, number, number][] = [
    [1, 0, 0], [0, 1, 0], [0.707, 0.707, 0], [-0.707, 0.707, 0],
  ]
  for (const [ax, ay, az] of axes) {
    const verts = new Float32Array([
      // positive direction
      0, 0, 0,
      ax * def.spikeLen + ay * hw, ay * def.spikeLen - ax * hw, az * def.spikeLen,
      ax * def.spikeLen - ay * hw, ay * def.spikeLen + ax * hw, az * def.spikeLen,
      // negative direction
      0, 0, 0,
      -ax * def.spikeLen + ay * hw, -ay * def.spikeLen - ax * hw, -az * def.spikeLen,
      -ax * def.spikeLen - ay * hw, -ay * def.spikeLen + ax * hw, -az * def.spikeLen,
    ])
    const cols = new Float32Array([
      1, 0.97, 0.86,  0.94, 0.73, 0.12,  0.94, 0.73, 0.12,
      1, 0.97, 0.86,  0.94, 0.73, 0.12,  0.94, 0.73, 0.12,
    ])
    const sGeo = new BufferGeometry()
    sGeo.setAttribute('position', new Float32BufferAttribute(verts, 3))
    sGeo.setAttribute('color', new Float32BufferAttribute(cols, 3))
    g.add(new Mesh(sGeo, new MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      side: DoubleSide, blending: AdditiveBlending, depthWrite: false,
    })))
  }

  // Concentric halo rings
  for (let r = 0; r < def.ringCount; r++) {
    const t = (r + 1) / (def.ringCount + 1)
    const radius = def.ringBase + t * def.spikeLen * 0.8
    const torus = new TorusGeometry(radius, 0.008 + (1 - t) * 0.015, 6, 32)
    const ringColor = new Color(0xf0c030).lerp(new Color(0x4e8fcb), t * 0.6)
    g.add(new Mesh(torus, new MeshBasicMaterial({
      color: ringColor, transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false,
    })))
  }

  return g
}

/* ── Organic cypress (many twisted, overlapping flame cones) ─────────── */

function buildCypress(): Group {
  const g = new Group()
  g.position.set(-6.2, -1.6, -1.5)

  // Central trunk
  const trunk = new ConeGeometry(0.09, 6, 6)
  trunk.translate(0, 3, 0)
  g.add(new Mesh(trunk, new MeshBasicMaterial({ color: 0x020508 })))

  // Layered foliage cones — vary position, rotation, size
  const layers = 20
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1)
    const y = 0.6 + t * 5.4
    const r = 0.20 + (1 - t) * 0.50 + Math.sin(t * 7) * 0.08
    const h = 1.4 + (1 - t) * 0.6
    const cone = new ConeGeometry(r, h, 8)
    const xOff = Math.sin(t * 4.5 + 1) * 0.14
    const zOff = Math.cos(t * 3.7) * 0.08
    cone.translate(xOff, y, zOff)
    cone.rotateZ(Math.sin(t * 6) * 0.08)
    cone.rotateX(Math.cos(t * 5) * 0.05)

    const dark = new Color(0x040810)
    const mid = new Color(0x0a1628)
    const light = new Color(0x142240)
    const col = t < 0.5
      ? new Color().copy(dark).lerp(mid, t * 2)
      : new Color().copy(mid).lerp(light, (t - 0.5) * 2)

    g.add(new Mesh(cone, new MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.92 - t * 0.08,
    })))
  }

  // Edge highlight strokes (thin cones along the right silhouette)
  for (let i = 0; i < 8; i++) {
    const t = i / 7
    const y = 1 + t * 4.5
    const edgeCone = new ConeGeometry(0.04, 0.8, 4)
    edgeCone.translate(0.18 + t * 0.05, y, 0)
    edgeCone.rotateZ(-0.15)
    g.add(new Mesh(edgeCone, new MeshBasicMaterial({
      color: new Color(0x2a4570).lerp(new Color(0x4e7aaa), t),
      transparent: true, opacity: 0.25 + t * 0.10,
    })))
  }

  g.scale.setScalar(0.001)
  return g
}

/* ── Rolling hills terrain ───────────────────────────────────────────── */

function buildHills(): Mesh {
  const geo = new PlaneGeometry(24, 6, 60, 15)
  const pos = geo.attributes.position!
  const cols = new Float32Array(pos.count * 3)
  const darkGreen = new Color(0x0a1a10)
  const midGreen = new Color(0x142820)
  const blueGreen = new Color(0x0e1e30)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const wave =
      Math.sin(x * 0.4 + 1) * 0.6 +
      Math.sin(x * 0.8 - 0.5) * 0.3 +
      Math.sin(x * 1.5 + 2) * 0.15
    pos.setZ(i, wave + y * 0.12)

    const t = (x + 12) / 24
    const c = t < 0.5
      ? new Color().copy(darkGreen).lerp(midGreen, t * 2)
      : new Color().copy(midGreen).lerp(blueGreen, (t - 0.5) * 2)
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3))
  geo.computeVertexNormals()

  const mesh = new Mesh(geo, new MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.85, side: DoubleSide,
  }))
  mesh.rotation.x = -Math.PI * 0.5
  mesh.position.set(0, -2.8, -5)
  return mesh
}

/* ── Village (extruded buildings + glowing windows + steeple) ────────── */

function buildVillage(): Group {
  const g = new Group()
  g.position.set(0, -2.4, -6)

  const buildings: { x: number; w: number; h: number; d: number }[] = [
    { x: -5, w: 0.7, h: 0.8, d: 0.5 }, { x: -4, w: 0.5, h: 0.6, d: 0.4 },
    { x: -3, w: 0.8, h: 1.0, d: 0.5 }, { x: -2, w: 0.6, h: 0.7, d: 0.4 },
    { x: -0.5, w: 0.5, h: 0.5, d: 0.3 }, { x: 0.5, w: 0.7, h: 0.9, d: 0.5 },
    { x: 1.8, w: 0.6, h: 0.6, d: 0.4 }, { x: 3, w: 0.8, h: 0.8, d: 0.5 },
    { x: 4.2, w: 0.5, h: 0.7, d: 0.3 }, { x: 5.5, w: 0.7, h: 0.6, d: 0.4 },
    { x: -6.5, w: 0.6, h: 0.5, d: 0.3 }, { x: 6.8, w: 0.5, h: 0.5, d: 0.3 },
  ]

  const windowPositions: number[] = []

  for (const b of buildings) {
    const box = new BoxGeometry(b.w, b.h, b.d)
    box.translate(b.x, b.h / 2, 0)
    g.add(new Mesh(box, new MeshBasicMaterial({
      color: new Color(0x040610).lerp(new Color(0x080c1a), Math.random() * 0.5),
      transparent: true, opacity: 0.88,
    })))

    // Windows: small warm dots on the front face
    const winCols = Math.max(1, Math.floor(b.w / 0.25))
    const winRows = Math.max(1, Math.floor(b.h / 0.3))
    for (let wy = 0; wy < winRows; wy++) {
      for (let wx = 0; wx < winCols; wx++) {
        if (Math.random() > 0.55) continue // some windows dark
        const px = b.x - b.w / 2 + 0.12 + wx * 0.22
        const py = 0.15 + wy * 0.28
        const pz = b.d / 2 + 0.02
        windowPositions.push(px, py, pz)
      }
    }
  }

  // Church steeple (center-left, tallest point)
  const steepleBase = new BoxGeometry(0.35, 1.8, 0.35)
  steepleBase.translate(-1.2, 0.9, 0)
  g.add(new Mesh(steepleBase, new MeshBasicMaterial({ color: 0x040610 })))
  const steepleTop = new ConeGeometry(0.22, 1.0, 4)
  steepleTop.translate(-1.2, 2.3, 0)
  g.add(new Mesh(steepleTop, new MeshBasicMaterial({ color: 0x040610 })))

  // Window glow points
  if (windowPositions.length > 0) {
    const wGeo = new BufferGeometry()
    wGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(windowPositions), 3))
    g.add(new Points(wGeo, new PointsMaterial({
      size: 0.06, color: 0xf0c848,
      transparent: true, opacity: 0.75,
      blending: AdditiveBlending, depthWrite: false,
    })))
  }

  return g
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function StarryNightScene({ className }: Readonly<{ className?: string }>) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const smoothRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new Scene()
    scene.fog = new FogExp2(0x060816, 0.038)
    scene.background = new Color(0x060816)

    const camera = new PerspectiveCamera(58, 1, 0.1, 80)
    camera.position.set(0, 1.8, 7)
    camera.lookAt(0, 1.2, 0)

    const renderer = new WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'
    el.appendChild(renderer.domElement)

    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 400
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const glowTex = makeGlow(128)
    const world = new Group()
    scene.add(world)

    // ── Brush-stroke bundles ──────────────────────
    const bundleDefs = buildBundles()

    interface BundleObj { group: Group; meshes: Mesh[]; def: BundleDef }
    const bundles: BundleObj[] = []

    for (const def of bundleDefs) {
      const group = new Group()
      group.scale.setScalar(0.001)
      const meshes: Mesh[] = []
      const c1 = new Color(def.colors[0])
      const c2 = new Color(def.colors[1])
      const c3 = new Color(def.colors[2])

      for (let t = 0; t < def.tubeCount; t++) {
        const offsetCurve = def.center.map((p) => new Vector3(
          p.x + (Math.sin(t * 3.7 + 1) * 0.5 - 0.25) * def.spread,
          p.y + (Math.cos(t * 2.3 + 2) * 0.5 - 0.25) * def.spread * 0.7,
          p.z + (Math.sin(t * 5.1) * 0.5 - 0.25) * def.spread * 0.4,
        ))
        const spline = new CatmullRomCurve3(offsetCurve, false, 'catmullrom', 0.5)
        const radius = def.baseRadius * (0.5 + (Math.sin(t * 1.9) * 0.5 + 0.5) * 0.8)
        const geo = new TubeGeometry(spline, def.segments, radius, 6, false)
        applyTubeGradient(geo, c1, c2, c3)

        const opVar = 0.7 + (Math.cos(t * 2.8) * 0.5 + 0.5) * 0.3
        const mat = new MeshBasicMaterial({
          vertexColors: true, transparent: true, opacity: 0,
          side: DoubleSide,
        })
        const mesh = new Mesh(geo, mat)
        mesh.userData.opTarget = def.opacity * opVar
        group.add(mesh)
        meshes.push(mesh)
      }

      world.add(group)
      bundles.push({ group, meshes, def })
    }

    // ── Stars ─────────────────────────────────────
    const starDefs = buildStarDefs()
    interface StarObj { group: Group; children: Mesh[]; def: StarDef }
    const stars: StarObj[] = []

    for (const def of starDefs) {
      const g = buildStarburstGroup(def)
      g.scale.setScalar(0.001)
      world.add(g)
      const children = g.children.filter((c): c is Mesh => c instanceof Mesh)
      stars.push({ group: g, children, def })
    }

    // ── Moon ──────────────────────────────────────
    const moonGroup = new Group()
    moonGroup.position.set(7, 5.5, -5)
    moonGroup.scale.setScalar(0.001)

    // Crescent: bright sphere, dark "bite" sphere overlapping
    const moonBright = new Mesh(
      new SphereGeometry(0.65, 28, 28),
      new MeshBasicMaterial({ color: 0xfff5d2, transparent: true, opacity: 0 }),
    )
    moonGroup.add(moonBright)
    const moonBite = new Mesh(
      new SphereGeometry(0.52, 24, 24),
      new MeshBasicMaterial({ color: 0x060816, transparent: true, opacity: 0 }),
    )
    moonBite.position.set(0.28, 0.12, 0.1)
    moonGroup.add(moonBite)

    // Concentric glow rings around moon
    for (let r = 0; r < 4; r++) {
      const t = (r + 1) / 5
      const torus = new TorusGeometry(0.65 + t * 0.8, 0.02 + (1 - t) * 0.03, 6, 40)
      const col = new Color(0xf0c030).lerp(new Color(0x4e8fcb), t * 0.5)
      moonGroup.add(new Mesh(torus, new MeshBasicMaterial({
        color: col, transparent: true, opacity: 0,
        blending: AdditiveBlending, depthWrite: false,
      })))
    }

    // Large halo glow
    const moonHaloPts = new Float32Array([0, 0, 0])
    const moonHaloGeo = new BufferGeometry()
    moonHaloGeo.setAttribute('position', new Float32BufferAttribute(moonHaloPts, 3))
    const moonHaloMat = new PointsMaterial({
      map: glowTex, size: 0.001, color: 0xe8bc38,
      transparent: true, opacity: 0,
      blending: AdditiveBlending, depthWrite: false,
    })
    moonGroup.add(new Points(moonHaloGeo, moonHaloMat))

    world.add(moonGroup)

    // ── Cypress ───────────────────────────────────
    const cypress = buildCypress()
    world.add(cypress)

    // ── Hills ─────────────────────────────────────
    world.add(buildHills())

    // ── Village ───────────────────────────────────
    world.add(buildVillage())

    // ── Ambient particles ─────────────────────────
    const DUST_N = 400
    const dustPos = new Float32Array(DUST_N * 3)
    const dustVel = new Float32Array(DUST_N)
    for (let i = 0; i < DUST_N; i++) {
      dustPos[i * 3]     = (Math.random() - 0.5) * 20
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 16
      dustPos[i * 3 + 2] = -Math.random() * 14 - 1
      dustVel[i] = 0.15 + Math.random() * 0.35
    }
    const dustGeo = new BufferGeometry()
    const dustAttr = new Float32BufferAttribute(dustPos, 3)
    dustGeo.setAttribute('position', dustAttr)
    world.add(new Points(dustGeo, new PointsMaterial({
      map: glowTex, size: 0.06, color: 0xe8bc38,
      transparent: true, opacity: 0.22,
      blending: AdditiveBlending, depthWrite: false,
    })))

    // ── Mouse parallax ────────────────────────────
    const onMouse = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      mouseRef.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouse)

    // ── Helper: set pop-in state at a given time ──
    function applyState(elapsed: number) {
      for (const { group, meshes, def } of bundles) {
        const age = Math.max(0, elapsed - def.delay)
        const s = elasticOut(Math.min(age / 1.4, 1))
        group.scale.setScalar(s)
        for (const m of meshes) {
          ;(m.material as MeshBasicMaterial).opacity = s * (m.userData.opTarget as number)
        }
        group.rotation.z = Math.sin(elapsed * def.speed + def.delay) * 0.03
        group.rotation.x = Math.cos(elapsed * def.speed * 0.7) * 0.015
        group.position.x = Math.sin(elapsed * def.speed * 0.25) * 0.12
      }

      for (const { group, children, def } of stars) {
        const age = Math.max(0, elapsed - def.delay)
        const s = elasticOut(Math.min(age / 0.9, 1))
        group.scale.setScalar(s)
        const bob = Math.sin(elapsed * 1.2 + def.delay * 3) * 0.05
        group.position.y = def.pos.y + bob
        for (const m of children) {
          const mat = m.material as MeshBasicMaterial
          if (mat.blending === AdditiveBlending) {
            mat.opacity = s * 0.45
          } else {
            mat.opacity = s * 0.92
          }
        }
      }

      const moonAge = Math.max(0, elapsed - 1.5)
      const ms = elasticOut(Math.min(moonAge / 1.6, 1))
      moonGroup.scale.setScalar(ms)
      ;(moonBright.material as MeshBasicMaterial).opacity = ms * 0.94
      ;(moonBite.material as MeshBasicMaterial).opacity = ms * 0.96
      moonHaloMat.size = 5.5 * ms
      moonHaloMat.opacity = ms * 0.20
      const moonChildren = moonGroup.children.filter((c): c is Mesh => c instanceof Mesh)
      for (const mc of moonChildren) {
        const mat = mc.material as MeshBasicMaterial
        if (mat.blending === AdditiveBlending) {
          mat.opacity = ms * 0.18
        }
      }

      const cypAge = Math.max(0, elapsed - 0.3)
      cypress.scale.setScalar(elasticOut(Math.min(cypAge / 2.0, 1)))
    }

    // ── Render loop ───────────────────────────────
    let raf = 0
    const t0 = performance.now()

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const elapsed = (performance.now() - t0) / 1000

      smoothRef.current.x += (mouseRef.current.x - smoothRef.current.x) * 0.025
      smoothRef.current.y += (mouseRef.current.y - smoothRef.current.y) * 0.025
      camera.position.x = smoothRef.current.x * 1.4
      camera.position.y = 1.8 - smoothRef.current.y * 0.9
      camera.lookAt(0, 1.2, 0)

      applyState(elapsed)

      // Dust
      const dArr = dustAttr.array as Float32Array
      for (let i = 0; i < DUST_N; i++) {
        const yi = i * 3 + 1
        dArr[yi] = (dArr[yi] ?? 0) + (dustVel[i] ?? 0) * 0.007
        if ((dArr[yi] ?? 0) > 8) {
          dArr[yi] = -8
          dArr[i * 3] = (Math.random() - 0.5) * 20
        }
      }
      dustAttr.needsUpdate = true

      world.rotation.y = Math.sin(elapsed * 0.05) * 0.025

      renderer.render(scene, camera)
    }

    if (reduced) {
      applyState(5)
      renderer.render(scene, camera)
    } else {
      raf = requestAnimationFrame(animate)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMouse)
      glowTex.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
