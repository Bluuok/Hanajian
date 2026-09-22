import React from 'react'
import portrait from '../../assets/illustrations/companion-gaze.png'
import { mountGaze } from './gazeRenderer'

export function GazeCompanion(): React.ReactElement {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const photo = React.useRef<HTMLImageElement>(null)
  const [state, setState] = React.useState<'loading' | 'ready' | 'fallback'>('loading')
  const [generation, setGeneration] = React.useState(0)

  React.useEffect(() => {
    if (!canvas.current || !photo.current) return
    return mountGaze(
      canvas.current,
      photo.current,
      () => setState('ready'),
      () => setState('fallback'),
      () => setGeneration((value) => value + 1)
    )
  }, [generation])

  return (
    <div
      className="app-companion-dock"
      data-state={state}
      title={
        state === 'fallback' ? '互动暂不可用，当前显示原图' : '花笺记录员 · 眼睛与头部跟随鼠标'
      }
    >
      <img ref={photo} src={portrait} alt="抱着笔记本的花笺记录员" />
      <canvas ref={canvas} aria-hidden="true" />
    </div>
  )
}
