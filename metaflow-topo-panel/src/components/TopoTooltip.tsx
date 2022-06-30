import _ from 'lodash'
import React, { useMemo } from 'react'

interface Props {
  contentData: {
    [P in string]: string
  }
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
        display: Object.keys(contentData).length > 0 ? 'block' : 'none',
        left: pos.left,
        top: pos.top
      }}
    >
      {Object.keys(contentData).map((key: string, index: number) => {
        return (
          <p key={index}>
            <span>{key}:</span>
            <span>{contentData[key]}</span>
          </p>
        )
      })}
    </div>
  )
}
