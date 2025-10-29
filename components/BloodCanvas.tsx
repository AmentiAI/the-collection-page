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
        
        // Realistic blood drop shape - teardrop with elongated body
        const width = this.size * 0.7
        const height = this.size * 1.8
        
        // Main drop shadow/depth (darker base)
        ctx.fillStyle = `rgba(100, 0, 0, ${this.opacity * 0.8})`
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.bezierCurveTo(
          this.x - width * 0.4, this.y + height * 0.4,
          this.x - width * 0.5, this.y + height * 0.75,
          this.x - width * 0.4, this.y + height
        )
        ctx.bezierCurveTo(
          this.x - width * 0.2, this.y + height * 1.05,
          this.x + width * 0.2, this.y + height * 1.05,
          this.x + width * 0.4, this.y + height
        )
        ctx.bezierCurveTo(
          this.x + width * 0.5, this.y + height * 0.75,
          this.x + width * 0.4, this.y + height * 0.4,
          this.x, this.y
        )
        ctx.closePath()
        ctx.fill()
        
        // Main drop body (lighter red)
        ctx.fillStyle = `rgba(180, 0, 0, ${this.opacity})`
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.bezierCurveTo(
          this.x - width * 0.35, this.y + height * 0.35,
          this.x - width * 0.45, this.y + height * 0.7,
          this.x - width * 0.35, this.y + height * 0.95
        )
        ctx.bezierCurveTo(
          this.x - width * 0.15, this.y + height * 1.0,
          this.x + width * 0.15, this.y + height * 1.0,
          this.x + width * 0.35, this.y + height * 0.95
        )
        ctx.bezierCurveTo(
          this.x + width * 0.45, this.y + height * 0.7,
          this.x + width * 0.35, this.y + height * 0.35,
          this.x, this.y
        )
        ctx.closePath()
        ctx.fill()
        
        // Highlight/shine on top
        const highlightY = this.y + height * 0.25
        const highlightSize = width * 0.2
        ctx.fillStyle = `rgba(255, 100, 100, ${this.opacity * 0.6})`
        ctx.beginPath()
        ctx.ellipse(
          this.x - width * 0.15,
          highlightY,
          highlightSize * 0.6,
          highlightSize,
          -0.3,
          0,
          Math.PI * 2
        )
        ctx.fill()
        
        // Small bright highlight spot
        ctx.fillStyle = `rgba(255, 200, 200, ${this.opacity * 0.8})`
        ctx.beginPath()
        ctx.arc(this.x - width * 0.1, highlightY, highlightSize * 0.3, 0, Math.PI * 2)
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
