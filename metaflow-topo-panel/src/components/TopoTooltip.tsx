import _ from 'lodash'
import React, { useMemo } from 'react'

interface Props {
  contentData: Record<any, any>
  mousePos: {
    x: number
    y: number
  }
}

export const TopoTooltip: React.FC<Props> = ({ contentData, mousePos }) => {
  const pos = useMemo(() => {
    const { x, y } = mousePos
    return {
      left: x + 10 + 'px',
      top: y + 10 + 'px'
    }
  }, [mousePos])

  return (
    <div
      className="topo-tooltip"
      style={{
        display: Object.keys(contentData).length > 0 ? '' : 'none',
        left: pos.left,
        top: pos.top
      }}
    >
      <div className="labels-wrap">
        {Object.keys(contentData).map((key: string, index: number) => {
          return <p key={index}>{key}:</p>
        })}
      </div>
      <div className="values-wrap">
        {Object.keys(contentData).map((key: any, index: number) => {
          const val = typeof contentData[key] !== 'undefined' ? contentData[key] : ' '
          return <p key={index}>{val}</p>
        })}
      </div>
    </div>
  )
}
