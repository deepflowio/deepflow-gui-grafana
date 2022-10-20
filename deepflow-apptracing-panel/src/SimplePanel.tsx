import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { DataFrame, PanelProps } from '@grafana/data'
import { SimpleOptions } from 'types'
import { DYTable } from 'components/DYTable'
import { Alert } from '@grafana/ui'
import _ from 'lodash'
import { renderTimeBar, addSvg, fitSvgToContainer, TAP_SIDE_OPTIONS_MAP, miniMap } from 'deepflow-vis-js'
import { FlameTooltip } from 'components/FlameTooltip'
import { genServiceId, useDebounce } from 'utils/tools'
import { formatDetailData, tarnsArrayToTableData } from 'utils/tables'

import './SimplePanel.css'

interface Props extends PanelProps<SimpleOptions> {}

let MINIMAP_CONATAINER_CACHE: undefined | HTMLElement = undefined

export const SimplePanel: React.FC<Props> = ({ data, width, height }) => {
  const [errMsg, setErrMsg] = useState('')
  const debouncedWidth = useDebounce(width, 600)
  const debouncedHeight = useDebounce(height, 600)

  const { series, request } = data
  const refIds = useMemo(() => {
    return request?.targets
      ? request.targets.map((target, index) => {
          return {
            value: index,
            label: target.refId
          }
        })
      : []
  }, [request])
  useEffect(() => {
    const isMultiRefIds = refIds.length > 1
    if (isMultiRefIds) {
      setErrMsg('Not support multi query')
    } else {
      setErrMsg('')
    }
  }, [refIds])
  const getDataByFieldName = (series: DataFrame[], fieldName: string) => {
    let result
    try {
      result = series[0].fields
        .find(e => {
          return e.name === fieldName
        })
        ?.values.toArray()[0]
    } catch (error) {
      result = []
    }
    return result
  }
  useEffect(() => {
    if (!series[0]) {
      setFlameData([])
      setServicesData([])
      setDetailData([])
      return
    }
    setFlameData(getDataByFieldName(series, 'tracing'))
    setServicesData(getDataByFieldName(series, 'services'))
    setDetailData(getDataByFieldName(series, 'detailList'))
  }, [series])
  const [selectedServiceRowId, setSelectedServiceRowId] = useState('')
  const [flameContainer, setFlameContainer] = useState<any>(undefined)
  const [flameChart, setFlameChart] = useState<any>(undefined)
  const [detailFilteIds, setDetailFilteIds] = useState<string[]>([])

  const setFlameDetailFilter = useCallback((serviceId: string, chart: any, selfAndParent?: any) => {
    setSelectedServiceRowId(serviceId)
    if (serviceId === '') {
      setDetailFilteIds([])
      chart.bars.forEach((bar: any) => {
        bar.props.blur = false
      })
    } else {
      if (selfAndParent) {
        chart.bars.forEach((bar: any) => {
          bar.props.blur = true
        })
        selfAndParent.self.props.blur = false
        if (selfAndParent.parent !== undefined) {
          selfAndParent.parent.props.blur = false
        }
        setDetailFilteIds(selfAndParent.self.data._ids)
      } else {
        let ids: string[] = []
        chart.bars.forEach((bar: any) => {
          const blurBoolean = genServiceId(bar.data) !== serviceId
          if (!blurBoolean) {
            ids = [...ids, ...(bar.data._ids || [])]
          }
          bar.props.blur = blurBoolean
        })
        setDetailFilteIds(ids)
      }
    }
    chart.renderBars()
  }, [])

  const panelRef = useRef(null)

  const [randomClassName, setRandomClassName] = useState('')
  useEffect(() => {
    const randomString = 'flame' + Math.random().toFixed(9).replace('0.', '')
    setRandomClassName(randomString)
  }, [panelRef])

  useEffect(() => {
    if (!randomClassName || !debouncedWidth || !debouncedHeight) {
      return
    }
    const container = addSvg('.' + randomClassName)
    fitSvgToContainer(container)
    setFlameContainer(container)
  }, [randomClassName, debouncedWidth, debouncedHeight])

  const [mousePos, setMousePos] = useState({
    x: 0,
    y: 0
  })
  const [hoveredBarData, setHoveredBarData] = useState<undefined | {}>(undefined)
  const [flameData, setFlameData] = useState<undefined | {}>(undefined)
  useEffect(() => {
    if (!flameData || !flameContainer) {
      return
    }
    try {
      flameContainer.selectAll('*').remove()

      let handleZoomEvent: any
      const renderResult = renderTimeBar(flameData)(flameContainer, {
        formatBarName: (data: any, type: string) => {
          if (type === 'app' || type === 'process') {
            return `${data._l7_protocol} ${data.request_type || ''} ${data.request_resource || ''}`
          } else {
            return _.get(TAP_SIDE_OPTIONS_MAP, [data.tap_side, 'label'], data.tap_side)
          }
        },
        watchZoomEvent: (event: any) => handleZoomEvent(event)
      })
      renderResult.bars.forEach((bar: any) => {
        bar.container.on('click', (ev: any) => {
          ev.stopPropagation()
          setFlameDetailFilter(genServiceId(bar.data), renderResult, {
            self: bar,
            parent: bar.props.parent
          })
        })
        bar.container.on('mouseenter', (ev: any) => {
          setHoveredBarData({
            ...bar.data,
            _barType: bar.props.type,
            _icon: bar.props.icon,
            _errorIcon: bar.props.errorIcon
          })
        })
        bar.container.on('mousemove', (ev: MouseEvent) => {
          setTimeout(() => {
            setMousePos({
              x: ev.clientX,
              y: ev.clientY
            })
          })
        })
        bar.container.on('mouseleave', () => {
          setHoveredBarData(undefined)
        })
      })
      flameContainer.on('click', () => {
        setFlameDetailFilter('', renderResult)
      })
      setFlameChart(renderResult)

      if (MINIMAP_CONATAINER_CACHE) {
        MINIMAP_CONATAINER_CACHE.remove()
      }
      const _miniMapContainer = addSvg('.' + randomClassName, false)
      _miniMapContainer
        .attr('width', debouncedWidth / 4)
        .attr('height', debouncedHeight / 4)
        .attr('viewBox', `0 0 ${debouncedWidth / 4} ${debouncedHeight / 4}`)
        .style('position', 'absolute')
        .style('bottom', 0)
        .style('left', 2)
      MINIMAP_CONATAINER_CACHE = _miniMapContainer
      let miniRender = miniMap(renderResult.bars, [], _miniMapContainer, flameContainer, renderResult.zoom, {
        nodeType: 'rect',
        scaleType: 'xy'
      })
      miniRender()
      handleZoomEvent = (event: any) => {
        miniRender(event)
      }
    } catch (error) {
      console.log(error)
    }
  }, [flameData, flameContainer, randomClassName, debouncedWidth, debouncedHeight, setFlameDetailFilter, setMousePos])

  const bodyClassName = document.body.className
  const isDark = useMemo(() => {
    return bodyClassName.includes('theme-dark')
  }, [bodyClassName])

  const [servicesData, setServicesData] = useState([])
  const serviceTableData = useMemo(() => {
    return tarnsArrayToTableData(servicesData)
  }, [servicesData])

  const [detailData, setDetailData] = useState([])
  const detailTableData = useMemo(() => {
    if (!Object.keys(detailData)?.length || !detailFilteIds?.length) {
      return {
        columns: [],
        dataSource: []
      }
    }
    const _detailData = detailFilteIds.map((e: any) => {
      return detailData[e]
    })
    const { columns, dataSource } = tarnsArrayToTableData(formatDetailData(_detailData))
    return {
      columns,
      dataSource
    }
  }, [detailData, detailFilteIds])
  const panelWidthHeight = useMemo(() => {
    return {
      width: debouncedWidth,
      height: debouncedHeight
    }
  }, [debouncedWidth, debouncedHeight])

  return (
    <div ref={panelRef} className={`deepflow-panel ${isDark ? 'semi-always-dark' : 'semi-always-light'}`}>
      <div className="content">
        <div className="flame-tables-wrap">
          <div className="flame-wrap">
            <div className="view-title">Flame Graph</div>
            <div className={`flame ${randomClassName}`}></div>
          </div>
          <div className="tables-wrap">
            <div className="service-table-wrap">
              <div className="view-title">Service List</div>
              <div className="service-table">
                <DYTable
                  key={detailTableData.columns?.length ? 'serviceTableWithData' : 'serviceTableWithoutData'}
                  className={'table-wrap'}
                  panelWidthHeight={panelWidthHeight}
                  columns={serviceTableData.columns}
                  dataSource={serviceTableData.dataSource}
                  onRowClick={(item: any) => {
                    const serviceId = genServiceId(item)
                    setFlameDetailFilter(serviceId === selectedServiceRowId ? '' : serviceId, flameChart)
                  }}
                  highLightRow={(item: any) => {
                    return genServiceId(item) === selectedServiceRowId ? { className: 'high-light' } : {}
                  }}
                />
              </div>
            </div>
            <div className="detail-table-wrap">
              <div className="view-title">Request Log</div>
              <div className="detail-table">
                <DYTable
                  key={detailTableData.columns?.length ? 'tableWithData' : 'tableWithoutData'}
                  className={'table-wrap'}
                  panelWidthHeight={panelWidthHeight}
                  columns={detailTableData.columns}
                  dataSource={detailTableData.dataSource}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <FlameTooltip barData={hoveredBarData} mousePos={mousePos}></FlameTooltip>
      {errMsg ? (
        <Alert
          title={errMsg}
          style={{
            position: 'fixed',
            top: '15px',
            right: '15px',
            zIndex: 9999
          }}
          severity="error"
          onRemove={() => setErrMsg('')}
        ></Alert>
      ) : null}
    </div>
  )
}
