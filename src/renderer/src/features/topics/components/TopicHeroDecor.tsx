import React from 'react'
import petalsSvg from '../../../assets/decor/petals.svg'
import starsSvg from '../../../assets/decor/stars.svg'
import leavesSvg from '../../../assets/decor/leaves.svg'
import paperclipSvg from '../../../assets/decor/paperclip.svg'

export function TopicHeroDecor(): React.ReactElement {
  return (
    <div className="topics-hero-decor" aria-hidden="true">
      <img className="decor-item decor-petals" src={petalsSvg} alt="" aria-hidden="true" />
      <img className="decor-item decor-stars" src={starsSvg} alt="" aria-hidden="true" />
      <img className="decor-item decor-leaves" src={leavesSvg} alt="" aria-hidden="true" />
      <img className="decor-item decor-paperclip" src={paperclipSvg} alt="" aria-hidden="true" />
    </div>
  )
}
