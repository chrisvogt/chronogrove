'use client'

import { useEffect, useRef } from 'react'
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  FogExp2,
  Vector2,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
} from 'three'
import type { Material } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import {
  sonoranDuskHazeRgb,
  sonoranDuskSilhouetteHex,
  sonoranDuskSkyGradientStops,
  sonoranDuskThree,
} from '@/theme/sonoranDuskPalette'

const SIL = sonoranDuskSilhouetteHex

/* ── Seeded PRNG (mulberry32) ────────────────────────────────────────── */

/** Signed int32 wrap semantics (same as `n | 0`); mulberry32 depends on overflow, not plain truncation. */
function coerceSignedInt32(value: number): number {
  const t = Math.trunc(value)
  let w = t % 0x1_0000_0000
  if (w >= 0x8000_0000) w -= 0x1_0000_0000
  if (w < -0x8000_0000) w += 0x1_0000_0000
  return w
}

function makeRng(seed: number) {
  let s = coerceSignedInt32(seed)
  return () => {
    s = coerceSignedInt32(s + 0x6d2b79f5)
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Glow sprite (warm gold for dust) ────────────────────────────────── */

function makeGlowTex(size = 64): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,200,100,1)')
  g.addColorStop(0.2, 'rgba(230,160,60,0.5)')
  g.addColorStop(0.5, 'rgba(180,120,30,0.08)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(c)
}

/* ── Sky gradient texture ────────────────────────────────────────────── */

function makeSkyTex(w: number, h: number, rng: () => number): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!

  const g = ctx.createLinearGradient(0, 0, 0, h)
  for (const [t, hex] of sonoranDuskSkyGradientStops) g.addColorStop(t, hex)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const { r: hzR, g: hzG, b: hzB } = sonoranDuskHazeRgb
  const cloudN = 3 + Math.floor(rng() * 4)
  for (let i = 0; i < cloudN; i++) {
    const cy = h * (0.28 + rng() * 0.24)
    const ch = 2 + rng() * 5
    const alpha = 0.06 + rng() * 0.05
    ctx.fillStyle = `rgba(${hzR},${hzG},${hzB},${alpha})`
    ctx.fillRect(0, cy, w, ch)
  }

  return new CanvasTexture(c)
}

/* ── Canvas2D silhouette helpers ──────────────────────────────────────── */

function drawMountainRange(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rng: () => number,
  horizonY: number,
  peakMax: number,
  roughness: number,
) {
  ctx.beginPath()
  ctx.moveTo(-5, h + 5)
  ctx.lineTo(-5, horizonY)

  const segs = 60
  let prev = 0
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * (w + 10) - 5
    const broad = Math.sin(i * 0.35 + rng() * 3) * peakMax * (0.4 + rng() * 0.6)
    const fine = (rng() - 0.5) * roughness
    const raw = broad + fine
    prev = prev * 0.3 + raw * 0.7
    ctx.lineTo(x, horizonY - Math.max(0, prev))
  }

  ctx.lineTo(w + 5, horizonY)
  ctx.lineTo(w + 5, h + 5)
  ctx.closePath()
  ctx.fill()
}

function drawSaguaro(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  h: number,
  rng: () => number,
) {
  const tw = Math.max(3, h * 0.055)
  const aw = tw * 0.7

  ctx.fillRect(cx - tw, baseY - h, tw * 2, h)
  ctx.beginPath()
  ctx.arc(cx, baseY - h, tw, 0, Math.PI * 2)
  ctx.fill()

  let armN = 0
  if (rng() > 0.25) {
    armN = rng() > 0.55 ? 2 : 1
  }
  let prevSide = 0
  for (let a = 0; a < armN; a++) {
    let side: number
    if (a === 0) {
      side = rng() > 0.5 ? 1 : -1
    } else {
      side = -prevSide
    }
    prevSide = side
    const armY = baseY - h * (0.35 + rng() * 0.3)
    const reach = tw * 1.5 + h * (0.08 + rng() * 0.1)
    const armUp = h * (0.12 + rng() * 0.18)

    const hx = side > 0 ? cx + tw : cx - tw - reach
    ctx.fillRect(hx, armY - aw, reach, aw * 2)

    const elbowCX = side > 0 ? cx + tw + reach : cx - tw - reach
    ctx.fillRect(elbowCX - aw, armY - armUp, aw * 2, armUp + aw)
    ctx.beginPath()
    ctx.arc(elbowCX, armY - armUp, aw, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawMesa(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  mw: number,
  mh: number,
) {
  ctx.beginPath()
  ctx.moveTo(x - mw * 0.6, baseY)
  ctx.lineTo(x - mw * 0.35, baseY - mh)
  ctx.lineTo(x + mw * 0.35, baseY - mh)
  ctx.lineTo(x + mw * 0.6, baseY)
  ctx.closePath()
  ctx.fill()
}

/* ── Silhouette factory ──────────────────────────────────────────────── */

type LayerKind = 'far-mtns' | 'mid-mtns' | 'terrain' | 'far-cacti' | 'near-cacti'

function makeSilhouette(
  cw: number,
  ch: number,
  color: string,
  rng: () => number,
  kind: LayerKind,
): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color
  ctx.strokeStyle = color

  switch (kind) {
    case 'far-mtns':
      drawMountainRange(ctx, cw, ch, rng, ch * 0.54, ch * 0.07, ch * 0.015)
      break
    case 'mid-mtns':
      drawMountainRange(ctx, cw, ch, rng, ch * 0.56, ch * 0.09, ch * 0.025)
      break
    case 'terrain': {
      const hy = ch * 0.58
      ctx.fillRect(-5, hy, cw + 10, ch - hy + 5)
      for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
        drawMesa(ctx, cw * (0.15 + rng() * 0.7), hy, 30 + rng() * 60, 12 + rng() * 28)
      }
      for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
        drawSaguaro(ctx, cw * (0.1 + rng() * 0.8), hy, 20 + rng() * 45, rng)
      }
      break
    }
    case 'far-cacti': {
      const hy = ch * 0.60
      ctx.fillRect(-5, hy, cw + 10, ch - hy + 5)
      for (let i = 0; i < 3 + Math.floor(rng() * 4); i++) {
        drawSaguaro(ctx, cw * (0.05 + rng() * 0.9), hy, 30 + rng() * 65, rng)
      }
      break
    }
    case 'near-cacti': {
      const hy = ch * 0.62
      ctx.fillRect(-5, hy, cw + 10, ch - hy + 5)
      for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
        const left = rng() > 0.5
        const sx = left ? cw * (0.04 + rng() * 0.14) : cw * (0.82 + rng() * 0.14)
        drawSaguaro(ctx, sx, hy, 70 + rng() * 120, rng)
      }
      break
    }
  }

  const tex = new CanvasTexture(c)
  tex.needsUpdate = true
  return tex
}

function disposeMaterialResource(m: Material | Material[]): void {
  if (Array.isArray(m)) {
    for (const mat of m) mat.dispose()
    return
  }
  m.dispose()
}

function disposeMeshOrPointsResources(obj: Mesh | Points, disposed: Set<BufferGeometry>): void {
  const { geometry } = obj
  if (!disposed.has(geometry)) {
    disposed.add(geometry)
    geometry.dispose()
  }
  disposeMaterialResource(obj.material)
}

/* ── Component ───────────────────────────────────────────────────────── */

export default function SonoranDuskScene({ className }: Readonly<{ className?: string }>) {
  const mountRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const smoothRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const rng = makeRng(0xa17c5e3b)

    /* ── Scene ──────────────────────────────────────────── */

    const scene = new Scene()
    scene.background = new Color(sonoranDuskThree.void)
    scene.fog = new FogExp2(sonoranDuskThree.fog, 0.012)

    const camera = new PerspectiveCamera(55, 1, 0.1, 80)
    camera.position.set(0, 0.5, 5)

    const renderer = new WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block'
    el.appendChild(renderer.domElement)

    const textures: CanvasTexture[] = []
    const glowTex = makeGlowTex()
    textures.push(glowTex)

    /* ── Bloom ─────────────────────────────────────────── */

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(
      new Vector2(el.clientWidth || 400, el.clientHeight || 600),
      0.7,
      0.6,
      0.3,
    )
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    /* ── Sky gradient ──────────────────────────────────── */

    const skyTex = makeSkyTex(2048, 1024, rng)
    textures.push(skyTex)
    const skyPlane = new Mesh(
      new PlaneGeometry(96, 44),
      new MeshBasicMaterial({ map: skyTex, depthWrite: false, fog: false }),
    )
    skyPlane.position.set(0, 0, -35)
    scene.add(skyPlane)

    /* ── Stars (upper sky only) ────────────────────────── */

    const STAR_N = 250
    const starArr = new Float32Array(STAR_N * 3)
    for (let i = 0; i < STAR_N; i++) {
      starArr[i * 3] = (rng() - 0.5) * 40
      starArr[i * 3 + 1] = 4 + rng() * 18
      starArr[i * 3 + 2] = -25 - rng() * 25
    }
    const starGeo = new BufferGeometry()
    starGeo.setAttribute('position', new Float32BufferAttribute(starArr, 3))
    scene.add(
      new Points(
        starGeo,
        new PointsMaterial({
          color: sonoranDuskThree.star,
          size: 0.05,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      ),
    )

    /* ── Sun + glow ────────────────────────────────────── */

    const sunGeo = new SphereGeometry(3, 32, 20)
    const sunMat = new MeshBasicMaterial({
      color: sonoranDuskThree.sun,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
    const sun = new Mesh(sunGeo, sunMat)
    sun.position.set(0.5, -1.5, -33)
    scene.add(sun)

    const sunGlowMesh = new Mesh(
      new SphereGeometry(1.8, 16, 12),
      new MeshBasicMaterial({
        color: sonoranDuskThree.sunGlow,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    )
    sunGlowMesh.position.copy(sun.position)
    scene.add(sunGlowMesh)

    const sunHaloMesh = new Mesh(
      new SphereGeometry(8, 16, 12),
      new MeshBasicMaterial({
        color: sonoranDuskThree.sunHalo,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    )
    sunHaloMesh.position.copy(sun.position)
    scene.add(sunHaloMesh)

    /* ── Silhouette layers ─────────────────────────────── */

    const KINDS: LayerKind[] = ['far-mtns', 'mid-mtns', 'terrain', 'far-cacti', 'near-cacti']
    const LZ = [-24, -16, -10, -5, -1]
    const LS = [31, 22, 16, 11, 7.5]
    const LP = [0.06, 0.18, 0.35, 0.58, 0.9]
    const LSW = [0.006, 0.012, 0.02, 0.03, 0.04]
    const LSPD = [0.06, 0.09, 0.08, 0.11, 0.1]
    const LPH = [0, 1.1, 2.4, 3.8, 5.2]
    const LFOG = [true, true, false, false, false]

    const layerMeshes: Mesh[] = []
    for (let i = 0; i < 5; i++) {
      const tex = makeSilhouette(2048, 1024, SIL[i]!, rng, KINDS[i]!)
      textures.push(tex)
      const geo = new PlaneGeometry(LS[i]! * 2.2, LS[i]!)
      const mat = new MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: LFOG[i]!,
      })
      const mesh = new Mesh(geo, mat)
      mesh.position.set(0, 0, LZ[i]!)
      scene.add(mesh)
      layerMeshes.push(mesh)
    }

    /* ── Dust particles ────────────────────────────────── */

    const DUST_N = 80
    const dustBase = new Float32Array(DUST_N * 3)
    const dustPar = new Float32Array(DUST_N * 3)
    const dustPos = new Float32Array(DUST_N * 3)
    for (let i = 0; i < DUST_N; i++) {
      dustBase[i * 3] = (rng() - 0.5) * 14
      dustBase[i * 3 + 1] = -2 + rng() * 5
      dustBase[i * 3 + 2] = -2 - rng() * 16
      dustPar[i * 3] = rng() * Math.PI * 2
      dustPar[i * 3 + 1] = rng() * Math.PI * 2
      dustPar[i * 3 + 2] = 0.05 + rng() * 0.1
    }
    const dustGeo = new BufferGeometry()
    const dustPosAttr = new Float32BufferAttribute(dustPos, 3)
    dustGeo.setAttribute('position', dustPosAttr)
    scene.add(
      new Points(
        dustGeo,
        new PointsMaterial({
          map: glowTex,
          color: sonoranDuskThree.dust,
          size: 0.12,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      ),
    )

    /* ── Resize + events ───────────────────────────────── */

    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 400
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const onMouse = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      mouseRef.current.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }
    window.addEventListener('mousemove', onMouse)

    /* ── Animation ─────────────────────────────────────── */

    let raf = 0
    const t0 = performance.now()

    const animate = () => {
      raf = requestAnimationFrame(animate)
      const t = (performance.now() - t0) / 1000

      smoothRef.current.x += (mouseRef.current.x - smoothRef.current.x) * 0.025
      smoothRef.current.y += (mouseRef.current.y - smoothRef.current.y) * 0.025
      const mx = smoothRef.current.x
      const my = smoothRef.current.y

      camera.position.x = mx * 0.2
      camera.position.y = 0.5 - my * 0.08
      camera.lookAt(mx * 0.03, 0, -5)

      skyPlane.position.x = mx * 0.04
      skyPlane.position.y = -my * 0.02

      for (let i = 0; i < 5; i++) {
        const m = layerMeshes[i]!
        m.position.x = mx * LP[i]! + Math.sin(t * LSPD[i]! + LPH[i]!) * LSW[i]!
        m.position.y = -my * LP[i]! * 0.12
      }

      for (let i = 0; i < DUST_N; i++) {
        const bx = dustBase[i * 3]!
        const by = dustBase[i * 3 + 1]!
        const bz = dustBase[i * 3 + 2]!
        const px = dustPar[i * 3]!
        const py = dustPar[i * 3 + 1]!
        const freq = dustPar[i * 3 + 2]!
        dustPos[i * 3] = bx + Math.sin(t * freq + px) * 0.6
        dustPos[i * 3 + 1] = by + Math.cos(t * freq * 0.5 + py) * 0.3
        dustPos[i * 3 + 2] = bz + Math.sin(t * freq * 0.3 + px * 1.5) * 0.2
      }
      dustPosAttr.needsUpdate = true

      sunMat.opacity = 0.28 + 0.04 * Math.sin(t * 0.12)

      composer.render()
    }

    if (reduced) {
      camera.lookAt(0, 0, -5)
      for (let i = 0; i < DUST_N; i++) {
        dustPos[i * 3] = dustBase[i * 3]!
        dustPos[i * 3 + 1] = dustBase[i * 3 + 1]!
        dustPos[i * 3 + 2] = dustBase[i * 3 + 2]!
      }
      dustPosAttr.needsUpdate = true
      composer.render()
    } else {
      raf = requestAnimationFrame(animate)
    }

    /* ── Cleanup ───────────────────────────────────────── */

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMouse)
      for (const tx of textures) tx.dispose()
      const disposed = new Set<BufferGeometry>()
      scene.traverse((obj) => {
        if (obj instanceof Mesh || obj instanceof Points) {
          disposeMeshOrPointsResources(obj, disposed)
        }
      })
      bloom.dispose()
      composer.renderTarget1.dispose()
      composer.renderTarget2.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%' }} />
}
