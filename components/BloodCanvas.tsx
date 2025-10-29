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

    // Optimize canvas settings
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'low'
    
    // Cache canvas dimensions to avoid expensive getBoundingClientRect calls
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
      ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
      ctx.scale(dpr, dpr)
      canvas.style.width = canvasWidth + 'px'
      canvas.style.height = canvasHeight + 'px'
    }

    updateCanvasSize()

    class BloodDrop {
      x: number = 0
      y: number = 0
      speed: number = 2
      size: number = 8
      opacity: number = 0.5

      constructor() {
        this.reset()
      }

      reset() {
        this.x = Math.random() * canvasWidth
        this.y = -20
        this.speed = 1.5 + Math.random() * 4
        this.size = 5 + Math.random() * 15
        this.opacity = 0.5 + Math.random() * 0.5
      }

      update() {
        this.y += this.speed
        if (this.y > canvasHeight + 20) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        
        // Simplified teardrop shape using ellipse and triangle approximation
        const radius = this.size * 0.5
        const height = this.size * 1.4
        
        // Draw main drop body (simplified teardrop)
        ctx.fillStyle = `rgba(139, 0, 0, ${this.opacity})`
        ctx.beginPath()
        // Top point
        ctx.moveTo(this.x, this.y)
        // Left side curve (simplified as arc)
        ctx.quadraticCurveTo(this.x - radius * 0.5, this.y + height * 0.5, this.x - radius * 0.4, this.y + height)
        // Bottom (rounded)
        ctx.arc(this.x, this.y + height, radius * 0.6, Math.PI, 0, false)
        // Right side curve
        ctx.quadraticCurveTo(this.x + radius * 0.5, this.y + height * 0.5, this.x, this.y)
        ctx.closePath()
        ctx.fill()
      }
    }

    const maxDrops = 80
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
    }

    let animationFrameId: number
    let isRunning = true

    const animate = () => {
      if (!ctx || !isRunning) return
      
      // Clear entire canvas - no trail effect for better performance
      ctx.clearRect(0, 0, canvasWidth, canvasHeight)

      // Batch update and draw for better performance
      bloodDrops.forEach(drop => {
        drop.update()
        drop.draw()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    let resizeTimeout: NodeJS.Timeout
    const handleResize = () => {
      // Debounce resize to avoid excessive canvas resets
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        updateCanvasSize()
        // Reset drops on resize
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
