/* eslint-disable no-console */
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
import { DATA_SOURCE_SETTINGS, QUERY_DATA_CACHE, SQL_CACHE } from 'utils/cache'
import { BackendSrvRequest, getBackendSrv, getTemplateSrv } from '@grafana/runtime'
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
  isEnumLikelyTag,
  numberToShort
} from 'utils/tools'
import { ID_PREFIX, MAP_METRIC_TYPE_NUM, MAP_TAG_TYPE, SELECT_GROUP_BY_DISABLE_TAGS, TAG_METRIC_TYPE_NUM } from 'consts'
import { getI18NLabelByName } from 'utils/i18n'

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
        _.set(SQL_CACHE, options.requestId, '')
        if (target.hide || !target.queryText) {
          return []
        }
        const queryText = replaceInterval(target.queryText, options)
        const queryData = JSON.parse(queryText) as any
        setTimeKey(queryData, {
          from,
          to
        })
        if (DATA_SOURCE_SETTINGS.language === '') {
          // @ts-ignore
          const langConfig = await querierJs.searchBySql('show language')
          DATA_SOURCE_SETTINGS.language = _.get(langConfig, [0, 'language']).includes('ch') ? 'zh-cn' : 'en-us'
        }
        // @ts-ignore
        await querierJs.loadOP()
        // @ts-ignore
        await querierJs.loadTableConfig(queryData.from, queryData.db)
        if (queryData.appType === 'appTracingFlame') {
          const _id = queryData.tracingId.value
          if (!_id) {
            return []
          }
          window.useTimeLogs && console.time('[Time Log][Querier: Get flame data]')
          const result: any = await this.getFlameData({
            _id,
            time_start: from,
            time_end: to
          })
          window.useTimeLogs && console.timeEnd('[Time Log][Querier: Get flame data]')
          if ('message' in result || 'statusText' in result) {
            throw result
          }
          window.useTimeLogs && console.time('[Time Log][Querier: Format flame data]')
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
          window.useTimeLogs && console.timeEnd('[Time Log][Querier: Format flame data]')
          return [frame]
        }
        const parsedQueryData = parseQueryStr(queryData, options.scopedVars)
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
        _.set(SQL_CACHE, options.requestId, sql)

        window.useTimeLogs && console.time(`[Time Log][Querier: Get data] ${options.requestId}`)
        // @ts-ignore
        let response = await querierJs.searchBySql(sql, queryData.db, params => {
          return {
            ...params,
            ...(queryData.sources
              ? {
                  data_precision: queryData.sources
                }
              : {})
          }
        })
        window.useTimeLogs && console.timeEnd(`[Time Log][Querier: Get data] ${options.requestId}`)
        window.useTimeLogs && console.time('[Time Log][Querier: Format data]')
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
          if ('toString(_id)' in item) {
            item['_id'] = `${ID_PREFIX}${item['toString(_id)']}`
            delete item['toString(_id)']
          }
        })
        const usingGroupBy = sql.includes('group by') && queryData.formatAs === 'timeSeries'
        const customReturnTags = returnTags
          .filter((e: any) => {
            return !e.name.includes('time')
          })
          .map((e: any) => {
            return {
              ...e,
              name: e.name.replace(/'/g, '')
            }
          })
        const meta = {
          custom: {
            returnTags: customReturnTags,
            returnMetrics,
            ...(queryData.appType === 'accessRelationship'
              ? getAccessRelationshipeQueryConfig(queryData.groupBy, customReturnTags)
              : {})
          }
        }
        if (!usingGroupBy) {
          const frame = new MutableDataFrame({
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
            frame.add(e)
          })
          window.useTimeLogs && console.timeEnd('[Time Log][Querier: Format data]')
          return frame
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

          let _showMetrics: boolean
          switch (queryData.showMetrics) {
            case 0:
              _showMetrics = false
              break
            case 1:
              _showMetrics = true
              break
            case -1:
            default:
              _showMetrics = returnMetrics.length > 1
              break
          }
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
                  name: [keyPrefix || '*', ...(_showMetrics ? [key] : [])].join('-'),
                  type: type
                }
              })
            ],
            meta
          })
          item.forEach((_e, i) => {
            const e = _.cloneDeep(_e)
            _.forIn(e, (val, key) => {
              if (returnMetricNames.includes(key)) {
                const keyName = [keyPrefix || '*', ...(_showMetrics ? [key] : [])].join('-')
                e[keyName] = val
              }
            })
            frame.add(e)
          })
          frameArray.push(frame)
        })

        window.useTimeLogs && console.timeEnd('[Time Log][Querier: Format data]')
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

  async getFlameData({ _id, time_start, time_end }: { _id: string; time_start: number; time_end: number }) {
    try {
      const data = {
        _id: _id.replace(ID_PREFIX, ''),
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

      const translateTags = ['l7_protocol', 'response_status', 'tap_side']
      const tagValMaps: Record<string, any> = {}
      for (let i = 0; i < translateTags.length; i++) {
        const tag = translateTags[i]
        // @ts-ignore
        const res = await querierJs.getTagValues(tag, 'l7_flow_log', 'flow_log')
        tagValMaps[tag] = _.keyBy(res, 'value')
      }

      const detailList: Record<any, any> = {}
      if (Array.isArray(tracing) && tracing.length) {
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
          .map((e: any) => {
            const isEnumLikely = isEnumLikelyTag(e)
            const isJSONTag = JSON_TAGS.find(jsonTag => {
              return e.category === jsonTag.category
            })
            const isMainJSONTag = JSON_TAGS.find(jsonTag => {
              return e.name === jsonTag.groupName
            })
            if (SELECT_GROUP_BY_DISABLE_TAGS.includes(e.name) || (isJSONTag && !isMainJSONTag)) {
              return []
            }
            const { name, client_name, server_name, category } = e
            if ((name === client_name && name === server_name) || (!client_name && !server_name)) {
              return {
                category,
                value: e.name,
                isJSONTag,
                isEnumLikely
              }
            }
            return [
              ...(e.client_name
                ? [
                    {
                      category: isJSONTag ? `${category} - ${getI18NLabelByName('client')}` : category,
                      value: e.client_name,
                      isJSONTag,
                      isEnumLikely
                    }
                  ]
                : []),
              ...(e.server_name
                ? [
                    {
                      category: isJSONTag ? `${category} - ${getI18NLabelByName('server')}` : category,
                      value: e.server_name,
                      isJSONTag,
                      isEnumLikely
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
              if (e.isEnumLikely) {
                return {
                  func: 'Enum',
                  key: e.value
                }
              }
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

        const tagsGroupbyCategory = _.groupBy(
          _tags.map((e: any) => {
            return {
              ...e,
              value: e.isEnumLikely ? `Enum(${e.value})` : e.value
            }
          }),
          'category'
        )
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
                'Metrics',
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
                        return [
                          key,
                          valAfterFormat !== undefined && valAfterFormat !== null && valAfterFormat !== ''
                            ? `${valAfterFormat}${unit}`
                            : valAfterFormat
                        ]
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
      return {
        services: services,
        tracing: tracing.map((e: any) => {
          return {
            ...e,
            ...Object.fromEntries(
              Object.keys(tagValMaps).map(tag => {
                if (tag === 'l7_protocol' && [0, 1].includes(e[tag])) {
                  return [`Enum(${tag})`, '']
                }
                return [`Enum(${tag})`, _.get(tagValMaps[tag], [e[tag], 'display_name'], e[tag])]
              })
            )
          }
        }),
        detailList
      }
    } catch (error) {
      console.log(error)
      return {
        services: [],
        tracing: [],
        detailList: []
      }
    }
  }

  async getFlameRelatedData(_ids: string[]) {
    try {
      const TAGS = [
        {
          func: 'Enum',
          key: 'type'
        },
        {
          func: 'Enum',
          key: 'l7_protocol'
        },
        'request_id',
        'syscall_cap_seq_0',
        'syscall_cap_seq_1',
        'flow_id',
        'vtap',
        'tap_port_type',
        'tap_port',
        'start_time',
        'end_time'
      ]
      // @ts-ignore
      await querierJs.loadTableConfig('l7_flow_log', 'flow_log')

      const sqlData = {
        format: 'sql',
        db: 'flow_log',
        tableName: 'l7_flow_log',
        selects: {
          TAGS,
          METRICS: []
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
                  val: _ids.map((e: any) => {
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
      const { sql } = querierJsResult.resource[0]
      // @ts-ignore
      const response = await querierJs.searchBySql(sql, 'flow_log')
      return response.map((e: any) => _.omit(e, 'vtap_id'))
    } catch (error) {
      console.log(error)
      return error
    }
  }

  async metricFindQuery(query: MyVariableQuery, options?: any) {
    const { database, sql, datasource, useDisabled, useAny } = query
    if (!database || !sql) {
      return []
    }

    const _sql = getTemplateSrv().replace(sql, {}, 'csv')
    // @ts-ignore
    const response = await querierJs.searchBySql(_sql, database, params => {
      return {
        ...params,
        ...(datasource
          ? {
              datasource
            }
          : undefined)
      }
    })
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
