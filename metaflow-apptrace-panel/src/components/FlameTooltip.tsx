import _ from 'lodash'
import React, { useMemo } from 'react'

interface Props {
  barData: {} | undefined
  mousePos: {
    x: number
    y: number
  }
}

const SHOW_FIELDS = [
  'tap_side',
  'resource_gl0',
  'process_kname',
  'l7_protocol',
  'request_type',
  'request_resource',
  'duration',
  'response_status'
]

export const FlameTooltip: React.FC<Props> = ({ barData, mousePos }) => {
  const pos = useMemo(() => {
    const { x, y } = mousePos
    return {
      left: x + 10 + 'px',
      top: y + 10 + 'px'
    }
  }, [mousePos])

  const content: {
    [P in string]: string
  } = useMemo(() => {
    if (!barData) {
      return {}
    }
    return _.pick(barData, SHOW_FIELDS)
  }, [barData])

  return (
    <div
      className="flame-tooltip"
      style={{
        display: Object.keys(content).length > 0 ? '' : 'none',
        left: pos.left,
        top: pos.top
      }}
    >
      <div className="labels-wrap">
        {Object.keys(content).map((key: string, index: number) => {
          return <p key={index}>{key}:</p>
        })}
      </div>
      <div className="values-wrap">
        {Object.keys(content).map((key: any, index: number) => {
          const val = content[key] || ' '
          return <p key={index}>{val}</p>
        })}
      </div>
    </div>
  )
}
