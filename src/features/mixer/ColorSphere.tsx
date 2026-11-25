import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { hexToLab, spherePosition } from '@/lib/color'
import type { GraphProps } from './bench'

interface Scene {
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  points: THREE.Group
  markers: THREE.Group
  render: () => void
}

const START = new THREE.Vector3(1.7, 0.85, 2.85)

const circle = (radius: number, y: number, vertical: 'x' | 'z' | null): THREE.Vector3[] =>
  Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2
    const u = Math.cos(t) * radius
    const v = Math.sin(t) * radius
    if (vertical === 'x') return new THREE.Vector3(u, v, 0)
    if (vertical === 'z') return new THREE.Vector3(0, v, u)
    return new THREE.Vector3(u, y, v)
  })

const loop = (pts: THREE.Vector3[], opacity: number): THREE.LineLoop =>
  new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#9a9a9a', transparent: true, opacity }))

/** Equator coloured by the hue found in that direction, so the sphere can be read without labels. */
const hueRing = (): THREE.LineLoop => {
  const pts = circle(1, 0, null)
  const colors: number[] = []
  for (const p of pts) {
    const angle = (Math.atan2(-p.z, p.x) / (Math.PI * 2)) * 360
    const c = new THREE.Color().setHSL((((angle - 22 + 360) % 360) / 360) % 1, 0.75, 0.55)
    colors.push(c.r, c.g, c.b)
  }
  const g = new THREE.BufferGeometry().setFromPoints(pts)
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ vertexColors: true }))
}

const clear = (group: THREE.Group): void => {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) child.material.dispose()
  }
}

const DOT = new THREE.SphereGeometry(0.038, 20, 14)
const RING = new THREE.TorusGeometry(0.075, 0.009, 8, 32)
const GEM = new THREE.OctahedronGeometry(0.085)

export const ColorSphere = ({ points, markers, selected, onSelect }: GraphProps) => {
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<Scene | null>(null)
  const select = useRef(onSelect)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    select.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    const world = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 20)
    camera.position.copy(START)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 6

    const dots = new THREE.Group()
    const gems = new THREE.Group()
    world.add(loop(circle(1, 0, 'x'), 0.35), loop(circle(1, 0, 'z'), 0.35), hueRing())
    for (const y of [-0.66, -0.33, 0.33, 0.66]) world.add(loop(circle(Math.sqrt(1 - y * y), y, null), 0.18))
    const axis = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0)])
    axis.setAttribute('color', new THREE.Float32BufferAttribute([0.02, 0.02, 0.02, 1, 1, 1], 3))
    world.add(new THREE.Line(axis, new THREE.LineBasicMaterial({ vertexColors: true })), dots, gems)

    const render = (): void => {
      for (const child of [...gems.children, ...dots.children]) if (child.name === 'ring') child.quaternion.copy(camera.quaternion)
      renderer.render(world, camera)
    }
    const resize = (): void => {
      const { clientWidth: w, clientHeight: h } = el
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.fov = w < h ? 38 * Math.min(1.7, h / w) : 38
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    controls.addEventListener('change', render)

    const ray = new THREE.Raycaster()
    const hit = (e: PointerEvent): THREE.Object3D | null => {
      const r = el.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      return ray.intersectObjects([...dots.children, ...gems.children].filter((o) => o.name !== 'ring'), false)[0]?.object ?? null
    }
    let down: [number, number] = [0, 0]
    const onMove = (e: PointerEvent): void => {
      const o = e.buttons === 0 ? hit(e) : null
      el.style.cursor = o ? 'pointer' : 'grab'
      if (!o) return setTip(null)
      const r = el.getBoundingClientRect()
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: String(o.userData.label) })
    }
    const onDown = (e: PointerEvent): void => {
      down = [e.clientX, e.clientY]
    }
    const onUp = (e: PointerEvent): void => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
      const code = hit(e)?.userData.code
      if (typeof code === 'string') select.current(code)
    }
    const onLeave = (): void => setTip(null)
    const canvas = renderer.domElement
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    scene.current = { renderer, camera, controls, points: dots, markers: gems, render }
    resize()

    return () => {
      observer.disconnect()
      controls.dispose()
      clear(dots)
      clear(gems)
      renderer.dispose()
      canvas.remove()
      scene.current = null
    }
  }, [])

  useEffect(() => {
    const s = scene.current
    if (!s) return
    clear(s.points)
    for (const p of points) {
      const mesh = new THREE.Mesh(DOT, new THREE.MeshBasicMaterial({ color: p.hex, toneMapped: false }))
      mesh.position.set(...spherePosition(hexToLab(p.hex)))
      mesh.userData = { code: p.code, label: `${p.name} ${p.code} ${p.hex}` }
      if (p.code === selected) {
        mesh.scale.setScalar(1.5)
        const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }))
        ring.name = 'ring'
        ring.position.copy(mesh.position)
        s.points.add(ring)
      }
      s.points.add(mesh)
    }
    s.render()
  }, [points, selected])

  useEffect(() => {
    const s = scene.current
    if (!s) return
    clear(s.markers)
    for (const m of markers) {
      const gem = new THREE.Mesh(GEM, new THREE.MeshBasicMaterial({ color: m.hex, toneMapped: false }))
      gem.position.set(...spherePosition(hexToLab(m.hex)))
      gem.userData = { label: `${m.label} ${m.hex}` }
      const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }))
      ring.name = 'ring'
      ring.scale.setScalar(1.35)
      ring.position.copy(gem.position)
      s.markers.add(gem, ring)
    }
    s.render()
  }, [markers])

  if (failed) return <p className="p-6 text-dim">This browser cannot show 3D. Switch to 2D above.</p>

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" role="img" aria-label={`Color sphere with ${points.length} paints. Height is lightness, angle is hue, distance from the axis is saturation.`} />
      <button
        type="button"
        className="btn absolute bottom-3 right-3"
        onClick={() => {
          const s = scene.current
          if (!s) return
          s.camera.position.copy(START)
          s.controls.target.set(0, 0, 0)
          s.controls.update()
          s.render()
        }}
      >
        Reset view
      </button>
      {tip && <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-black/85 px-2 py-1 text-xs" style={{ left: Math.max(4, tip.x - 60), top: Math.max(4, tip.y - 34) }}>{tip.text}</div>}
    </div>
  )
}
