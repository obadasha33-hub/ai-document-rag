'use client'

import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function HeroScene() {
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambient)

    // Cosmic nebula palette colors
    const colorPurple = new THREE.Color(0x6b21a8) // #6B21A8
    const colorBlue = new THREE.Color(0x3b82f6)   // #3B82F6
    const colorPink = new THREE.Color(0xec4899)   // #EC4899
    const colorSage = new THREE.Color(0x10b981)   // Forest Sage
    const colorForest = new THREE.Color(0x065f46) // Dark Forest

    // Generate high-density organic particle nebula
    const particleCount = 3500
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(particleCount * 3)
    const colors = new Float32Array(particleCount * 3)
    const initialPositions: THREE.Vector3[] = []
    const phases = new Float32Array(particleCount)
    const speeds = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      // Distribute particles in a dynamic cosmic disk/organic cloud core
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos((Math.random() * 2) - 1)
      const radius = 3 + Math.random() * 5

      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta) * 0.8 // slightly squashed disk
      const z = radius * Math.cos(phi)

      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      initialPositions.push(new THREE.Vector3(x, y, z))
      phases[i] = Math.random() * Math.PI * 2
      speeds[i] = 0.15 + Math.random() * 0.45

      // Assign initial colors (purples, blues, pinks)
      const r = Math.random()
      const pColor = r > 0.66 ? colorPink : r > 0.33 ? colorBlue : colorPurple
      colors[i * 3] = pColor.r
      colors[i * 3 + 1] = pColor.g
      colors[i * 3 + 2] = pColor.b
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // Canvas circular soft glow particle texture (precompiled)
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
      size: 0.16,
      map: texture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    // Mouse coordinates tracking
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
      
      // Sync colors and blending with theme
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'
      const isLight = currentTheme === 'light'
      const isForest = currentTheme === 'forest'

      // Attenuate visuals for light mode legibility
      material.opacity = isLight ? 0.35 : 0.85
      material.size = isLight ? 0.10 : 0.16
      material.blending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending

      const mouse3D = new THREE.Vector3(mouse.x * 12, mouse.y * 9, 0)

      for (let i = 0; i < particleCount; i++) {
        const initPos = initialPositions[i]
        const phase = phases[i]
        const speed = speeds[i]

        // Cosmic fluid organic turbulence wave calculations
        const waveX = Math.sin(t * speed + phase) * 0.7
        const waveY = Math.cos(t * speed * 0.75 + phase) * 0.5
        const waveZ = Math.sin(t * speed * 1.3 + phase) * 0.4

        let targetX = initPos.x + waveX
        let targetY = initPos.y + waveY
        let targetZ = initPos.z + waveZ

        // Apply interactive mouse gravity field warp
        const particlePos = new THREE.Vector3(targetX, targetY, targetZ)
        const dist = particlePos.distanceTo(mouse3D)
        
        if (dist < 4.5) {
          const pullForce = (4.5 - dist) * 0.16
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
          // Muted corporate indigo slate for light theme readability
          const col = new THREE.Color(0x4f46e5)
          colorAttr.setXYZ(i, col.r, col.g, col.b)
        } else {
          // Deep cosmic neon palette (pink, purple, blue)
          const choice = i % 3
          const col = choice === 0 ? colorPurple : choice === 1 ? colorBlue : colorPink
          colorAttr.setXYZ(i, col.r, col.g, col.b)
        }
      }

      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true

      // Slow continuous orbital rotation
      particles.rotation.y = t * 0.015
      particles.rotation.x = Math.sin(t * 0.05) * 0.03

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
