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
    ctx.imageSmoothingEnabled = false
    
    let dpr = 1
    const updateCanvasSize = () => {
      dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
      ctx.scale(dpr, dpr)
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
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
        const rect = canvas.getBoundingClientRect()
        this.x = Math.random() * rect.width
        this.y = -20
        this.speed = 1.5 + Math.random() * 4
        this.size = 5 + Math.random() * 15
        this.opacity = 0.5 + Math.random() * 0.5
      }

      update() {
        this.y += this.speed
        const rect = canvas.getBoundingClientRect()
        if (this.y > rect.height + 20) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        
        // Draw a teardrop/blood drop shape
        const dropHeight = this.size * 1.5
        const dropWidth = this.size * 0.8
        
        ctx.fillStyle = `rgba(139, 0, 0, ${this.opacity})`
        ctx.beginPath()
        
        // Top point (where drop comes to a point)
        ctx.moveTo(this.x, this.y)
        
        // Left curve
        ctx.bezierCurveTo(
          this.x - dropWidth * 0.3, this.y + dropHeight * 0.3,
          this.x - dropWidth * 0.5, this.y + dropHeight * 0.7,
          this.x - dropWidth * 0.4, this.y + dropHeight
        )
        
        // Bottom rounded end
        ctx.bezierCurveTo(
          this.x - dropWidth * 0.2, this.y + dropHeight * 1.1,
          this.x + dropWidth * 0.2, this.y + dropHeight * 1.1,
          this.x + dropWidth * 0.4, this.y + dropHeight
        )
        
        // Right curve
        ctx.bezierCurveTo(
          this.x + dropWidth * 0.5, this.y + dropHeight * 0.7,
          this.x + dropWidth * 0.3, this.y + dropHeight * 0.3,
          this.x, this.y
        )
        
        ctx.fill()
        
        // Add highlight for 3D effect
        ctx.fillStyle = `rgba(255, 0, 0, ${this.opacity * 0.3})`
        ctx.beginPath()
        ctx.ellipse(
          this.x - dropWidth * 0.2, 
          this.y + dropHeight * 0.3, 
          dropWidth * 0.15, 
          dropHeight * 0.2, 
          0, 
          0, 
          Math.PI * 2
        )
        ctx.fill()
      }
    }

    const maxDrops = 80
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
    }

    let animationFrameId: number
    let lastTime = 0
    const fps = 60
    const frameInterval = 1000 / fps

    const animate = (currentTime: number) => {
      if (!ctx) return
      
      const deltaTime = currentTime - lastTime
      
      if (deltaTime >= frameInterval) {
        // Clear entire canvas properly (use scaled dimensions)
        const rect = canvas.getBoundingClientRect()
        ctx.clearRect(0, 0, rect.width, rect.height)
        
        // Draw trail effect more efficiently
        ctx.fillStyle = 'rgba(10, 10, 10, 0.08)'
        ctx.fillRect(0, 0, rect.width, rect.height)

        bloodDrops.forEach(drop => {
          drop.update()
          drop.draw()
        })

        lastTime = currentTime - (deltaTime % frameInterval)
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animationFrameId = requestAnimationFrame(animate)

    const handleResize = () => {
      updateCanvasSize()
      // Reset drops on resize
      bloodDrops.forEach(drop => drop.reset())
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
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
