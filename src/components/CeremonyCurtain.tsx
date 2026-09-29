type CeremonyCurtainProps = {
  mode: 'opening' | 'closing'
  onComplete?: () => void
}

export function CeremonyCurtain({ mode, onComplete }: CeremonyCurtainProps) {
  return <div className={`ceremony-curtain ceremony-curtain--${mode}`} aria-hidden="true">
    <div className="ceremony-curtain__spotlights"><i/><i/></div>
    <div className="ceremony-curtain__panel ceremony-curtain__panel--left" onAnimationEnd={event => {
      if (mode === 'closing' && event.animationName === 'curtain-close-left') onComplete?.()
    }}/>
    <div className="ceremony-curtain__panel ceremony-curtain__panel--right"/>
    <div className="ceremony-curtain__floor-light"/>
  </div>
}
