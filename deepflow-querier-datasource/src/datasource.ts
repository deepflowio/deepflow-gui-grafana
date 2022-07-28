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
import { getBackendSrv } from '@grafana/runtime'
import parseQueryStr, { replaceInterval } from './utils/parseQueryStr'
import * as querierJs from 'deepflow-sdk-js'
import qs from 'qs'
import 'json-bigint-patch'
import { MyVariableQuery } from 'components/VariableQueryEditor'
import { getAccessRelationshipeQueryConfig, getMetricFieldNameByAlias, getParamByName } from 'utils/tools'
import { SELECT_GROUP_BY_DISABLE_TAGS } from 'QueryEditor'

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
    const test = (method, url, params, headers) => {
      const f = () => {
        const debugOnOff = getParamByName('debug') === 'true'
        return getBackendSrv()
          .fetch({
            method,
            url: `${this.url}${token ? '/auth/api/querier' : '/noauth'}/v1/query/${debugOnOff ? '?debug=true' : ''}`,
            data: qs.stringify(params),
            headers,
            responseType: 'text'
          })
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

    const queryConfig: any = {}
    let data = await Promise.all(
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
        queryConfig[target.refId] = {
          returnTags,
          returnMetrics,
          ...(queryData.appType === 'accessRelationship' ? getAccessRelationshipeQueryConfig(queryData.groupBy) : {})
        }

        const firstResponse = response[0] || []
        const keys = Object.keys(firstResponse).filter((key: string) => !key.includes('_id'))
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

        if (!usingGroupBy) {
          const a = new MutableDataFrame({
            refId: target.refId,
            fields: [
              ...Object.keys(firstResponse).map((key: string) => {
                let type
                if (timeKeys.includes(key) && typeof firstResponse[key] === 'number') {
                  type = FieldType.time
                } else {
                  type = returnMetricNames.includes(key) ? FieldType.number : FieldType.string
                }
                return {
                  name: key,
                  type: type
                }
              })
            ]
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
        _.forIn(dataAfterGroupBy, (item, groupByKey) => {
          item = _.sortBy(item, [timeTypeKey])
          const aliasName = getMetricFieldNameByAlias(queryData.alias, firstResponse)
          const keyPrefix = aliasName || groupByKey

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
            ]
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

    QUERY_DATA_CACHE['config'] = queryConfig
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

      let detailList: Record<any, any> = {}
      if (Array.isArray(services) && services.length) {
        // @ts-ignore
        const { metrics, tags } = await querierJs.loadTableConfig('l7_flow_log', 'flow_log')
        const _tags = tags
          .filter((e: any) => {
            return (
              !SELECT_GROUP_BY_DISABLE_TAGS.includes(e.name) &&
              (e.category !== '原始Attribute' || e.name === 'attributes')
            )
          })
          .map((item: any) => {
            const { name, client_name, server_name, category } = item
            if ((name === client_name && name === server_name) || (!client_name && !server_name)) {
              return {
                category,
                value: item.name
              }
            }
            return [
              ...(item.client_name
                ? [
                    {
                      category,
                      value: item.client_name
                    }
                  ]
                : []),
              ...(item.server_name
                ? [
                    {
                      category,
                      value: item.server_name
                    }
                  ]
                : [])
            ]
          })
          .flat(Infinity)
        const sqlData = {
          format: 'sql',
          db: 'flow_log',
          tableName: 'l7_flow_log',
          selects: {
            TAGS: _tags.map((e: any) => {
              return e.value
            }),
            METRICS: metrics.map((e: any) => {
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

        const tagCategory = _.groupBy(_tags, 'category')
        const tagCategoryKeys = Object.keys(tagCategory)
        response.forEach((e: any) => {
          const item = tagCategoryKeys
            .map((tagCate: any) => {
              const tags =
                tagCate === '原始Attribute'
                  ? Object.keys(JSON.parse(e.attributes)).map(attr => {
                      return { category: '原始Attribute', value: attr }
                    })
                  : tagCategory[tagCate]
              const item = tagCate === '原始Attribute' ? JSON.parse(e.attributes) : e
              return [
                tagCate || 'N/A',
                Object.fromEntries(
                  tags.map((tagObj: any) => {
                    const tag = `${tagObj.value}`
                    return [tag, item[tag]?.toString() ? item[tag].toString() : item[tag]]
                  })
                )
              ]
            })
            .concat([
              [
                'metrics',
                Object.fromEntries(
                  returnMetrics.map((metricObj: any) => {
                    const metric = `${metricObj.name}`
                    return [metric, e[metric]]
                  })
                )
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
          const _l7_protocol = _.get(l7ProtocolValuesMap, [e.l7_protocol, 'display_name'], e.l7_protocol)
          return {
            ...e,
            _l7_protocol
          }
        }),
        detailList
      }
    } catch (error) {
      console.log(error)
      return new Error('aaa')
      throw error
    }
  }

  getQueryConfig(refId?: string) {
    if (!refId) {
      return QUERY_DATA_CACHE['config']
    }
    const { returnTags } = QUERY_DATA_CACHE['config'][refId] || {}
    const _returnTags = returnTags
      ? returnTags
          .filter(e => {
            return !e.name.includes('time')
          })
          .map(e => {
            return {
              ...e,
              name: e.name.replace(/'/g, '')
            }
          })
      : []
    return {
      ...(QUERY_DATA_CACHE['config'][refId] || {}),
      returnTags: _returnTags
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
        text: '__disabled'
      })
    }
    if (useAny) {
      extra.push({
        value: '__any',
        text: '__any'
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
