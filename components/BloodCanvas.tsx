'use client'

import { useEffect } from 'react'

export default function BloodCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('bloodCanvas') as HTMLCanvasElement
    if (!canvas) return

    const ctx = canvas.getContext('2d', { 
      alpha: true,
      desynchronized: true,
      willReadFrequently: false
    })
    if (!ctx) return

    // Optimize canvas settings for performance
    ctx.imageSmoothingEnabled = false
    
    // Cache canvas dimensions
    let canvasWidth = window.innerWidth
    let canvasHeight = window.innerHeight
    let dpr = window.devicePixelRatio || 1
    
    const updateCanvasSize = () => {
      dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvasWidth = rect.width
      canvasHeight = rect.height
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      canvas.style.width = canvasWidth + 'px'
      canvas.style.height = canvasHeight + 'px'
    }

    updateCanvasSize()

    // Pre-cache colors to avoid string concatenation
    const darkRed = 'rgba(139, 0, 0, 0.65)'
    const brightRed = 'rgba(200, 0, 0, 0.75)'
    
    class BloodDrop {
      x: number = 0
      y: number = 0
      speed: number = 2
      size: number = 8

      constructor() {
        this.reset()
      }

      reset() {
        this.x = Math.random() * canvasWidth
        this.y = -30
        this.speed = 1.5 + Math.random() * 3
        this.size = 4 + Math.random() * 10
      }

      update() {
        this.y += this.speed
        if (this.y > canvasHeight + 30) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        
        // Use simple ellipse - much faster than complex teardrop paths
        const radiusX = this.size * 0.35
        const radiusY = this.size * 0.85
        
        // Solid color instead of expensive gradient
        ctx.fillStyle = darkRed
        ctx.beginPath()
        ctx.ellipse(this.x, this.y + radiusY * 0.5, radiusX, radiusY, 0, 0, Math.PI * 2)
        ctx.fill()
        
        // Small highlight for depth (simple, fast)
        ctx.fillStyle = brightRed
        ctx.beginPath()
        ctx.arc(this.x - radiusX * 0.2, this.y + radiusY * 0.25, radiusX * 0.25, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const maxDrops = 30 // Reduced from 65 for better performance
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
    }

    let animationFrameId: number
    let isRunning = true
    let lastTime = 0
    const targetFPS = 60
    const frameInterval = 1000 / targetFPS

    const animate = (currentTime: number) => {
      if (!ctx || !isRunning) return
      
      const deltaTime = currentTime - lastTime
      
      // Throttle frame rate to save CPU
      if (deltaTime >= frameInterval) {
        lastTime = currentTime - (deltaTime % frameInterval)
        
        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)

        // Single loop: update and draw visible drops only
        for (let i = 0; i < bloodDrops.length; i++) {
          const drop = bloodDrops[i]
          drop.update()
          
          // Cull drops outside viewport
          if (drop.y > -40 && drop.y < canvasHeight + 40 && drop.x > -20 && drop.x < canvasWidth + 20) {
            drop.draw()
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        updateCanvasSize()
        bloodDrops.forEach(drop => drop.reset())
      }, 100)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      isRunning = false
      clearTimeout(resizeTimeout)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return (
    <canvas
      id="bloodCanvas"
      className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-80 z-0"
      style={{ transform: 'none' }}
    />
  )
}
