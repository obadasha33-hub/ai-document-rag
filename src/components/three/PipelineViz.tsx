'use client'

import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function PipelineViz() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)

    // Scene
    const scene = new THREE.Scene()

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100)
    camera.position.set(0, 0, 15)

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambient)

    // Palette Colors
    const colorPurple = new THREE.Color(0x6b21a8)
    const colorBlue = new THREE.Color(0x3b82f6)
    const colorPink = new THREE.Color(0xec4899)
    const colorSage = new THREE.Color(0x10b981)
    const colorForest = new THREE.Color(0x065f46)

    // Generate high-density organic pipeline path particles
    const particleCount = 2500
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    
    // We create a Bezier tube path represent pipeline stages
    const curvePoints = [
      new THREE.Vector3(-8, 3, -2),   // Input
      new THREE.Vector3(-4, -2, 2),  // Chunk
      new THREE.Vector3(0, 4, 0),     // Embed
      new THREE.Vector3(4, -1, 3),   // Retrieve
      new THREE.Vector3(8, 2, -1)     // Output
    ]
    const curve = new THREE.CatmullRomCurve3(curvePoints)

    const offsets = new Float32Array(particleCount * 3) // local orbit offsets
    const progress = new Float32Array(particleCount)
    const speeds = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      progress[i] = Math.random()
      speeds[i] = 0.0008 + Math.random() * 0.0015

      // Circular offset around path center (creates a volumetric pipe/nebula flow)
      const angle = Math.random() * Math.PI * 2
      const radius = 0.5 + Math.random() * 1.5
      offsets[i * 3] = Math.cos(angle) * radius
      offsets[i * 3 + 1] = Math.sin(angle) * radius
      offsets[i * 3 + 2] = (Math.random() - 0.5) * 0.5

      // Sample position along curve
      const pos = curve.getPoint(progress[i])
      positions[i * 3] = pos.x + offsets[i * 3]
      positions[i * 3 + 1] = pos.y + offsets[i * 3 + 1]
      positions[i * 3 + 2] = pos.z + offsets[i * 3 + 2]

      // Colors
      const r = Math.random()
      const pColor = r > 0.66 ? colorPink : r > 0.33 ? colorBlue : colorPurple
      colors[i * 3] = pColor.r
      colors[i * 3 + 1] = pColor.g
      colors[i * 3 + 2] = pColor.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // Particle sprite texture (precompiled)
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
      grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.8)')
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 16, 16)
    }
    const texture = new THREE.CanvasTexture(canvas)

    const material = new THREE.PointsMaterial({
      size: 0.15,
      map: texture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    // Mouse tracking
    const mouse = { x: 0, y: 0 }
    const targetMouse = { x: 0, y: 0 }

    const handleMouseMove = (e: MouseEvent) => {
      targetMouse.x = (e.clientX / window.innerWidth) * 2 - 1
      targetMouse.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })

    // Animation Loop
    let frameId: number
    const clock = new THREE.Clock()

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Smooth mouse coordinates dampening
      mouse.x += (targetMouse.x - mouse.x) * 0.08
      mouse.y += (targetMouse.y - mouse.y) * 0.08

      const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute

      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'
      const isLight = currentTheme === 'light'
      const isForest = currentTheme === 'forest'

      material.opacity = isLight ? 0.35 : 0.85
      material.size = isLight ? 0.09 : 0.15
      material.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending

      const mouse3D = new THREE.Vector3(mouse.x * 12, mouse.y * 9, 0)

      for (let i = 0; i < particleCount; i++) {
        // Move particles along the curve path
        progress[i] += speeds[i]
        if (progress[i] > 1) {
          progress[i] = 0 // loop flow
        }

        const curvePos = curve.getPoint(progress[i])
        
        // Dynamic sine wave turbulence around the Bezier path
        const waveX = offsets[i * 3] + Math.sin(t * 2 + progress[i] * Math.PI * 4) * 0.15
        const waveY = offsets[i * 3 + 1] + Math.cos(t * 1.5 + progress[i] * Math.PI * 4) * 0.15
        const waveZ = offsets[i * 3 + 2] + Math.sin(t + progress[i] * Math.PI * 2) * 0.1

        let targetX = curvePos.x + waveX
        let targetY = curvePos.y + waveY
        let targetZ = curvePos.z + waveZ

        // Apply interactive mouse gravity field warp
        const particlePos = new THREE.Vector3(targetX, targetY, targetZ)
        const dist = particlePos.distanceTo(mouse3D)
        
        if (dist < 4.0) {
          const pullForce = (4.0 - dist) * 0.18
          const dir = new THREE.Vector3().subVectors(mouse3D, particlePos).normalize()
          targetX += dir.x * pullForce
          targetY += dir.y * pullForce
          targetZ += dir.z * pullForce * 0.5
        }

        positionAttr.setXYZ(i, targetX, targetY, targetZ)

        // Dynamic theme-based color mapping
        if (isForest) {
          const choice = i % 3
          const col = choice === 0 ? colorSage : choice === 1 ? colorForest : new THREE.Color(0xfefefe)
          colorAttr.setXYZ(i, col.r, col.g, col.b)
        } else if (isLight) {
          const col = new THREE.Color(0x4f46e5)
          colorAttr.setXYZ(i, col.r, col.g, col.b)
        } else {
          const choice = i % 3
          const col = choice === 0 ? colorPurple : choice === 1 ? colorBlue : colorPink
          colorAttr.setXYZ(i, col.r, col.g, col.b)
        }
      }

      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true

      // Camera parallax
      camera.position.x += (mouse.x * 2.5 - camera.position.x) * 0.04
      camera.position.y += (mouse.y * 1.8 - camera.position.y) * 0.04
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden
    />
  )
}
