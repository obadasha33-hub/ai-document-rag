'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const ACCENT = 0x6366f1

export default function ChatLoading3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const size = 48
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    })
    renderer.setSize(size, size)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
    camera.position.set(0, 0, 3)

    const ambient = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambient)

    // Orbiting cubes
    const cubeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3)
    const cubes: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.6 - i * 0.15,
        roughness: 0.5,
      })
      const mesh = new THREE.Mesh(cubeGeo, mat)
      scene.add(mesh)
      cubes.push(mesh)
    }

    let frameId: number
    const clock = new THREE.Clock()

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      for (let i = 0; i < cubes.length; i++) {
        const angle = t * 2 + (i * Math.PI * 2) / 3
        const radius = 0.6
        cubes[i].position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          0
        )
        cubes[i].rotation.x = t * 1.5 + i
        cubes[i].rotation.y = t * 1.2 + i * 0.5
        const scale = 0.7 + Math.sin(t * 3 + i * 2) * 0.3
        cubes[i].scale.setScalar(scale)
      }

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frameId)
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: 48, height: 48, display: 'inline-flex' }}
      aria-label="Loading"
      role="status"
    />
  )
}
