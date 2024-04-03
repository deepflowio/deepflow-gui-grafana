/* eslint-disable no-console */
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { DataSourceInstanceSettings, PanelProps } from '@grafana/data'
import { SimpleOptions } from 'types'
import { DYTable } from 'components/DYTable'
import { Alert } from '@grafana/ui'
import _ from 'lodash'
import { renderTimeBar, addSvg, fitSvgToContainer, miniMap } from 'deepflow-vis-js'
import { FlameTooltip } from 'components/FlameTooltip'
import { formatDetailList, genServiceId, getDataByFieldName, getRelatedData, useDebounce } from 'utils/tools'
import {
  ACTION_ROW_VAL,
  formatDetailData,
  formatRelatedExtraData,
  formatRelatedData,
  tarnsArrayToTableData,
  tarnsRelatedDataToTableData
} from 'utils/tables'
import { getDataSourceSrv } from '@grafana/runtime'

import './SimplePanel.css'
import { Button } from '@douyinfe/semi-ui'
import { IconArrowLeft } from '@douyinfe/semi-icons'
import { AskGPT } from 'components/AskGPT'

interface Props extends PanelProps<SimpleOptions> {}

const MINIMAP_CONTAINER_CACHE: Record<number, HTMLElement> = {}

export const SimplePanel: React.FC<Props> = ({ id, data, width, height }) => {
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
  useEffect(() => {
    if (!series[0]) {
      setFlameData([])
      setServicesData([])
      setDetailData([])
      return
    }
    setFlameData(getDataByFieldName(series, 'tracing'))
    setServicesData(getDataByFieldName(series, 'services'))
    setDetailData(formatDetailList(getDataByFieldName(series, 'detailList'), series[0]?.meta?.custom))
  }, [series])
  const [selectedServiceRowId, setSelectedServiceRowId] = useState('')
  const [flameContainer, setFlameContainer] = useState<any>(undefined)
  const [flameChart, setFlameChart] = useState<any>(undefined)
  const [detailFilterIds, setDetailFilterIds] = useState<string[]>([])
  const [relatedResource, setRelatedResource] = useState<Record<any, any>>({})

  const setFlameDetailFilter = useCallback((serviceId: string, chart: any, selfAndParent?: any) => {
    setSelectedServiceRowId(serviceId)
    if (serviceId === '') {
      setDetailFilterIds([])
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
        setDetailFilterIds(selfAndParent.self.data._ids)
      } else {
        let ids: string[] = []
        chart.bars.forEach((bar: any) => {
          const blurBoolean = genServiceId(bar.data) !== serviceId
          if (!blurBoolean) {
            ids = [...ids, ...(bar.data._ids || [])]
          }
          bar.props.blur = blurBoolean
        })
        setDetailFilterIds(ids)
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
  const [flameData, setFlameData] = useState<undefined | []>(undefined)
  useEffect(() => {
    if (flameContainer) {
      flameContainer.selectAll('*').remove()
    }

    if (MINIMAP_CONTAINER_CACHE[id]) {
      MINIMAP_CONTAINER_CACHE[id].remove()
    }
    if (!flameData || !flameData?.length || !flameContainer) {
      return
    }
    window.useTimeLogs && console.time('[Time Log][Apptracing: Render]')
    try {
      let handleZoomEvent: any
      const renderResult = renderTimeBar(flameData)(flameContainer, {
        formatBarName: (data: any, type: string) => {
          // TODO
          if ('tap_port' in data && !('capture_nic' in data)) {
            data.capture_nic = data.tap_port
            data.capture_nic_name = data.tap_port_name
            data.capture_network_type = data.tap
            data.capture_network_type_id = data.tap_id
            data.observation_point = data.tap_side
          }
          data['Enum(observation_point)'] = data['Enum(tap_side)']
          if (type === 'network') {
            if (data.capture_network_type_id === 3) {
              return `${data['Enum(observation_point)']} ${data.auto_instance} ${data.capture_nic_name}`
            } else {
              return data.capture_network_type
            }
          } else {
            let l7_protocol
            if ([0, 1].includes(data.l7_protocol)) {
              l7_protocol = data.l7_protocol_str || ''
            } else {
              l7_protocol = data['Enum(l7_protocol)'] ?? ''
            }
            let request_detail
            if (!data.request_resource) {
              request_detail = ` ${data.endpoint || ''}`
            } else {
              request_detail = `${data.request_type || ''}  ${data.request_resource || ''}`
            }
            return `${l7_protocol} ${request_detail}`
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
          setRelatedResource(bar.data)
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
        setRelatedResource({})
      })
      setFlameChart(renderResult)
      const _miniMapContainer = addSvg('.' + randomClassName, false)
      _miniMapContainer
        .attr('width', debouncedWidth / 4)
        .attr('height', debouncedHeight / 4)
        .attr('viewBox', `0 0 ${debouncedWidth / 4} ${debouncedHeight / 4}`)
        .style('position', 'absolute')
        .style('bottom', 0)
        .style('left', 2)
      MINIMAP_CONTAINER_CACHE[id] = _miniMapContainer
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
    window.useTimeLogs && console.timeEnd('[Time Log][Apptracing: Render]')
  }, [
    id,
    flameData,
    flameContainer,
    randomClassName,
    debouncedWidth,
    debouncedHeight,
    setFlameDetailFilter,
    setMousePos
  ])

  const bodyClassName = document.body.className
  const isDark = useMemo(() => {
    return bodyClassName.includes('theme-dark')
  }, [bodyClassName])

  const [servicesData, setServicesData] = useState([])
  const serviceTableData = useMemo(() => {
    return tarnsArrayToTableData(servicesData)
  }, [servicesData])

  const [relatedViewIndex, setRelatedViewIndex] = useState(0)
  const [detailData, setDetailData] = useState([])
  const detailTableData = useMemo(() => {
    setRelatedViewIndex(0)
    if ((detailData && !Object.keys(detailData)?.length) || !detailFilterIds?.length) {
      return {
        columns: [],
        dataSource: []
      }
    }
    const _detailData = detailFilterIds.map((e: any) => {
      return detailData[e]
    })
    const { columns, dataSource } = tarnsArrayToTableData(formatDetailData(_detailData))
    return {
      columns,
      dataSource
    }
  }, [detailData, detailFilterIds, setRelatedViewIndex])
  const panelWidthHeight = useMemo(() => {
    return {
      width: debouncedWidth,
      height: debouncedHeight
    }
  }, [debouncedWidth, debouncedHeight])

  const [relatedExtraData, setRelatedExtraData] = useState([])
  const contentTranslateX = useMemo(() => {
    return {
      transform: `translateX(${relatedViewIndex * -100}%)`
    }
  }, [relatedViewIndex])
  const [relatedTableLoading, setRelatedTableLoading] = useState(false)
  const onDetailBtnClick = useCallback(async (_ids: string[]) => {
    setErrMsg('')
    const deepFlowName = await getDataSourceSrv()
      .getList()
      .find((dataSource: DataSourceInstanceSettings) => {
        return dataSource.type === 'deepflowio-deepflow-datasource'
      })?.name
    const deepFlow = await getDataSourceSrv().get(deepFlowName)
    if (!deepFlow) {
      return
    }
    try {
      setRelatedTableLoading(true)
      // @ts-ignore
      const result = await deepFlow.getFlameRelatedData(_ids)
      if (!result) {
        setErrMsg(result?.data?.DESCRIPTION ? `[SERVER ERROR]:${result?.data?.DESCRIPTION}` : 'No Data')
      } else {
        setRelatedViewIndex(1)
        setRelatedExtraData(result)
      }
    } catch (error: any) {
      const msg = error ? `[SERVER ERROR]:${error?.data?.DESCRIPTION}` : ' Network Error'
      setErrMsg(msg)
    }
    setRelatedTableLoading(false)
  }, [])

  const relatedTableData = useMemo(() => {
    if (!flameData || !Object.keys(flameData)?.length || !Object.keys(relatedResource)?.length) {
      return {
        columns: [],
        dataSource: []
      }
    }
    const relatedData = getRelatedData(relatedResource, flameData)
    const cellRender = (text: string | undefined) => {
      if (text === undefined) {
        return null
      }
      let res: any = text
      try {
        res = JSON.parse(text)
      } catch (error) {}
      if (typeof res === 'string') {
        return text
      }
      if (res?.val === ACTION_ROW_VAL) {
        return (
          <Button
            size="small"
            theme="borderless"
            onClick={async () => {
              onDetailBtnClick(res._ids)
            }}
            style={{
              margin: '0 auto'
            }}
            disabled={res._ids?.length <= 1}
          >
            detail
          </Button>
        )
      }

      return (
        <p
          style={{
            color: res?.highLight ? 'red' : '',
            width: '100%',
            height: '100%',
            lineHeight: '17px',
            cursor: 'pointer',
            boxSizing: 'content-box',
            padding: '6px 6px 4px',
            margin: '-6px 0 0 -6px'
          }}
          onClick={() => {
            const twinkleBar = flameChart.bars.find((bar: any) => {
              return bar.data.id === res.id
            })
            if (twinkleBar) {
              flameChart.twinkle(twinkleBar)
            }
          }}
        >{`${res.val}`}</p>
      )
    }
    const { columns, dataSource } = tarnsRelatedDataToTableData(formatRelatedData(relatedData), cellRender)
    return {
      columns,
      dataSource
    }
  }, [flameData, relatedResource, onDetailBtnClick, flameChart])

  const relatedExtraTableData = useMemo(() => {
    return tarnsArrayToTableData(formatRelatedExtraData(relatedExtraData))
  }, [relatedExtraData])

  useEffect(() => {
    setRelatedResource({})
    setRelatedViewIndex(0)
  }, [flameData])

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
            <div className="related-table-wrap">
              <div className="view-title">Related Data</div>
              <div className="related-extra-table" style={contentTranslateX}>
                <div className="related-table">
                  <DYTable
                    key={relatedTableData.columns?.length ? 'tableWithData' : 'tableWithoutData'}
                    className={'table-wrap'}
                    panelWidthHeight={panelWidthHeight}
                    columns={relatedTableData.columns}
                    dataSource={relatedTableData.dataSource}
                    loading={relatedTableLoading}
                  />
                </div>
                <div className="extra-table">
                  <DYTable
                    key={relatedExtraTableData.columns?.length ? 'tableWithData' : 'tableWithoutData'}
                    className={'table-wrap'}
                    panelWidthHeight={panelWidthHeight}
                    columns={relatedExtraTableData.columns}
                    dataSource={relatedExtraTableData.dataSource}
                  />
                </div>
              </div>
              <IconArrowLeft
                className="goback-icon"
                onClick={() => {
                  setRelatedViewIndex(relatedViewIndex ? 0 : 1)
                }}
                style={{
                  display: relatedViewIndex ? '' : 'none',
                  cursor: 'pointer'
                }}
              />
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
      {flameData && flameData?.length > 0 ? (
        <AskGPT
          data={{
            tracing: flameData
          }}
        ></AskGPT>
      ) : null}
    </div>
  )
}
