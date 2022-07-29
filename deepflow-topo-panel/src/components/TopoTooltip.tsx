import _ from 'lodash'
import React, { useMemo } from 'react'
import ReactDOM from 'react-dom'

import './TopoTooltip.css'

interface Props {
  contentData: Record<any, any> | Array<Record<any, any>>
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

  return ReactDOM.createPortal(
    <div
      className="topo-tooltip"
      style={{
        display: Object.keys(contentData).length > 0 ? '' : 'none',
        left: pos.left,
        top: pos.top
      }}
    >
      {Array.isArray(contentData) ? (
        <>
          <div className="labels-wrap">
            {contentData
              .map((d: any, i: number) => {
                return Object.keys(d).map((key: string, index: number) => {
                  return (
                    <p
                      key={index}
                      style={{
                        borderTop: i > 0 && index === 0 ? '1px solid #fff' : ''
                      }}
                    >
                      {key}:
                    </p>
                  )
                })
              })
              .flat()}
          </div>
          <div className="values-wrap">
            {contentData
              .map((d: any, i: number) => {
                return Object.keys(d).map((key: string, index: number) => {
                  const val = typeof d[key] !== 'undefined' ? d[key] : ' '
                  return (
                    <p
                      key={index}
                      style={{
                        borderTop: i > 0 && index === 0 ? '1px solid #fff' : ''
                      }}
                    >
                      {val}
                    </p>
                  )
                })
              })
              .flat()}
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>,
    document.body
  )
}
