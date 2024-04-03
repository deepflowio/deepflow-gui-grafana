/* eslint-disable no-console */
import React, { useState, useRef, useMemo, useEffect } from 'react'
import { PanelProps } from '@grafana/data'
import { SimpleOptions } from 'types'
import './SimplePanel.css'
import _ from 'lodash'
import { Select, Alert, InlineField } from '@grafana/ui'
import {
  addSvg,
  fitSvgToContainer,
  renderSimpleTreeTopoChart,
  simpleTopoRender,
  Node,
  Link,
  renderTreeTopoChart,
  treeTopoRender,
  miniMap
} from 'deepflow-vis-js'
import { TopoTooltip } from 'components/TopoTooltip'
import { formatMetrics, genUniqueFieldByTag, useDebounce } from 'utils/tools'
import { AskGPT } from 'components/AskGPT'

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

// TODO
const NO_GROUP_BY_TAGS_OLD = ['tap_side', 'Enum(tap_side)']
const NO_GROUP_BY_TAGS = NO_GROUP_BY_TAGS_OLD.concat(['observation_point', 'Enum(observation_point)'])

const MINIMAP_CONTAINER_CACHE: Record<number, HTMLElement> = {}

export const SimplePanel: React.FC<Props> = ({ id, options, data, width, height }) => {
  const debouncedWidth = useDebounce(width, 600)
  const debouncedHeight = useDebounce(height, 600)

  const topoType = useMemo(() => {
    return options.topoSettings.type
  }, [options])
  const nodeDisplayTags = useMemo(() => {
    return options.topoSettings.nodeTags
  }, [options])
  const metricsUnits = useMemo(() => {
    return options.metricsUnits
  }, [options])
  const [errMsg, setErrMsg] = useState('')
  const [chartContainer, setChartContainer] = useState<any>(undefined)
  const targetIndex = 0
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
  useEffect(() => {
    const isMultiRefIds = refIds.length > 1
    if (isMultiRefIds) {
      setErrMsg('Not support multi query')
    } else {
      setErrMsg('')
    }
  }, [refIds])
  const selectedData = useMemo(() => {
    if (series[targetIndex]?.fields === undefined || !series[targetIndex]?.fields?.length) {
      setNoData(true)
      if (chartContainer) {
        chartContainer.select('g').remove()
      }
      if (MINIMAP_CONTAINER_CACHE[id]) {
        MINIMAP_CONTAINER_CACHE[id].remove()
      }
      return {
        fields: []
      }
    } else {
      setNoData(false)
    }
    setTooltipContent({})
    return series[targetIndex]
  }, [series, chartContainer, id])

  const queryConfig = useMemo(() => {
    const customData = series[targetIndex]?.meta?.custom
    if (!customData) {
      return {
        returnMetrics: [],
        returnTags: [],
        from: [],
        to: [],
        common: []
      }
    }
    return series[targetIndex]?.meta?.custom as {
      returnMetrics: any[]
      returnTags: any[]
      from: string[] | undefined
      to: string[] | undefined
      common: string[] | undefined
    }
  }, [series])

  const [groupTag, setGroupTag] = useState('')
  const groupTagOpts = useMemo(() => {
    if (topoType !== 'treeTopoWithGroup' || !queryConfig) {
      return []
    }
    const { from, to, common } = queryConfig
    const _from = from?.length ? from : []
    const _to = to?.length ? to : []
    const _common = common?.length ? common : []
    const result = [
      ...new Set(
        [..._from, ..._to].map(e => {
          return e.replace('_0', '').replace('_1', '').replace('_id', '')
        })
      ),
      ..._common
    ].map(e => {
      return {
        label: e,
        value: e
      }
    })
    return result
  }, [queryConfig, topoType])

  useEffect(() => {
    if (
      !groupTagOpts.find(e => {
        return e.value === groupTag
      })
    ) {
      setGroupTag('')
    }
  }, [groupTagOpts, groupTag])

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
    window.useTimeLogs && console.time('[Time Log][Topo: Compute links]')
    const filedNames = selectedData.fields.map(field => field.name)
    const dataIsMatched = [
      ...sourceSide,
      ...destinationSide,
      ...(Array.isArray(queryConfig.common) ? queryConfig.common : [])
    ].every(e => {
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
    const _commonTags = Array.isArray(queryConfig.common)
      ? queryConfig.common.filter((key: string) => {
          return !NO_GROUP_BY_TAGS.includes(key)
        })
      : []
    let basicData: any[] = []
    if (_commonTags.length !== queryConfig.common?.length) {
      const fullDataAfterGroupBy = _.groupBy(fullData, item => {
        return [...sourceSide, ...destinationSide, ..._commonTags]
          .map((tagName: string) => {
            // must use type and id to unique a auto group by tag
            if (/resource_gl|auto_instance|auto_service/.test(tagName)) {
              const nodeTypeId = item[tagName.replace('_id', '_type')]
              return [genUniqueFieldByTag(tagName, item), nodeTypeId].join(',')
            }
            return genUniqueFieldByTag(tagName, item)
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
              return genUniqueFieldByTag(key, e)
            })
            .join(',') + `-${e.client_node_type}`,
        to:
          [...destinationSide, ..._commonTags]
            .map(key => {
              return genUniqueFieldByTag(key, e)
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
                      NO_GROUP_BY_TAGS.filter(k => {
                        return k in g
                      }).map(k => {
                        return [k, g[k]]
                      })
                    ),
                    ...formatMetrics(queryConfig.returnMetrics, g, metricsUnits)
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
                ...formatMetrics(queryConfig.returnMetrics, e, metricsUnits)
              },
              metricValue: _.get(e, [_.get(queryConfig, ['returnMetrics', 0, 'name'])])
            })
      }
    })
    window.useTimeLogs && console.timeEnd('[Time Log][Topo: Compute links]')
    return result
  }, [selectedData, sourceSide, destinationSide, queryConfig, metricsUnits])

  const nodes: NodeItem[] = useMemo(() => {
    if (!links?.length || !queryConfig?.from?.length || !queryConfig?.to?.length) {
      return []
    }
    window.useTimeLogs && console.time('[Time Log][Topo: Compute nodes]')
    const _commonTags = Array.isArray(queryConfig.common)
      ? queryConfig.common.filter((key: string) => {
          return !NO_GROUP_BY_TAGS.includes(key)
        })
      : []
    const result: any[] = links
      .map(e => {
        return [
          {
            id: e['from'],
            node_type: e['client_node_type'],
            displayName: _.get(e, ['client_resource'], ''),
            nodeDisplayTags: Object.fromEntries(
              nodeDisplayTags.map(tag => {
                if (tag === 'node_type') {
                  return [tag, e['client_node_type']]
                }
                const key = tag in e ? tag : tag + '_0'
                return [tag, _.get(e, [key], '未知')]
              })
            ),
            tags: {
              node_type: e['client_node_type'],
              ...Object.fromEntries(
                [...(Array.isArray(queryConfig.from) ? queryConfig.from : []), ..._commonTags].map(tag => {
                  const _tag = tag.replace('_id', '')
                  return [_tag.replace('_0', ''), e[_tag]]
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
            displayName: _.get(e, ['server_resource'], ''),
            nodeDisplayTags: Object.fromEntries(
              nodeDisplayTags.map(tag => {
                if (tag === 'node_type') {
                  return [tag, e['server_node_type']]
                }
                const key = tag in e ? tag : tag + '_1'
                return [tag, _.get(e, [key], '未知')]
              })
            ),
            tags: {
              node_type: e['server_node_type'],
              ...Object.fromEntries(
                [...(Array.isArray(queryConfig.to) ? queryConfig.to : []), ..._commonTags].map(tag => {
                  const _tag = tag.replace('_id', '')
                  return [_tag.replace('_1', ''), e[_tag]]
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
    window.useTimeLogs && console.timeEnd('[Time Log][Topo: Compute nodes]')
    return _.uniqBy(result, 'id')
  }, [links, queryConfig, nodeDisplayTags])

  const panelRef = useRef(null)
  const [randomClassName, setRandomClassName] = useState('')
  useEffect(() => {
    const randomString = 'chart' + Math.random().toFixed(9).replace('0.', '')
    setRandomClassName(randomString)
  }, [panelRef])

  useEffect(() => {
    if (!randomClassName || !debouncedWidth || !debouncedHeight) {
      return
    }
    const container = addSvg('.' + randomClassName)
    fitSvgToContainer(container)
    setChartContainer(container)
  }, [randomClassName, topoType, debouncedWidth, debouncedHeight])

  const bodyClassName = document.body.className
  const isDark = useMemo(() => {
    return bodyClassName.includes('theme-dark')
  }, [bodyClassName])

  const [topoHandler, setTopoHandler] = useState<any>(undefined)
  useEffect(() => {
    if (!chartContainer || !nodes.length || !links.length) {
      return
    }
    window.useTimeLogs && console.time('[Time Log][Topo: Render]')
    try {
      const titleColor = isDark ? '#bbb' : '#333'
      const nodeAndLinkColor = isDark ? '#206FD6' : '#B6BFD1'
      chartContainer.selectAll('g').remove()
      const renderFunction: any = topoType === 'simpleTopo' ? renderSimpleTreeTopoChart : renderTreeTopoChart
      const bindEventFunction = topoType === 'simpleTopo' ? simpleTopoRender : treeTopoRender

      const handleZoomEvent = (event: any) => {
        miniRender(event)
      }
      const renderOptions = {
        getNodeV: (node: Node<NodeItem>) => 0,
        getNodeColor: (node: Node<NodeItem>) => nodeAndLinkColor,
        getNodeTitle: (node: Node<NodeItem>) => node.data.displayName,
        getLinkV: (link: Link<LinkItem>) => link.data.metricValue,
        getLinkColor: (link: Link<LinkItem>) => nodeAndLinkColor,
        titleColor: titleColor,
        watchZoomEvent: (event: any) => handleZoomEvent(event),
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
                const nodeDisplayTags = node.data.nodeDisplayTags
                const result = Object.keys(nodeDisplayTags)?.length ? nodeDisplayTags : tags

                return Object.keys(result).map(key => {
                  return {
                    key,
                    value: result[key]
                  }
                })
              },
              getGroupName: (d: any): string => {
                return `分组: ${d}`
              },
              getGroupNameColor: () => nodeAndLinkColor,
              setNodeStyle: (node: Node<NodeItem>) => {
                try {
                  if (isDark) {
                    node?.refs?.titleTextEle?.attr('fill', '#ffffff')
                  }
                  node?.refs?.iconBackgroundEle?.attr('fill', '#ffffff').attr('r', '16').attr('cx', '22.5')
                  node?.refs?.iconEle?.attr('x', '11.5').attr('y', '9.5').attr('width', '22').attr('height', '22')
                } catch (error) {
                  console.log(error)
                }
              }
            }
          : {
              getNodeIcon: (node: Node<NodeItem>) => node.data.node_type,
              setNodeStyle: (node: Node<NodeItem>) => {
                try {
                  node?.refs?.textEle?.attr('stroke-width', '').attr('stroke', '').attr('paint-order', '')
                } catch (error) {
                  console.log(error)
                }
              },
              nodeSize: [40, 40]
            })
      }
      const handler: any = renderFunction(
        chartContainer,
        {
          nodes,
          links
        },
        renderOptions
      )
      const { nodes: _nodes, links: _links, zoom } = handler
      if (topoType === 'simpleTopo') {
        simpleTopoRender.bindDefaultMouseEvent(handler.links, handler.nodes, chartContainer)
      } else {
        handler.render(handler.nodes, handler.links)
        treeTopoRender.bindDefaultMouseEvent(handler.links, handler.nodes, handler.svg)
      }
      if (topoType === 'treeTopoWithGroup') {
        setTopoHandler(handler)
      }

      _links.forEach((link: Link<LinkItem>) => {
        bindEventFunction.bindCustomMouseEvent(
          link,
          'mouseenter',
          (e: MouseEvent, l: Link<LinkItem> | Node<NodeItem>) => {
            let metricsObj: any
            if (topoType !== 'simpleTopo') {
              const type = _.get(link, ['props', 'type'])
              const currentMetrics = _.get(link, ['data', 'metrics'], {})
              const otherMetrics = _.get(link, ['props', 'otherSide', 'data', 'metrics'], {})
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
          }
        )
        bindEventFunction.bindCustomMouseEvent(
          link,
          'mousemove',
          (e: MouseEvent, l: Link<LinkItem> | Node<NodeItem>) => {
            setTimeout(() => {
              setMousePos({
                x: e.clientX,
                y: e.clientY
              })
            })
          }
        )
        bindEventFunction.bindCustomMouseEvent(
          link,
          'mouseleave',
          (e: MouseEvent, l: Link<LinkItem> | Node<NodeItem>) => {
            setTooltipContent({})
          }
        )
      })
      _nodes.forEach((node: Node<NodeItem>) => {
        bindEventFunction.bindCustomMouseEvent(
          node,
          'mouseenter',
          (e: MouseEvent, n: Link<LinkItem> | Node<NodeItem>) => {
            const tagsObj = _.get(node, ['data', 'tags'], {})
            setTooltipContent(tagsObj)
          }
        )
        bindEventFunction.bindCustomMouseEvent(
          node,
          'mousemove',
          (e: MouseEvent, n: Link<LinkItem> | Node<NodeItem>) => {
            setTimeout(() => {
              setMousePos({
                x: e.clientX,
                y: e.clientY
              })
            })
          }
        )
        bindEventFunction.bindCustomMouseEvent(
          node,
          'mouseleave',
          (e: MouseEvent, n: Link<LinkItem> | Node<NodeItem>) => {
            setTooltipContent({})
          }
        )
      })

      if (MINIMAP_CONTAINER_CACHE[id]) {
        MINIMAP_CONTAINER_CACHE[id].remove()
      }
      const _miniMapContainer = addSvg('.' + randomClassName, false)
      _miniMapContainer
        .attr('width', debouncedWidth / 4)
        .attr('height', debouncedHeight / 4)
        .attr('viewBox', `0 0 ${debouncedWidth / 4} ${debouncedHeight / 4}`)
        .style('position', 'absolute')
        .style('bottom', 0)
        .style('left', 0)
      MINIMAP_CONTAINER_CACHE[id] = _miniMapContainer

      const miniRender = miniMap(
        _nodes,
        _links,
        _miniMapContainer,
        chartContainer,
        zoom,
        topoType === 'simpleTopo'
          ? {
              getNodeColor: (node: Node<NodeItem>) => {
                return nodeAndLinkColor
              },
              getLinkColor: (link: Link<LinkItem>) => {
                return nodeAndLinkColor
              }
            }
          : {
              nodeType: 'rect',
              lineGenerator: (link: Link<LinkItem>) => {
                return treeTopoRender.getPathD(link)
              }
            }
      )
      miniRender()
    } catch (error: any) {
      console.log(error)
      setErrMsg(error.toString() || 'draw topo failed')
    }
    window.useTimeLogs && console.timeEnd('[Time Log][Topo: Render]')
  }, [id, nodes, links, chartContainer, randomClassName, debouncedWidth, debouncedHeight, isDark, topoType])

  useEffect(() => {
    if (!topoHandler || !groupTag) {
      return
    }
    topoHandler.group((data: any) => {
      const keysArr = [groupTag, groupTag + '_0', groupTag + '_1']
      const key = keysArr.find((key: string) => {
        return key in data.originalData
      })
      return key ? data.originalData[key] : '未知'
    })
  }, [topoHandler, groupTag])

  return (
    <div ref={panelRef} className="topo-actions-wrap">
      <div className="actions-warp">
        {topoType === 'treeTopoWithGroup' ? (
          <InlineField label="CLUSTER BY" labelWidth={12}>
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
      {!noData ? (
        <AskGPT
          data={{
            links
          }}
        ></AskGPT>
      ) : null}
    </div>
  )
}
