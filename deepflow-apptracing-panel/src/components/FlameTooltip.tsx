import _ from 'lodash'
import React, { useMemo } from 'react'
import ReactDOM from 'react-dom'
import { formatUsUnit } from '../utils/tools'
import './FlameTooltip.css'

interface Props {
  barData: {} | undefined
  mousePos: {
    x: number
    y: number
  }
}

const getTooltipSpanContent = (data: any) => {
  if (data._barType === 'network') {
    const tapPortName = data.tap_port_name ? `(${data.tap_port_name})` : ''
    return `${data.tap_port} ${tapPortName} ${data.resource_from_vtap}`
  } else if (data._barType === 'process') {
    return `${data.process_kname} ${data.resource_gl0}`
  } else {
    return `${data.service_instance_id} ${data.service_name}`
  }
}

const TOOLTIP_SPAN_TYPE_MAP = {
  process: '系统',
  app: '应用',
  network: '网络'
}

export const FlameTooltip: React.FC<Props> = ({ barData, mousePos }) => {
  const pos = useMemo(() => {
    const { x, y } = mousePos
    return {
      left: x + 10 + 'px',
      top: y + 10 + 'px'
    }
  }, [mousePos])

  const content: {
    [P in string]: any
  } = useMemo(() => {
    if (!barData) {
      return {}
    }
    return barData
  }, [barData])

  const getHeaderBg = (response_status: number) => {
    const RESPONSE_STATUS_STYLE_OPTIONS = {
      0: '#91a6b7',
      3: 'rgb(245, 108, 108)',
      4: 'rgb(230, 162, 60)'
    }
    return _.get(RESPONSE_STATUS_STYLE_OPTIONS, [response_status], '')
  }

  return ReactDOM.createPortal(
    <div
      className="flame-tooltip"
      style={{
        display: Object.keys(content).length > 0 ? '' : 'none',
        left: pos.left,
        top: pos.top
      }}
    >
      <p style={{ background: `${getHeaderBg(content.response_status)}` }}>
        <img className="icon" src={content._icon} />
        {content._errorIcon ? <img className="error-icon" src={content._errorIcon} /> : null}
        <span>
          {_.get(TOOLTIP_SPAN_TYPE_MAP, [content._barType])
            ? ' ' + _.get(TOOLTIP_SPAN_TYPE_MAP, [content._barType])
            : ''}
        </span>
        <span>{content.tap_side ? ' ' + content.tap_side : ''}</span>
      </p>
      <p>
        {content._l7_protocol ? content._l7_protocol + ' ' : ''}
        {content.request_type ? content.request_type + ' ' : ''}
        {content.request_resource}
      </p>
      <p>{getTooltipSpanContent(content)}</p>
      <p>
        {formatUsUnit(content.duration)}
        {` ( ${formatUsUnit(content.selftime)} of self time )`}
      </p>
    </div>,
    document.body
  )
}
