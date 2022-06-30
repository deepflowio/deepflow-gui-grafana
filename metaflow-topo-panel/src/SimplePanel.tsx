import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { PanelProps } from '@grafana/data'
import { SimpleOptions } from 'types'
import './SimplePanel.css'
import _ from 'lodash'
import { Select } from '@grafana/ui'
import { getDataSourceSrv } from '@grafana/runtime'
import { getResourceIdKey } from 'utils/tools'
import { addSvg, fitSvgToContainer, renderSimpleTreeTopoChart, simpleTopoRender, Node, Link } from 'metaflow-vis-js'
import { TopoTooltip } from 'components/TopoTooltip'

type NodeItem = {
  id: string
  node_type: string
  orginData: Record<string, any>
} & Record<any, any>
type LinkItem = { from: string; to: string } & Record<any, any>

interface Props extends PanelProps<SimpleOptions> {}

export const SimplePanel: React.FC<Props> = ({ options, data, width, height }) => {
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
  const isMultiRefIds = refIds.length > 1
  const [targetIndex, setTargetIndex] = useState(0)
  const selectedData = useMemo(() => {
    return series[targetIndex]
  }, [series, targetIndex])

  const [queryConfig, setQueryConfig] = useState<
    { returnMetrics: any[]; returnTags: any[]; from: string; to: string } | undefined
  >(undefined)
  const getConfigByRefId = useCallback(async () => {
    const metaFlow = await getDataSourceSrv().get('MetaFlow')
    const refId = refIds[targetIndex].label
    const result = metaFlow
      ? // @ts-ignore
        (metaFlow.getQueryConfig(refId) as { returnMetrics: any[]; returnTags: any[]; from: string; to: string })
      : undefined
    setQueryConfig(result)
  }, [refIds, targetIndex])
  useEffect(() => {
    getConfigByRefId()
  }, [getConfigByRefId])

  const sourceSide = useMemo(() => {
    if (!queryConfig?.from) {
      return ''
    }
    return getResourceIdKey(queryConfig.from)
  }, [queryConfig])
  const destinationSide = useMemo(() => {
    if (!queryConfig?.to) {
      return ''
    }
    return getResourceIdKey(queryConfig.to)
  }, [queryConfig])

  const links: LinkItem[] = useMemo(() => {
    if (!selectedData?.fields?.length || sourceSide === '' || destinationSide === '' || !queryConfig?.returnMetrics) {
      return []
    }
    const fullData: any[] = []
    selectedData.fields.forEach((e: any, i: number) => {
      e.values.toArray().forEach((val: any, index: number) => {
        if (!fullData[index]) {
          fullData[index] = {}
        }
        fullData[index][e.name] = val
      })
    })

    return fullData.map(e => {
      return {
        ...e,
        from: `${e[sourceSide]}${e['client_node_type']}`,
        to: `${e[destinationSide]}${e['server_node_type']}`,
        metrics: Object.fromEntries(
          queryConfig.returnMetrics.map(metric => {
            const key = metric.name
            return [[key], e[key]]
          })
        )
      }
    })
  }, [selectedData, sourceSide, destinationSide, queryConfig])

  const nodes: NodeItem[] = useMemo(() => {
    if (!links?.length || !queryConfig?.from || !queryConfig?.to) {
      return []
    }
    const result: any[] = links
      .map(e => {
        return [
          {
            id: e['from'],
            node_type: e['client_node_type'],
            displayName: _.get(e, [queryConfig?.from])
          },
          {
            id: e['to'],
            node_type: e['server_node_type'],
            displayName: _.get(e, [queryConfig?.to])
          }
        ]
      })
      .flat(Infinity)
    return _.uniqBy(result, 'id')
  }, [links, queryConfig])

  const [chartContainer, setChartContainer] = useState<any>(undefined)
  useEffect(() => {
    const container = addSvg('.chart-container')
    fitSvgToContainer(container)
    setChartContainer(container)
  }, [])

  const [tooltipContent, setTooltipContent] = useState({})

  const [mousePos, setMousePos] = useState({
    x: 0,
    y: 0
  })

  useEffect(() => {
    const metricKey = _.get(queryConfig, ['returnMetrics', 0, 'name'])
    if (!chartContainer || !nodes.length || !links.length || !metricKey) {
      return
    }
    chartContainer.selectAll('*').remove()
    const { nodes: _nodes, links: _links } = renderSimpleTreeTopoChart(
      chartContainer,
      {
        nodes,
        links
      },
      {
        getNodeV: (node: Node<NodeItem>) => 0,
        getNodeColor: (node: Node<NodeItem>) => '#bbb',
        getNodeIcon: (node: Node<NodeItem>) => node.data.node_type,
        getNodeTitle: (node: Node<NodeItem>) => node.data.displayName,
        getLinkV: (link: Link<LinkItem>) => link.data[metricKey],
        getLinkColor: (link: Link<LinkItem>) => '#206FD6',
        titleColor: '#bbb',
        nodeSize: [40, 40]
      }
    )
    _links.forEach((link: Link<LinkItem>) => {
      simpleTopoRender.bindCustomMouseEvent(link, 'mouseenter', (e: MouseEvent, l: Link<LinkItem>) => {
        const metricsObj = _.get(l.data, ['metrics'])
        setTooltipContent(metricsObj)
      })
      simpleTopoRender.bindCustomMouseEvent(link, 'mousemove', (e: MouseEvent, l: Link<LinkItem>) => {
        setTimeout(() => {
          setMousePos({
            x: e.clientX,
            y: e.clientY
          })
        })
      })
      simpleTopoRender.bindCustomMouseEvent(link, 'mouseleave', (e: MouseEvent, l: Link<LinkItem>) => {
        setTooltipContent({})
      })
    })
  }, [nodes, links, chartContainer, queryConfig])

  return (
    <div className="topo-actions-wrap">
      <div className="actions-warp">
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
      </div>
      <div className="chart-container"></div>
      <TopoTooltip contentData={tooltipContent} mousePos={mousePos}></TopoTooltip>
    </div>
  )
}
