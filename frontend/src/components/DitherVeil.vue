<template>
  <div ref="container" class="dither-veil" aria-hidden="true"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl'

const DEFAULT_SRC =
  'https://images.unsplash.com/photo-1737071371043-761e02b1ef95?q=80&w=1400&auto=format&fit=crop'

const props = defineProps({
  src: { type: String, default: DEFAULT_SRC },
  fit: { type: String, default: 'contain' },
  pattern: { type: String, default: 'floyd' },
  pixelSize: { type: Number, default: 2 },
  levels: { type: Number, default: 2 },
  inkColor: { type: String, default: '#120f17' },
  paperColor: { type: String, default: '#f4f1ea' },
  contrast: { type: Number, default: 1.15 },
  brightness: { type: Number, default: 0 },
  revealRadius: { type: Number, default: 200 },
  softness: { type: Number, default: 0.6 },
  linger: { type: Number, default: 1 },
  clickBurst: { type: Boolean, default: true }
})

const container = ref(null)
let cleanup = () => {}

const hexToRgb = value => {
  let hex = String(value || '').replace('#', '')
  if (hex.length === 3) hex = hex.replace(/./g, character => character + character)
  const number = Number.parseInt(hex.slice(0, 6), 16)
  return Number.isNaN(number)
    ? [0, 0, 0]
    : [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255]
}

const fitScale = (width, height, imageWidth, imageHeight, contain) => {
  const ratio = width / height / (imageWidth / imageHeight)
  if (contain) return ratio > 1 ? [ratio, 1] : [1, 1 / ratio]
  return ratio > 1 ? [1, 1 / ratio] : [ratio, 1]
}

const diffuse = (pixels, columns, rows, levels, contrast, brightness) => {
  const values = new Float32Array(columns * rows)
  for (let index = 0; index < columns * rows; index++) {
    const r = pixels[index * 4] / 255
    const g = pixels[index * 4 + 1] / 255
    const b = pixels[index * 4 + 2] / 255
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    values[index] = Math.pow(
      Math.min(1, Math.max(0, (luminance - 0.5) * contrast + 0.5 + brightness)),
      1.6
    )
  }

  const output = new Uint8Array(columns * rows * 4)
  const steps = Math.max(1, Math.round(levels) - 1)
  const distribute = [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16]
  ]

  for (let y = 0; y < rows; y++) {
    const direction = y % 2 ? -1 : 1
    for (let column = 0; column < columns; column++) {
      const x = direction > 0 ? column : columns - 1 - column
      const index = y * columns + x
      const previous = values[index]
      const quantized = Math.min(steps, Math.max(0, Math.round(previous * steps))) / steps
      const error = previous - quantized
      const byte = Math.round(quantized * 255)
      output[index * 4] = byte
      output[index * 4 + 1] = byte
      output[index * 4 + 2] = byte
      output[index * 4 + 3] = 255
      for (const [offsetX, offsetY, factor] of distribute) {
        const nextX = x + offsetX * direction
        const nextY = y + offsetY
        if (nextX >= 0 && nextX < columns && nextY < rows) {
          values[nextY * columns + nextX] += error * factor
        }
      }
    }
  }
  return output
}

const vertex = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tImage;
uniform sampler2D tDither;
uniform vec2 uGrid;
uniform vec2 uCover;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec2 uPointer;
uniform vec2 uSize;
uniform float uRadius;
uniform float uSoftness;
uniform float uActive;
uniform float uBurstStart;
uniform vec2 uBurstPoint;
uniform float uTime;

vec2 imageUv(vec2 uv) {
  return (uv - 0.5) * uCover + 0.5;
}

float inside(vec2 uv) {
  vec2 check = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return check.x * check.y;
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec2 ditherUv = (cell + 0.5) / uGrid;
  float level = texture2D(tDither, ditherUv).r;
  vec3 dither = mix(uInk, uPaper, level);

  vec2 photoUv = imageUv(vUv);
  vec3 photo = texture2D(tImage, photoUv).rgb;
  float isPhoto = inside(photoUv);

  vec2 point = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float distanceToPointer = length(point - uPointer);
  float edge = max(1.0, uRadius * max(0.08, uSoftness));
  float reveal = (1.0 - smoothstep(uRadius - edge, uRadius, distanceToPointer)) * uActive;

  float burstAge = uTime - uBurstStart;
  if (burstAge >= 0.0 && burstAge < 1.15) {
    float reach = max(uSize.x, uSize.y) * burstAge / 1.15;
    float ring = 1.0 - smoothstep(0.0, max(18.0, uRadius * 0.45), abs(length(point - uBurstPoint) - reach));
    reveal = max(reveal, ring * (1.0 - burstAge / 1.15));
  }
  gl_FragColor = vec4(mix(dither, photo, reveal * isPhoto), 1.0);
}`

const mountVeil = () => {
  const host = container.value
  if (!host) return

  const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false, antialias: false })
  const gl = renderer.gl
  const canvas = gl.canvas
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  host.appendChild(canvas)

  const imageTexture = new Texture(gl, { generateMipmaps: true, minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.LINEAR })
  const ditherTexture = new Texture(gl, {
    image: new Uint8Array([255, 255, 255, 255]),
    width: 1,
    height: 1,
    generateMipmaps: false,
    minFilter: gl.NEAREST,
    magFilter: gl.NEAREST
  })
  const uniforms = {
    tImage: { value: imageTexture },
    tDither: { value: ditherTexture },
    uGrid: { value: [1, 1] },
    uCover: { value: [1, 1] },
    uInk: { value: hexToRgb(props.inkColor) },
    uPaper: { value: hexToRgb(props.paperColor) },
    uPointer: { value: [0, 0] },
    uSize: { value: [1, 1] },
    uRadius: { value: props.revealRadius },
    uSoftness: { value: props.softness },
    uActive: { value: 0 },
    uBurstStart: { value: -2 },
    uBurstPoint: { value: [0, 0] },
    uTime: { value: 0 }
  }
  const mesh = new Mesh(gl, {
    geometry: new Triangle(gl),
    program: new Program(gl, { vertex, fragment, uniforms, depthTest: false, depthWrite: false })
  })

  const sampler = document.createElement('canvas')
  const context = sampler.getContext('2d', { willReadFrequently: true })
  let image
  let width = 1
  let height = 1
  let active = false
  let animation = 0
  let lastPointerTime = 0

  const drawDither = () => {
    if (!image || !context) return
    const cell = Math.max(1, Math.round(props.pixelSize * renderer.dpr))
    const columns = Math.max(1, Math.ceil(canvas.width / cell))
    const rows = Math.max(1, Math.ceil(canvas.height / cell))
    sampler.width = columns
    sampler.height = rows
    context.fillStyle = props.paperColor
    context.fillRect(0, 0, columns, rows)
    const scale = props.fit === 'contain'
      ? Math.min(columns / image.naturalWidth, rows / image.naturalHeight)
      : Math.max(columns / image.naturalWidth, rows / image.naturalHeight)
    const drawnWidth = image.naturalWidth * scale
    const drawnHeight = image.naturalHeight * scale
    context.drawImage(image, (columns - drawnWidth) / 2, (rows - drawnHeight) / 2, drawnWidth, drawnHeight)
    try {
      ditherTexture.image = diffuse(
        context.getImageData(0, 0, columns, rows).data,
        columns,
        rows,
        props.levels,
        props.contrast,
        props.brightness
      )
      ditherTexture.width = columns
      ditherTexture.height = rows
      ditherTexture.needsUpdate = true
      uniforms.uGrid.value = [columns, rows]
    } catch {
      // A remote image without CORS headers can still render in colour; it just cannot be read for dithering.
    }
  }

  const layout = () => {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    renderer.setSize(width, height)
    uniforms.uSize.value = [width, height]
    if (image) {
      uniforms.uCover.value = fitScale(canvas.width, canvas.height, image.naturalWidth, image.naturalHeight, props.fit === 'contain')
      drawDither()
    }
  }

  const render = time => {
    const now = time / 1000
    const elapsed = performance.now() - lastPointerTime
    uniforms.uTime.value = now
    uniforms.uActive.value += ((active ? 1 : 0) - uniforms.uActive.value) * 0.16
    if (!active && elapsed > props.linger * 1000) uniforms.uActive.value *= 0.88
    renderer.render({ scene: mesh })
    animation = requestAnimationFrame(render)
  }

  const locate = event => {
    const bounds = host.getBoundingClientRect()
    const within = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
    active = within
    if (!within) return
    uniforms.uPointer.value = [event.clientX - bounds.left, event.clientY - bounds.top]
    lastPointerTime = performance.now()
  }
  const onPointerMove = event => locate(event)
  const onPointerDown = event => {
    locate(event)
    if (props.clickBurst && active) {
      uniforms.uBurstPoint.value = [...uniforms.uPointer.value]
      uniforms.uBurstStart.value = performance.now() / 1000
    }
  }
  const onPointerLeave = event => {
    const bounds = host.getBoundingClientRect()
    active = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
  }
  const observer = new ResizeObserver(layout)
  observer.observe(host)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerleave', onPointerLeave, { passive: true })

  const loadedImage = new Image()
  loadedImage.crossOrigin = 'anonymous'
  loadedImage.decoding = 'async'
  loadedImage.onload = () => {
    image = loadedImage
    imageTexture.image = loadedImage
    imageTexture.needsUpdate = true
    layout()
  }
  loadedImage.src = props.src
  layout()
  animation = requestAnimationFrame(render)

  cleanup = () => {
    cancelAnimationFrame(animation)
    observer.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointerleave', onPointerLeave)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    canvas.remove()
  }
}

onMounted(mountVeil)
onBeforeUnmount(() => cleanup())

watch(
  () => props.src,
  () => {
    cleanup()
    mountVeil()
  }
)
</script>

<style scoped>
.dither-veil {
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: pan-y;
}
</style>
