import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { DataSourceInstanceSettings, Field, PanelProps, Vector } from '@grafana/data'
import { SimpleOptions } from 'types'
import { DYTable } from 'components/DYTable'
import './SimplePanel.css'
import { Button } from '@douyinfe/semi-ui'
import { IconArrowLeft } from '@douyinfe/semi-icons'
import { ColumnProps } from '@douyinfe/semi-ui/lib/es/table'
import { Alert, Select } from '@grafana/ui'
import _ from 'lodash'
import { getDataSourceSrv } from '@grafana/runtime'
import { renderTimeBar, addSvg, fitSvgToContainer, TAP_SIDE_OPTIONS_MAP } from 'deepflow-vis-js'
import { FlameTooltip } from 'components/FlameTooltip'
import { genServiceId, useDebounce } from 'utils/tools'
import { calcTableCellWidth, getStringLen, formatDetailData, tarnsArrayToTableData } from 'utils/tables'

interface Props extends PanelProps<SimpleOptions> {}

export const SimplePanel: React.FC<Props> = ({ data, width, height }) => {
  const { series, request } = data
  const refIds = request?.targets
    ? request.targets.map((target, index) => {
        return {
          value: index,
          label: target.refId
        }
      })
    : []

  const [errMsg, setErrMsg] = useState('')
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
    if (!randomClassName) {
      return
    }
    const container = addSvg('.' + randomClassName)
    fitSvgToContainer(container)
    setFlameContainer(container)
  }, [randomClassName])

  const [mousePos, setMousePos] = useState({
    x: 0,
    y: 0
  })
  const [hoveredBarData, setHoveredBarData] = useState<undefined | {}>(undefined)
  const [flameData, setFlameData] = useState<undefined | {}>(undefined)
  const debouncedWidth = useDebounce(width, 600)
  const debouncedHeight = useDebounce(height, 600)
  useEffect(() => {
    if (!flameData || !flameContainer) {
      return
    }
    flameContainer.selectAll('*').remove()
    const renderResult = renderTimeBar(flameData)(flameContainer, {
      formatBarName: (data: any, type: string) => {
        if (type === 'app' || type === 'process') {
          return `${data._l7_protocol} ${data.request_type || ''} ${data.request_resource || ''}`
        } else {
          return _.get(TAP_SIDE_OPTIONS_MAP, [data.tap_side, 'label'], data.tap_side)
        }
      }
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
        setHoveredBarData(bar.data)
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
  }, [flameData, flameContainer, debouncedWidth, setFlameDetailFilter, setMousePos])

  const [startTableLoading, setStartTableLoading] = useState(false)
  const onActive = useCallback(async (item: any) => {
    const deepFlowName = await getDataSourceSrv()
      .getList()
      .find((dataSource: DataSourceInstanceSettings) => {
        return dataSource.type === 'deepflow-querier-datasource'
      })?.name
    const deepFlow = await getDataSourceSrv().get(deepFlowName)
    if (!deepFlow) {
      return
    }
    try {
      setStartTableLoading(true)
      const { _id } = item
      // @ts-ignore
      const result = await deepFlow.getFlameData({ _id })
      const { services, tracing, detailList } = result
      if (!result || !services?.length) {
        setErrMsg('No Data')
        return
      }
      setSelectedServiceRowId('')
      setDetailFilteIds([])
      setServiceData(services)
      setDetailData(detailList)
      setFlameData(tracing)
      setViewIndex(1)
    } catch (error: any) {
      const msg = error ? error?.data?.DESCRIPTION : ' Network Error'
      setErrMsg(msg)
    }
    setStartTableLoading(false)
  }, [])

  const [targetIndex, setTargetIndex] = useState(0)
  const startTableData = useMemo(() => {
    setHoveredBarData(undefined)
    const columnFixedRight = 'right' as const
    const actionCloumn = {
      title: 'action',
      dataIndex: 'action',
      align: 'center',
      render: (text: string, record: any) => (
        <Button
          size="small"
          theme="borderless"
          onClick={async () => {
            onActive(record)
          }}
          disabled={!record._id}
        >
          tracing
        </Button>
      ),
      fixed: columnFixedRight,
      width: 88
    }
    const target = series[targetIndex] ? series[targetIndex].fields : []

    const dataSource: Array<
      {
        key: string
      } & {
        [P in string]: string
      }
    > = []
    target.forEach((e: Field<any, Vector<any>>, i: number) => {
      e.values.toArray().forEach((val, index) => {
        if (!dataSource[index]) {
          dataSource[index] = {
            key: index + ''
          }
        }
        dataSource[index][e.name] = typeof val?.toString === 'function' ? val.toString() : val
      })
    })

    const columns: Array<
      ColumnProps<{
        key: string
      }>
    > = [
      ...target.map((e: Field<any, Vector<any>>, i: number) => {
        const textLens: number[] = [
          e.name === null ? 0 : getStringLen(e.name),
          ...dataSource.map(d => {
            return d[e.name] === null ? 0 : getStringLen(d[e.name].toString())
          })
        ]
        const maxLen = Math.max(...textLens)
        return {
          title: e.name,
          dataIndex: e.name,
          width: calcTableCellWidth(maxLen)
        }
      }),
      actionCloumn
    ]
    return {
      columns,
      dataSource
    }
  }, [series, targetIndex, onActive])

  useEffect(() => {
    setStartTableLoading(false)
    setHoveredBarData(undefined)
    setViewIndex(0)
  }, [startTableData])

  const [viewIndex, setViewIndex] = useState(0)
  const contentTranslateX = useMemo(() => {
    return {
      transform: `translateX(${viewIndex * -100}%)`
    }
  }, [viewIndex])

  const bodyClassName = document.body.className
  const isDark = useMemo(() => {
    return bodyClassName.includes('theme-dark')
  }, [bodyClassName])

  const [serviceData, setServiceData] = useState([])
  const serviceTableData = useMemo(() => {
    return tarnsArrayToTableData(serviceData)
  }, [serviceData])

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

  const isMultiRefIds = refIds.length > 1
  const panelWidthHeight = useMemo(() => {
    return {
      width: debouncedWidth,
      height: debouncedHeight,
      isMultiRefIds
    }
  }, [debouncedWidth, debouncedHeight, isMultiRefIds])

  return (
    <div ref={panelRef} className={`deepflow-panel ${isDark ? 'semi-always-dark' : 'semi-always-light'}`}>
      <div className="content" style={contentTranslateX}>
        <div className="table-and-select">
          {isMultiRefIds ? (
            <Select
              className={'ref-select'}
              options={refIds}
              value={targetIndex}
              onChange={v => {
                setTargetIndex(v.value as number)
              }}
            ></Select>
          ) : null}
          <DYTable
            className={'table-wrap'}
            panelWidthHeight={panelWidthHeight}
            columns={startTableData.columns}
            dataSource={startTableData.dataSource}
            loading={startTableLoading}
          />
        </div>
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
      <IconArrowLeft
        className="goback-icon"
        onClick={() => {
          setViewIndex(viewIndex ? 0 : 1)
        }}
        style={{
          display: viewIndex ? '' : 'none',
          cursor: 'pointer'
        }}
      />
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
