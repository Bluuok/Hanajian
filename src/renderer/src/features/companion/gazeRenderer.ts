import { fragmentShader, vertexShader } from './shaders'
import silhouetteUrl from '../../assets/illustrations/companion-silhouette.svg'

// Adapted from the user's approved Huajian-Gaze.html. The image warp is unchanged;
// the app owns scheduling, whole-window input, accessibility and resource disposal.
export function mountGaze(
  canvas: HTMLCanvasElement,
  photo: HTMLImageElement,
  onReady: () => void,
  onFailure: () => void,
  onRestore: () => void
): () => void {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false
  })
  if (!gl) {
    onFailure()
    return () => {}
  }
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let texture: WebGLTexture | null = null
  let silhouetteTexture: WebGLTexture | null = null
  const silhouette = new Image()
  let frame = 0
  let last = 0
  let ready = false
  let disposed = false
  let focused = true
  let current = [0, 0]
  let target = [0, 0]
  let gaze: WebGLUniformLocation | null = null
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

  const release = (): void => {
    if (texture) gl.deleteTexture(texture)
    if (silhouetteTexture) gl.deleteTexture(silhouetteTexture)
    if (buffer) gl.deleteBuffer(buffer)
    if (program) gl.deleteProgram(program)
    shaders.forEach((shader) => gl.deleteShader(shader))
  }
  const stop = (): void => {
    cancelAnimationFrame(frame)
    frame = 0
    last = 0
  }
  const draw = (): void => {
    if (!ready || disposed) return
    gl.uniform2f(gaze, current[0], current[1])
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  const tick = (time: number): void => {
    frame = 0
    if (!ready || disposed || document.hidden) return
    const dt = last ? Math.min((time - last) / 1000, 0.05) : 1 / 60
    last = time
    const smoothing = 1 - Math.exp(-dt * 10)
    current = current.map((value, index) => value + (target[index] - value) * smoothing)
    const moving = current.some((value, index) => Math.abs(target[index] - value) > 0.001)
    if (!moving) current = [...target]
    draw()
    if (moving) frame = requestAnimationFrame(tick)
    else last = 0
  }
  const schedule = (): void => {
    if (ready && !disposed && !document.hidden && !frame) frame = requestAnimationFrame(tick)
  }
  const center = (): void => {
    target = [0, 0]
    schedule()
  }
  const aim = (event: PointerEvent): void => {
    if (reduced.matches || !focused) return
    // Use the app viewport, not this small dock, so the range remains controllable.
    target = [
      Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1)),
      Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1))
    ]
    schedule()
  }
  const blur = (): void => {
    focused = false
    center()
  }
  const focus = (): void => {
    focused = true
  }
  const visibility = (): void => {
    stop()
    target = [0, 0]
    current = [0, 0]
    if (!document.hidden) draw()
  }
  const motionChange = (): void => {
    stop()
    target = [0, 0]
    current = [0, 0]
    draw()
  }
  const resize = (): void => {
    if (!ready || disposed) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    gl.viewport(0, 0, canvas.width, canvas.height)
    draw()
  }
  const contextLost = (event: Event): void => {
    event.preventDefault()
    ready = false
    stop()
    onFailure()
  }
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Cannot create companion shader')
    shaders.push(shader)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Cannot compile companion shader')
    }
    return shader
  }
  const init = (): void => {
    if (disposed || ready || !photo.naturalWidth || !silhouette.naturalWidth) return
    try {
      program = gl.createProgram()
      if (!program) throw new Error('Cannot create companion program')
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error('Cannot link companion program')
      }
      gl.useProgram(program)
      buffer = gl.createBuffer()
      texture = gl.createTexture()
      if (!buffer || !texture) throw new Error('Cannot allocate companion resources')
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      const position = gl.getAttribLocation(program, 'position')
      gl.enableVertexAttribArray(position)
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo)
      gl.uniform1i(gl.getUniformLocation(program, 'photo'), 0)
      silhouetteTexture = gl.createTexture()
      if (!silhouetteTexture) throw new Error('Cannot allocate companion silhouette')
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, silhouetteTexture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, silhouette)
      gl.uniform1i(gl.getUniformLocation(program, 'silhouette'), 1)
      gl.activeTexture(gl.TEXTURE0)
      gl.uniform1f(gl.getUniformLocation(program, 'strength'), 0.85)
      gaze = gl.getUniformLocation(program, 'gaze')
      ready = true
      resize()
      onReady()
    } catch {
      ready = false
      stop()
      onFailure()
    }
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  photo.addEventListener('load', init)
  photo.addEventListener('error', onFailure)
  silhouette.addEventListener('load', init)
  silhouette.addEventListener('error', onFailure)
  silhouette.src = silhouetteUrl
  canvas.addEventListener('webglcontextlost', contextLost)
  canvas.addEventListener('webglcontextrestored', onRestore)
  document.addEventListener('pointermove', aim, { passive: true })
  document.documentElement.addEventListener('pointerleave', center)
  window.addEventListener('blur', blur)
  window.addEventListener('focus', focus)
  document.addEventListener('visibilitychange', visibility)
  reduced.addEventListener('change', motionChange)
  if (photo.complete && photo.naturalWidth) init()
  return () => {
    disposed = true
    ready = false
    stop()
    observer.disconnect()
    photo.removeEventListener('load', init)
    photo.removeEventListener('error', onFailure)
    silhouette.removeEventListener('load', init)
    silhouette.removeEventListener('error', onFailure)
    canvas.removeEventListener('webglcontextlost', contextLost)
    canvas.removeEventListener('webglcontextrestored', onRestore)
    document.removeEventListener('pointermove', aim)
    document.documentElement.removeEventListener('pointerleave', center)
    window.removeEventListener('blur', blur)
    window.removeEventListener('focus', focus)
    document.removeEventListener('visibilitychange', visibility)
    reduced.removeEventListener('change', motionChange)
    release()
  }
}
