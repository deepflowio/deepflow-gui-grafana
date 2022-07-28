import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { DataSourceInstanceSettings, PanelProps } from '@grafana/data'
import { SimpleOptions } from 'types'
import './SimplePanel.css'
import _ from 'lodash'
import { Select, Alert, InlineField } from '@grafana/ui'
import { getDataSourceSrv } from '@grafana/runtime'
import {
  addSvg,
  fitSvgToContainer,
  renderSimpleTreeTopoChart,
  simpleTopoRender,
  Node,
  Link,
  renderTreeTopoChart,
  treeTopoRender
} from 'deepflow-vis-js'
import { TopoTooltip } from 'components/TopoTooltip'

type NodeItem = {
  id: string
  node_type: string
  displayName: string
  tags: Record<any, any>
} & Record<any, any>

type LinkItem = {
  from: string
  to: string
  metrics: any[]
  metricValue: number
} & Record<any, any>

interface Props extends PanelProps<SimpleOptions> {}

//  ip: 255, internet_ip: 0
const IP_LIKELY_NODE_TYPE_TDS = [255, 0]
const NO_GROUP_BY_TAGS = ['tap_side']

export const SimplePanel: React.FC<Props> = ({ options, data, width, height }) => {
  const topoType = useMemo(() => {
    return options.topoSettings.type
  }, [options])
  const [errMsg, setErrMsg] = useState('')
  const [chartContainer, setChartContainer] = useState<any>(undefined)
  const [targetIndex, setTargetIndex] = useState(0)
  const [noData, setNoData] = useState(false)

  const [tooltipContent, setTooltipContent] = useState({})
  const [mousePos, setMousePos] = useState({
    x: 0,
    y: 0
  })

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
  const selectedData = useMemo(() => {
    if (series[targetIndex]?.fields === undefined || !series[targetIndex]?.fields?.length) {
      setNoData(true)
      if (chartContainer) {
        chartContainer.selectAll('*').remove()
      }
      return {
        fields: []
      }
    } else {
      setNoData(false)
    }
    setTooltipContent({})
    return series[targetIndex]
  }, [series, targetIndex, chartContainer])

  const [queryConfig, setQueryConfig] = useState<
    { returnMetrics: any[]; returnTags: any[]; from: string[]; to: string[]; common: string[] } | undefined
  >(undefined)
  const getConfigByRefId = useCallback(async () => {
    const deepFlowName = await getDataSourceSrv()
      .getList()
      .find((dataSource: DataSourceInstanceSettings) => {
        return dataSource.type === 'deepflow-querier-datasource'
      })?.name
    const deepFlow = await getDataSourceSrv().get(deepFlowName)
    const refId = refIds[targetIndex].label
    const result = deepFlow
      ? // @ts-ignore
        (deepFlow.getQueryConfig(refId) as {
          returnMetrics: any[]
          returnTags: any[]
          from: string[]
          to: string[]
          common: string[]
        })
      : undefined
    setQueryConfig(result)
  }, [refIds, targetIndex])
  useEffect(() => {
    getConfigByRefId()
  }, [getConfigByRefId, selectedData])

  const [groupTag, setGroupTag] = useState('')
  const groupTagOpts = useMemo(() => {
    if (topoType !== 'treeTopoWithGroup' || !queryConfig) {
      return []
    }
    const { from, to, common } = queryConfig
    return [
      ...new Set(
        [...from, ...to].map(e => {
          return e.replace('_0', '').replace('_1', '').replace('_id', '')
        })
      ),
      ...common
    ].map(e => {
      return {
        label: e,
        value: e
      }
    })
  }, [queryConfig, topoType])

  const sourceSide = useMemo(() => {
    if (!queryConfig?.from?.length) {
      return []
    }
    return queryConfig.from
  }, [queryConfig])
  const destinationSide = useMemo(() => {
    if (!queryConfig?.to?.length) {
      return []
    }
    return queryConfig.to
  }, [queryConfig])

  const links: LinkItem[] = useMemo(() => {
    if (!selectedData?.fields?.length || !sourceSide.length || !destinationSide.length || !queryConfig?.returnMetrics) {
      return []
    }
    const filedNames = selectedData.fields.map(field => field.name)
    const dataIsMatched = [...sourceSide, ...destinationSide, ...queryConfig.common].every(e => {
      return filedNames.includes(e)
    })
    if (!dataIsMatched) {
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
    const _commonTags = queryConfig.common.filter((key: string) => {
      return !NO_GROUP_BY_TAGS.includes(key)
    })
    let basicData: any[] = []
    if (_commonTags.length !== queryConfig.common.length) {
      const fullDataAfterGroupBy = _.groupBy(fullData, item => {
        return [...sourceSide, ...destinationSide, ..._commonTags]
          .map((key: string) => {
            return item[key]
          })
          .join(',')
      })
      _.forIn(fullDataAfterGroupBy, (item, key) => {
        const first = item[0]
        basicData.push({
          ...first,
          metricsGroup: item
        })
      })
    } else {
      basicData = fullData
    }
    const result: LinkItem[] = basicData.map(e => {
      const item = {
        ...e,
        from:
          [...sourceSide, ..._commonTags]
            .map(key => {
              if (key.includes('resource_gl')) {
                const nodeTypeId = e[key.replace('_id', '_type')]
                if (IP_LIKELY_NODE_TYPE_TDS.includes(nodeTypeId)) {
                  return `${e['ip_0']},${e['subnet_id_0']}`
                }
              }
              return `${e[key]}`
            })
            .join(',') + `-${e.client_node_type}`,
        to:
          [...destinationSide, ..._commonTags]
            .map(key => {
              if (key.includes('resource_gl')) {
                const nodeTypeId = e[key.replace('_id', '_type')]
                if (IP_LIKELY_NODE_TYPE_TDS.includes(nodeTypeId)) {
                  return `${e['ip_0']},${e['subnet_id_0']}`
                }
              }
              return `${e[key]}`
            })
            .join(',') + `-${e.server_node_type}`
      }
      return {
        ...item,
        ...(e.metricsGroup
          ? {
              metrics: [
                [
                  {
                    FROM: _.get(item, ['client_resource']),
                    TO: _.get(item, ['server_resource'])
                  }
                ],
                ...e.metricsGroup.map((g: any) => {
                  return {
                    ...Object.fromEntries(
                      NO_GROUP_BY_TAGS.map(k => {
                        return [k, g[k]]
                      })
                    ),
                    ...Object.fromEntries(
                      queryConfig.returnMetrics.map(metric => {
                        const key = metric.name
                        return [key, g[key]]
                      })
                    )
                  }
                })
              ].flat(),
              metricValue: Math.max.call(
                null,
                ...e.metricsGroup.map((m: any) => {
                  return _.get(e, [_.get(queryConfig, ['returnMetrics', 0, 'name'])])
                })
              )
            }
          : {
              metrics: {
                FROM: _.get(item, ['client_resource']),
                TO: _.get(item, ['server_resource']),
                ...Object.fromEntries(
                  queryConfig.returnMetrics.map(metric => {
                    const key = metric.name
                    return [key, e[key]]
                  })
                )
              },
              metricValue: _.get(e, [_.get(queryConfig, ['returnMetrics', 0, 'name'])])
            })
      }
    })
    return result
  }, [selectedData, sourceSide, destinationSide, queryConfig])

  const nodes: NodeItem[] = useMemo(() => {
    if (!links?.length || !queryConfig?.from?.length || !queryConfig?.to?.length) {
      return []
    }
    const _commonTags = queryConfig.common.filter((key: string) => {
      return !NO_GROUP_BY_TAGS.includes(key)
    })
    const result: any[] = links
      .map(e => {
        return [
          {
            id: e['from'],
            node_type: e['client_node_type'],
            displayName: _.get(e, ['client_resource']),
            tags: {
              node_type: e['client_node_type'],
              ...Object.fromEntries(
                [...queryConfig.from, ..._commonTags].map(tag => {
                  return [tag, e[tag]]
                })
              )
            },
            originalData: _.pick(
              e,
              Object.keys(e).filter(key => {
                return !key.includes('_1')
              })
            )
          },
          {
            id: e['to'],
            node_type: e['server_node_type'],
            displayName: _.get(e, ['server_resource']),
            tags: {
              node_type: e['server_node_type'],
              ...Object.fromEntries(
                [...queryConfig.to, ..._commonTags].map(tag => {
                  return [tag, e[tag]]
                })
              )
            },
            originalData: _.pick(
              e,
              Object.keys(e).filter(key => {
                return !key.includes('_0')
              })
            )
          }
        ]
      })
      .flat(Infinity)
    return _.uniqBy(result, 'id')
  }, [links, queryConfig])

  const panelRef = useRef(null)
  const [randomClassName, setRandomClassName] = useState('')
  useEffect(() => {
    const randomString = 'chart' + Math.random().toFixed(9).replace('0.', '')
    setRandomClassName(randomString)
  }, [panelRef])

  useEffect(() => {
    if (!randomClassName) {
      return
    }
    const container = addSvg('.' + randomClassName)
    fitSvgToContainer(container)
    setChartContainer(container)
  }, [randomClassName, topoType])

  const bodyClassName = document.body.className
  const isDark = useMemo(() => {
    return bodyClassName.includes('theme-dark')
  }, [bodyClassName])

  const [topoHandler, setTopoHandler] = useState<any>(undefined)
  useEffect(() => {
    if (!chartContainer || !nodes.length || !links.length) {
      return
    }
    try {
      const titleColor = isDark ? '#bbb' : '#333'
      const nodeAndLinkColor = isDark ? '#206FD6' : '#B6BFD1'
      chartContainer.selectAll('g').remove()
      const renderFunction = topoType === 'simpleTopo' ? renderSimpleTreeTopoChart : renderTreeTopoChart
      const bindEventFunction = topoType === 'simpleTopo' ? simpleTopoRender : treeTopoRender

      const renderOptions: Record<any, any> = {
        getNodeV: (node: Node<NodeItem>) => 0,
        getNodeColor: (node: Node<NodeItem>) => nodeAndLinkColor,
        getNodeIcon: (node: Node<NodeItem>) => node.data.node_type,
        getNodeTitle: (node: Node<NodeItem>) => node.data.displayName,
        getLinkV: (link: Link<LinkItem>) => link.data.metricValue,
        getLinkColor: (link: Link<LinkItem>) => nodeAndLinkColor,
        titleColor: titleColor,
        nodeSize: [40, 40],
        ...(topoType !== 'simpleTopo'
          ? {
              nodeSize: [300, 300],
              getNodeIcon: (d: Node<NodeItem>, AvailableIcons: Record<string | number, any> = {}) => {
                let icon = d.data.node_type
                if (icon in AvailableIcons) {
                  return AvailableIcons[icon]
                }
                return AvailableIcons.unknown
              },
              getLinkSize: (d: Link<LinkItem>): number => 2,
              getMetrics: (node: Node<NodeItem>) => {
                const tags = node.data.tags
                return Object.keys(tags).map(key => {
                  return {
                    key,
                    value: tags[key]
                  }
                })
              },
              getGroupName: (d: any): string => {
                return `分组: ${d}`
              },
              getGroupNameColor: () => nodeAndLinkColor
            }
          : {})
      }
      const handler = renderFunction(
        chartContainer,
        {
          nodes,
          links
        },
        renderOptions
      )
      const { nodes: _nodes, links: _links } = handler
      if (topoType !== 'simpleTopo') {
        handler.render(handler.nodes, handler.links)
        treeTopoRender.bindDefaultMouseEvent(handler.links, handler.nodes, handler.svg)
      }
      if (topoType === 'treeTopoWithGroup') {
        setTopoHandler(handler)
      }

      _links.forEach((link: Link<LinkItem>) => {
        bindEventFunction.bindCustomMouseEvent(link, 'mouseenter', (e: MouseEvent, l: Link<LinkItem>) => {
          let metricsObj: any
          if (topoType !== 'simpleTopo') {
            const type = _.get(link, ['props', 'type'])
            const currentMetrics = _.get(link, ['data', 'metrics'], {})
            const otherMetrics = _.get(link, ['data', 'props', 'otherSide', 'data', 'metrics'], {})
            metricsObj =
              type === 'single'
                ? currentMetrics
                : [
                    ...(Array.isArray(currentMetrics) ? currentMetrics : [currentMetrics]),
                    ...(Array.isArray(otherMetrics) ? otherMetrics : [otherMetrics])
                  ]
          } else {
            metricsObj = _.get(link, ['data', 'metrics'], {})
          }
          setTooltipContent(metricsObj)
        })
        bindEventFunction.bindCustomMouseEvent(link, 'mousemove', (e: MouseEvent, l: Link<LinkItem>) => {
          setTimeout(() => {
            setMousePos({
              x: e.clientX,
              y: e.clientY
            })
          })
        })
        bindEventFunction.bindCustomMouseEvent(link, 'mouseleave', (e: MouseEvent, l: Link<LinkItem>) => {
          setTooltipContent({})
        })
      })
      _nodes.forEach((node: Node<NodeItem>) => {
        bindEventFunction.bindCustomMouseEvent(node, 'mouseenter', (e: MouseEvent, n: Node<NodeItem>) => {
          const tagsObj = _.get(node, ['data', 'tags'], {})
          setTooltipContent(tagsObj)
        })
        bindEventFunction.bindCustomMouseEvent(node, 'mousemove', (e: MouseEvent, n: Node<NodeItem>) => {
          setTimeout(() => {
            setMousePos({
              x: e.clientX,
              y: e.clientY
            })
          })
        })
        bindEventFunction.bindCustomMouseEvent(node, 'mouseleave', (e: MouseEvent, n: Node<NodeItem>) => {
          setTooltipContent({})
        })
      })
    } catch (error: any) {
      console.log(error)
      setErrMsg(error.toString() || 'draw topo failed')
    }
  }, [nodes, links, chartContainer, isDark, topoType])

  useEffect(() => {
    if (!topoHandler || !groupTag) {
      return
    }
    topoHandler.group((data: any) => {
      const keysArr = [groupTag, groupTag + '_0', groupTag + '_1']
      const key = keysArr.find((key: string) => {
        return key in data.originalData
      })
      return key ? data.originalData[key] : key
    })
  }, [topoHandler, groupTag])

  return (
    <div ref={panelRef} className="topo-actions-wrap">
      <div className="actions-warp">
        {isMultiRefIds ? (
          <InlineField className="custom-label" label="REF ID" labelWidth={7}>
            <Select
              options={refIds}
              value={targetIndex}
              onChange={v => {
                setGroupTag('')
                setTargetIndex(v.value as number)
              }}
            ></Select>
          </InlineField>
        ) : null}
        {topoType === 'treeTopoWithGroup' ? (
          <InlineField className="custom-label" label="CLUSTER BY" labelWidth={12}>
            <Select
              options={groupTagOpts}
              value={groupTag}
              onChange={v => {
                setGroupTag(v.value as string)
              }}
              key={groupTag ? 'groupTagWithVal' : 'groupTagWithoutVal'}
            ></Select>
          </InlineField>
        ) : null}
      </div>
      {noData ? <div>No Data</div> : null}
      <div className={`chart-container ${randomClassName}`}></div>
      <TopoTooltip contentData={tooltipContent} mousePos={mousePos}></TopoTooltip>
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
