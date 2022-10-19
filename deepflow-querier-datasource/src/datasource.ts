import _ from 'lodash'
import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  FieldType,
  MutableDataFrame
} from '@grafana/data'
import { MyQuery, MyDataSourceOptions } from './types'
import { DATA_SOURCE_SETTINGS, QUERY_DATA_CACHE } from 'utils/cache'
import { BackendSrvRequest, getBackendSrv } from '@grafana/runtime'
import parseQueryStr, { replaceInterval } from './utils/parseQueryStr'
import * as querierJs from 'deepflow-sdk-js'
import qs from 'qs'
import 'json-bigint-patch'
import { MyVariableQuery } from 'components/VariableQueryEditor'
import {
  formatUsUnit,
  getAccessRelationshipeQueryConfig,
  getMetricFieldNameByAlias,
  getParamByName,
  numberToShort
} from 'utils/tools'
import { MAP_METRIC_TYPE_NUM, MAP_TAG_TYPE, SELECT_GROUP_BY_DISABLE_TAGS, TAG_METRIC_TYPE_NUM } from 'consts'

function setTimeKey(
  queryData: any,
  {
    from,
    to
  }: {
    from: number
    to: number
  }
) {
  const key = 'time'
  queryData.where.push({
    type: 'tag',
    key,
    op: '>=',
    val: from
  })
  queryData.where.push({
    type: 'tag',
    key,
    op: '<=',
    val: to
  })
}

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  url: string
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings)
    this.url = instanceSettings.url || ''
    const { token } = instanceSettings.jsonData
    // @ts-ignore
    const test = (method: string, url, params, headers) => {
      const data = _.omit(params, 'requestId')
      const requestIdSetting = _.pick(params, 'requestId')
      const f = () => {
        const debugOnOff = getParamByName('debug') === 'true'
        const fetchOption = {
          method,
          url: `${this.url}${token ? '/auth/api/querier' : '/noauth'}/v1/query/${debugOnOff ? '?debug=true' : ''}`,
          data: qs.stringify(data),
          headers,
          responseType: 'text',
          ...requestIdSetting
        } as BackendSrvRequest
        return getBackendSrv()
          .fetch(fetchOption)
          .toPromise()
          .then((res: any) => {
            return JSON.parse(
              res.data.replace(/[\[\,]["]?[+-]?\d+(\.\d+)?e[+-]\d+["]?/g, (a: any) => {
                const str = a.substring(1)
                return str.startsWith('"') ? a : `${a[0]}"${str}"`
              })
            )
          })
      }
      f.cancel = () => {}
      return f
    }
    // @ts-ignore
    querierJs.setCreateReqFunc(test)

    DATA_SOURCE_SETTINGS.basicUrl = this.url
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range } = options
    const from = range!.from.unix()
    const to = range!.to.unix()
    QUERY_DATA_CACHE.time_start = from
    QUERY_DATA_CACHE.time_end = to

    const data = await Promise.all(
      options.targets.map(async target => {
        if (target.hide || !target.queryText) {
          return []
        }
        const queryText = replaceInterval(target.queryText, options)
        const queryData = JSON.parse(queryText) as any
        setTimeKey(queryData, {
          from,
          to
        })
        // @ts-ignore
        await querierJs.loadOP()
        // @ts-ignore
        await querierJs.loadTableConfig(queryData.from, queryData.db)
        if (queryData.appType === 'appTracingFlame') {
          const _id = queryData.tracingId.value
          if (!_id) {
            return []
          }
          const result: any = await this.getFlameData({
            _id
          })
          if ('message' in result || 'statusText' in result) {
            throw result
          }
          const frame = new MutableDataFrame({
            refId: target.refId,
            fields: [
              ...Object.keys(result).map((key: string) => {
                return {
                  name: key,
                  type: FieldType.other
                }
              })
            ]
          })
          frame.add(result)
          return [frame]
        }
        const parsedQueryData = parseQueryStr(queryData)
        let querierJsResult
        try {
          // @ts-ignore
          querierJsResult = querierJs.dfQuery(_.cloneDeep(parsedQueryData))
        } catch (error: any) {
          console.log(error)
          throw new Error(error.message)
        }

        const { returnTags, returnMetrics, sql } = querierJsResult.resource[0]
        const returnMetricNames = returnMetrics.map((metric: any) => {
          return metric.name
        })

        // @ts-ignore
        let response = await querierJs.searchBySql(sql, queryData.db, params => {
          return {
            ...params,
            ...(queryData.sources
              ? {
                  datasource: queryData.sources
                }
              : {})
          }
        })
        // @ts-ignore
        response = querierJs.addResourceFieldsInData(response)

        const firstResponse = response[0] || []
        const keys = Object.keys(firstResponse)
        const tagKeys: string[] = []
        const timeKeys: string[] = []
        const metricKeys: string[] = []

        keys.forEach((key: string) => {
          const isMetric = returnMetricNames.includes(key)
          if (isMetric) {
            metricKeys.push(key)
          } else if (key.includes('time')) {
            timeKeys.push(key)
          } else {
            tagKeys.push(key)
          }
        })

        let timeTypeKey: string
        response.forEach((item: any) => {
          Object.keys(item).forEach((key: any) => {
            if (timeKeys.includes(key) && typeof item[key] === 'number') {
              timeTypeKey = key
              item[key] = item[key] * 1000
            }
          })
        })
        const usingGroupBy = sql.includes('group by') && queryData.formatAs === 'timeSeries'
        const meta = {
          custom: {
            returnTags: returnTags
              .filter((e: any) => {
                return !e.name.includes('time')
              })
              .map((e: any) => {
                return {
                  ...e,
                  name: e.name.replace(/'/g, '')
                }
              }),
            returnMetrics,
            ...(queryData.appType === 'accessRelationship' ? getAccessRelationshipeQueryConfig(queryData.groupBy) : {})
          }
        }
        if (!usingGroupBy) {
          const a = new MutableDataFrame({
            refId: target.refId,
            fields: [
              ...Object.keys(firstResponse).map((key: string) => {
                let type
                if (timeKeys.includes(key) && typeof firstResponse[key] === 'number') {
                  type = FieldType.time
                } else {
                  type =
                    returnMetricNames.includes(key) &&
                    returnMetrics.find((e: any) => {
                      return e.name === key
                    })?.type !== MAP_METRIC_TYPE_NUM
                      ? FieldType.number
                      : FieldType.string
                }
                return {
                  name: key,
                  type: type
                }
              })
            ],
            meta
          })
          response.forEach((e: any) => {
            a.add(e)
          })
          return a
        }
        let dataAfterGroupBy = _.groupBy(response, item => {
          return tagKeys
            .map(key => {
              return item[key]
            })
            .join('，')
        })

        const frameArray: any = []
        _.forIn(dataAfterGroupBy, item => {
          item = _.sortBy(item, [timeTypeKey])
          const aliasName = getMetricFieldNameByAlias(queryData.alias, _.get(item, [0], {}))
          const keyPrefix =
            aliasName ||
            tagKeys
              .filter((key: string) => !key.includes('_id'))
              .map((key: string) => {
                return item[0][key]
              })
              .join('，')

          const frame = new MutableDataFrame({
            refId: target.refId,
            fields: [
              ...Object.keys(firstResponse).map((key: string) => {
                let type
                if (timeKeys.includes(key) && typeof firstResponse[key] === 'number') {
                  type = FieldType.time
                } else {
                  type = returnMetricNames.includes(key) ? FieldType.number : FieldType.string
                }

                if (!returnMetricNames.includes(key)) {
                  return {
                    name: key,
                    type: type
                  }
                }
                return {
                  name: `${keyPrefix}${keyPrefix ? '-' : ''}${key}`,
                  type: type
                }
              })
            ],
            meta
          })
          item.forEach((e, i) => {
            _.forIn(e, (val, key) => {
              if (returnMetricNames.includes(key)) {
                const keyName = `${keyPrefix}${keyPrefix ? '-' : ''}${key}`
                e[keyName] = val
              }
            })
            frame.add(e)
          })
          frameArray.push(frame)
        })

        return frameArray
      })
    )
      .then(dts => {
        return dts.reduce((pre, cur) => {
          if (_.isArray(cur)) {
            return pre.concat(cur)
          } else {
            pre.push(cur)
            return pre
          }
        }, [])
      })
      .catch((e: any) => {
        throw e
      })

    return { data }
  }

  async testDatasource() {
    try {
      // @ts-ignore
      await querierJs.getDatabases()
      return {
        status: 'success',
        message: 'Success'
      }
    } catch (error) {
      return {
        status: 'error',
        message: 'Error'
      }
    }
  }

  async getFlameData({ _id }: { _id: string }) {
    try {
      const { time_start, time_end } = QUERY_DATA_CACHE
      const data = {
        _id: _id.replace('#', ''),
        DATABASE: 'flow_log',
        TABLE: 'l7_flow_log',
        MAX_ITERATION: 30,
        NETWORK_DELAY_US: 3000000,
        time_end,
        time_start
      }
      const debugOnOff = getParamByName('debug') === 'true'
      const { services, tracing } = await getBackendSrv()
        .fetch({
          method: 'POST',
          url: `${DATA_SOURCE_SETTINGS.basicUrl}/trace/v1/stats/querier/L7FlowTracing${
            debugOnOff ? '?debug=true' : ''
          }`,
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': '1',
            'X-User-Type': '1'
          },
          data
        })
        .toPromise()
        .then((res: any) => {
          return res?.data?.DATA || {}
        })
      if (!services || !tracing) {
        throw new Error('No data')
      }
      const detailList: Record<any, any> = {}
      if (Array.isArray(services) && services.length) {
        // @ts-ignore
        const { metrics, tags } = await querierJs.loadTableConfig('l7_flow_log', 'flow_log')
        const JSON_TAGS: Array<{
          category: string
          groupName: string
        }> = tags
          .filter((e: any) => {
            return e.type === MAP_TAG_TYPE
          })
          .map((e: any) => {
            return {
              category: e.category,
              groupName: e.name
            }
          })

        const _tags = tags
          .map((item: any) => {
            const isJSONTag = JSON_TAGS.find(jsonTag => {
              return item.category === jsonTag.category
            })
            const isMainJSONTag = JSON_TAGS.find(jsonTag => {
              return item.name === jsonTag.groupName
            })
            if (SELECT_GROUP_BY_DISABLE_TAGS.includes(item.name) || (isJSONTag && !isMainJSONTag)) {
              return []
            }
            const { name, client_name, server_name, category } = item
            if ((name === client_name && name === server_name) || (!client_name && !server_name)) {
              return {
                category,
                value: item.name,
                isJSONTag
              }
            }
            return [
              ...(item.client_name
                ? [
                    {
                      category: isJSONTag ? `客户端${category}` : category,
                      value: item.client_name,
                      isJSONTag
                    }
                  ]
                : []),
              ...(item.server_name
                ? [
                    {
                      category: isJSONTag ? `服务端${category}` : category,
                      value: item.server_name,
                      isJSONTag
                    }
                  ]
                : [])
            ]
          })
          .flat(Infinity)
        const JSON_METRICS: Array<{
          category: string
          groupName: string
        }> = metrics
          .filter((e: any) => {
            return e.type === MAP_METRIC_TYPE_NUM
          })
          .map((e: any) => {
            return {
              category: e.category,
              groupName: e.name
            }
          })

        const sqlData = {
          format: 'sql',
          db: 'flow_log',
          tableName: 'l7_flow_log',
          selects: {
            TAGS: _tags.map((e: any) => {
              return e.value
            }),
            METRICS: metrics
              .filter((e: any) => {
                const isJSONMetirc = JSON_METRICS.find(jsonTag => {
                  return e.category === jsonTag.category
                })
                const isMainJSONMetric = JSON_METRICS.find(jsonTag => {
                  return e.name === jsonTag.groupName
                })
                const isSubJSONMetric = isJSONMetirc && !isMainJSONMetric
                return e.type !== TAG_METRIC_TYPE_NUM && !isSubJSONMetric
              })
              .map((e: any) => {
                return e.name
              })
          },
          conditions: {
            RESOURCE_SETS: [
              {
                id: '0',
                isForbidden: false,
                condition: [
                  {
                    type: 'tag',
                    op: 'OR',
                    val: tracing
                      .map((e: any) => e._ids)
                      .flat(Infinity)
                      .map((e: any) => {
                        return {
                          key: '_id',
                          op: '=',
                          val: e
                        }
                      })
                  }
                ]
              }
            ]
          },
          orderBy: ['start_time']
        }
        // @ts-ignore
        const querierJsResult = querierJs.dfQuery(sqlData)
        const { returnMetrics, sql } = querierJsResult.resource[0]
        // @ts-ignore
        const response = await querierJs.searchBySql(sql, 'flow_log')

        const tagsGroupbyCategory = _.groupBy(_tags, 'category')
        const tagCategoryKeys = Object.keys(tagsGroupbyCategory)
        response.forEach((e: any) => {
          let JSONMetrics = {}
          const item = tagCategoryKeys
            .map((tagCate: any) => {
              const isJSONTag = tagsGroupbyCategory[tagCate][0].isJSONTag
              let tags = []
              let resData: Record<any, any>
              if (isJSONTag) {
                const tagValue = tagsGroupbyCategory[tagCate][0]['value']
                resData = JSON.parse(e[tagValue] === '' ? '{}' : e[tagValue])
                tags = Object.keys(resData).map(attr => {
                  return { category: tagCate, value: attr }
                })
              } else {
                tags = tagsGroupbyCategory[tagCate]
                resData = e
              }
              return [
                tagCate || 'N/A',
                Object.fromEntries(
                  tags.map(tagObj => {
                    const tag = `${tagObj.value}`

                    return [tag, resData[tag]?.toString() ? resData[tag].toString() : resData[tag]]
                  })
                )
              ]
            })
            .concat([
              [
                'metrics',
                {
                  ...Object.fromEntries(
                    returnMetrics
                      .map((metric: any) => {
                        const key = metric.name
                        const type = metric.type
                        const unit = metric.unit
                        const val = e[key]

                        if (type === MAP_METRIC_TYPE_NUM) {
                          const _vals = JSON.parse(val || {})
                          JSONMetrics = {
                            ...JSONMetrics,
                            ..._vals
                          }
                          return undefined
                        }
                        if (type === 3) {
                          return [key, formatUsUnit(val)]
                        }
                        const valAfterFormat = numberToShort(val)
                        return [key, `${valAfterFormat}${valAfterFormat !== null && valAfterFormat !== '' ? unit : ''}`]
                      })
                      .filter((e: undefined | any[]) => !!e)
                  ),
                  ...JSONMetrics
                }
              ]
            ])
          detailList[e._id.toString()] = Object.fromEntries(item)
        })
      }
      // @ts-ignore
      const l7ProtocolValuesMap = await querierJs.getL7ProtocolValuesMap()
      return {
        services: services,
        tracing: tracing.map((e: any) => {
          const _l7_protocol = [0, 1].includes(e.l7_protocol)
            ? ''
            : _.get(l7ProtocolValuesMap, [e.l7_protocol, 'display_name'], e.l7_protocol)
          return {
            ...e,
            _l7_protocol
          }
        }),
        detailList
      }
    } catch (error) {
      console.log(error)
      return error
    }
  }

  async metricFindQuery(query: MyVariableQuery, options?: any) {
    const { database, sql, useDisabled, useAny } = query
    if (!database || !sql) {
      return []
    }
    // @ts-ignore
    const response = await querierJs.searchBySql(sql, database)
    const extra = []
    if (useDisabled) {
      extra.push({
        value: '__disabled',
        text: 'Disabled'
      })
    }
    if (useAny) {
      extra.push({
        value: '__any',
        text: 'Any'
      })
    }
    return extra.concat(
      Array.isArray(response)
        ? response.map((e: any) => {
            return {
              value: e.value,
              text: e.display_name
            }
          })
        : []
    )
  }
}
