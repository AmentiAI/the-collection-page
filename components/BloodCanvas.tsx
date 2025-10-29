'use client'

import { useEffect } from 'react'

export default function BloodCanvas() {
  useEffect(() => {
    const canvas = document.getElementById('bloodCanvas') as HTMLCanvasElement
    if (!canvas) return

    const ctx = canvas.getContext('2d', { 
      alpha: true,
      desynchronized: true,
      willReadFrequently: false,
      powerPreference: 'high-performance'
    }) as CanvasRenderingContext2D | null
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    
    let canvasWidth = window.innerWidth
    let canvasHeight = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    
    const updateCanvasSize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvasWidth = window.innerWidth
      canvasHeight = window.innerHeight
      canvas.width = canvasWidth * dpr
      canvas.height = canvasHeight * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      canvas.style.width = canvasWidth + 'px'
      canvas.style.height = canvasHeight + 'px'
    }

    updateCanvasSize()

    // Realistic blood colors - darker, more viscous
    const bloodColors = {
      darkest: 'rgba(60, 0, 0, 0.95)',
      dark: 'rgba(90, 0, 0, 0.9)',
      medium: 'rgba(140, 0, 0, 0.85)',
      bright: 'rgba(180, 20, 20, 0.75)',
      highlight: 'rgba(220, 40, 40, 0.6)',
      shine: 'rgba(255, 100, 100, 0.4)',
    }
    
    class BloodDrop {
      x: number = 0
      y: number = 0
      speed: number = 2
      size: number = 8
      opacity: number = 0.8
      sway: number = 0
      swaySpeed: number = 0
      trailLength: number = 0
      viscosity: number = 0 // How thick/stringy the trail is
      wobble: number = 0 // Additional organic movement

      constructor() {
        this.reset()
      }

      reset() {
        this.x = Math.random() * canvasWidth
        this.y = -80 - Math.random() * 400
        this.speed = 0.8 + Math.random() * 4.5
        this.size = 5 + Math.random() * 18
        this.opacity = 0.7 + Math.random() * 0.3
        this.sway = Math.random() * Math.PI * 2
        this.swaySpeed = 0.008 + Math.random() * 0.025
        this.trailLength = 0
        this.viscosity = 0.3 + Math.random() * 0.4
        this.wobble = Math.random() * Math.PI * 2
      }

      update() {
        this.y += this.speed
        // Natural sway with organic wobble
        this.sway += this.swaySpeed
        this.wobble += 0.02
        const swayAmount = Math.sin(this.sway) * 0.4 + Math.sin(this.wobble * 0.5) * 0.15
        this.x += swayAmount
        // Build up trail over time
        this.trailLength = Math.min(this.trailLength + this.speed * 0.5, this.size * 2.5)
        
        if (this.y > canvasHeight + 80) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        
        const radius = this.size * 0.35
        const height = this.size * 1.3
        
        ctx.save()
        
        // Wall stain/trail above drop - more realistic vertical streaks
        if (this.trailLength > 4 && this.y > 0) {
          const trailHeight = Math.min(this.trailLength, this.y)
          const trailWidth = radius * (0.5 + this.viscosity * 0.3)
          
          // Multiple gradient layers for realistic blood stain
          const trailGradient1 = ctx.createLinearGradient(
            this.x, this.y - trailHeight,
            this.x, this.y
          )
          trailGradient1.addColorStop(0, `rgba(90, 0, 0, 0)`)
          trailGradient1.addColorStop(0.2, `rgba(90, 0, 0, ${this.opacity * 0.2})`)
          trailGradient1.addColorStop(0.6, `rgba(140, 0, 0, ${this.opacity * 0.4})`)
          trailGradient1.addColorStop(1, `rgba(140, 0, 0, ${this.opacity * 0.6})`)
          
          // Main trail
          ctx.beginPath()
          const trailVariation = Math.sin(this.wobble) * trailWidth * 0.1
          ctx.moveTo(this.x - trailWidth * 0.35 + trailVariation, this.y - trailHeight)
          ctx.lineTo(this.x + trailWidth * 0.35 + trailVariation, this.y - trailHeight)
          ctx.lineTo(this.x + trailWidth * 0.4, this.y)
          ctx.lineTo(this.x - trailWidth * 0.4, this.y)
          ctx.closePath()
          ctx.fillStyle = trailGradient1
          ctx.fill()
          
          // Inner darker core of trail
          if (trailHeight > 10) {
            const coreGradient = ctx.createLinearGradient(
              this.x, this.y - trailHeight * 0.5,
              this.x, this.y
            )
            coreGradient.addColorStop(0, `rgba(60, 0, 0, ${this.opacity * 0.3})`)
            coreGradient.addColorStop(1, `rgba(90, 0, 0, ${this.opacity * 0.5})`)
            
            ctx.beginPath()
            ctx.moveTo(this.x - trailWidth * 0.2, this.y - trailHeight * 0.5)
            ctx.lineTo(this.x + trailWidth * 0.2, this.y - trailHeight * 0.5)
            ctx.lineTo(this.x + trailWidth * 0.25, this.y)
            ctx.lineTo(this.x - trailWidth * 0.25, this.y)
            ctx.closePath()
            ctx.fillStyle = coreGradient
            ctx.fill()
          }
        }
        
        // Main teardrop body - more realistic viscous blood drop
        ctx.beginPath()
        // Top point (more pointy)
        ctx.moveTo(this.x, this.y)
        // Left curve (more pronounced bulge)
        ctx.bezierCurveTo(
          this.x - radius * 0.45, this.y + height * 0.25,
          this.x - radius * 0.7, this.y + height * 0.65,
          this.x - radius * 0.38, this.y + height
        )
        // Bottom curve (more rounded, heavier)
        ctx.arc(this.x, this.y + height, radius * 0.38, Math.PI, 0, false)
        // Right curve
        ctx.bezierCurveTo(
          this.x + radius * 0.7, this.y + height * 0.65,
          this.x + radius * 0.45, this.y + height * 0.25,
          this.x, this.y
        )
        ctx.closePath()
        
        // Multi-layer gradient for depth
        const dropGradient = ctx.createLinearGradient(
          this.x - radius * 0.3, this.y,
          this.x + radius * 0.3, this.y + height
        )
        dropGradient.addColorStop(0, bloodColors.medium)
        dropGradient.addColorStop(0.3, bloodColors.dark)
        dropGradient.addColorStop(0.7, bloodColors.darkest)
        dropGradient.addColorStop(1, bloodColors.darkest)
        ctx.fillStyle = dropGradient
        ctx.fill()
        
        // Strong highlight on top-left (light source)
        ctx.beginPath()
        const highlightRadius = radius * 0.25
        ctx.ellipse(
          this.x - radius * 0.25, 
          this.y + height * 0.2, 
          highlightRadius * 0.8, 
          highlightRadius * 1.2, 
          -0.25, 
          0, 
          Math.PI * 2
        )
        ctx.fillStyle = bloodColors.highlight
        ctx.fill()
        
        // Subtle shine spot
        ctx.beginPath()
        ctx.arc(this.x - radius * 0.3, this.y + height * 0.15, highlightRadius * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = bloodColors.shine
        ctx.fill()
        
        // Dark shadow at bottom (thicker, more realistic)
        ctx.beginPath()
        ctx.ellipse(
          this.x, 
          this.y + height, 
          radius * 0.4, 
          radius * 0.2, 
          0, 
          0, 
          Math.PI * 2
        )
        ctx.fillStyle = bloodColors.darkest
        ctx.fill()
        
        // Edge darkening for depth
        ctx.strokeStyle = `rgba(60, 0, 0, ${this.opacity * 0.8})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.bezierCurveTo(
          this.x - radius * 0.45, this.y + height * 0.25,
          this.x - radius * 0.7, this.y + height * 0.65,
          this.x - radius * 0.38, this.y + height
        )
        ctx.stroke()
        
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.bezierCurveTo(
          this.x + radius * 0.45, this.y + height * 0.25,
          this.x + radius * 0.7, this.y + height * 0.65,
          this.x + radius * 0.38, this.y + height
        )
        ctx.stroke()
        
        ctx.restore()
      }
    }

    // Increased for more blood
    const maxDrops = 120
    const bloodDrops: BloodDrop[] = []

    for (let i = 0; i < maxDrops; i++) {
      bloodDrops.push(new BloodDrop())
      bloodDrops[i].y = -80 - (i * (canvasHeight / maxDrops + 15))
    }

    let animationFrameId: number
    let isRunning = true
    let lastTime = 0
    const targetFPS = 55
    const frameInterval = 1000 / targetFPS

    const animate = (currentTime: number) => {
      if (!ctx || !isRunning) return
      
      const deltaTime = currentTime - lastTime
      
      if (deltaTime >= frameInterval) {
        lastTime = currentTime - (deltaTime % frameInterval)
        
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)

        for (let i = 0; i < bloodDrops.length; i++) {
          const drop = bloodDrops[i]
          drop.update()
          
          if (drop.y > -60 && drop.y < canvasHeight + 60 && drop.x > -40 && drop.x < canvasWidth + 40) {
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
      }, 200)
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
      className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-90 z-0"
      style={{ transform: 'none' }}
    />
  )
}
