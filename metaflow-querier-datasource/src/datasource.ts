import _ from 'lodash'
import * as JSONbig from 'json-bigint'
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
import parseQueryStr from './utils/parseQueryStr'
import * as querierJs from 'querier-js'
import qs from 'qs'

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
        return getBackendSrv()
          .fetch({
            method,
            url: this.url + (token ? '/auth/api/querier' : '/noauth') + '/v1/query/',
            data: qs.stringify(params),
            headers,
            responseType: 'text'
          })
          .toPromise()
          .then((res: any) => {
            return JSONbig.parse(res.data)
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

    let data = await Promise.all(
      options.targets.map(async target => {
        if (target.hide || !target.queryText) {
          return []
        }
        const queryData = JSON.parse(target.queryText) as any
        setTimeKey(queryData, {
          from,
          to
        })
        // @ts-ignore
        await querierJs.loadOP()
        // @ts-ignore
        await querierJs.loadTableConfig(queryData.from)
        const parsedQueryData = parseQueryStr(queryData)
        let querierJsResult
        try {
          // @ts-ignore
          querierJsResult = querierJs.dfQuery(_.cloneDeep(parsedQueryData))
        } catch (error: any) {
          console.log(error)
          throw new Error(error.message)
        }

        const { returnMetrics, sql } = querierJsResult.resource[0]
        const returnMetricNames = returnMetrics.map((metric: any) => {
          return metric.name
        })

        // @ts-ignore
        let response = await querierJs.searchBySql(sql)

        if (!response || !response.length) {
          return []
        }

        let timeTypeKey: string
        response.forEach((item: any) => {
          Object.keys(item).forEach((key: any) => {
            if (key.includes('time') && typeof item[key] === 'number') {
              timeTypeKey = key
              item[key] = +new Date(item[key] * 1000)
            }
          })
        })

        const keys = Object.keys(response[0]).filter((key: string) => !key.includes('_id'))
        const tagKeys: string[] = []
        const timeKeys: string[] = []
        const metricKeys: string[] = []

        keys.forEach((key: string) => {
          const isMetric = returnMetricNames.includes(key)
          if (key.includes('time')) {
            timeKeys.push(key)
          } else if (isMetric) {
            metricKeys.push(key)
          } else {
            tagKeys.push(key)
          }
        })
        const isUseGroupBy = sql.includes('group by') && queryData.resultGroupBy

        if (!isUseGroupBy) {
          return [response]
        }
        const dataAfterGroupBy = _.groupBy(response, item => {
          return tagKeys
            .map(key => {
              return item[key]
            })
            .join('，')
        })
        const frameArray: any = []
        _.forIn(dataAfterGroupBy, (item, groupByKey) => {
          item = _.sortBy(item, [timeTypeKey])

          const first = item[0]
          const frame = new MutableDataFrame({
            refId: target.refId,
            fields: [
              ...Object.keys(first).map((key: string) => {
                let type
                if (key.includes('time') && typeof first[key] === 'number') {
                  type = FieldType.time
                } else {
                  type = returnMetricNames.includes(key) && _.isNumber(first[key]) ? FieldType.number : FieldType.string
                }

                return {
                  name: returnMetricNames.includes(key) ? `${groupByKey}${groupByKey ? '-' : ''}${key}` : key,
                  type: type
                }
              })
            ]
          })
          item.forEach((e, i) => {
            _.forIn(e, (val, key) => {
              if (returnMetricNames.includes(key)) {
                e[`${groupByKey}${groupByKey ? '-' : ''}${key}`] = val
              }
            })
            frame.add(e)
          })
          frameArray.push(frame)
        })

        return frameArray
      })
    ) // 返回的可能是 dataframe 或者 array<dataframe>
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
      const { services, tracing } = await getBackendSrv()
        .fetch({
          method: 'POST',
          url: `${DATA_SOURCE_SETTINGS.basicUrl}/trace/v1/stats/querier/L7FlowTracing`,
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

      let detailList = []
      if (Array.isArray(services) && services.length) {
        const SELECT = [
          "newTag('R1-R1') as query_id",
          "response_duration AS 'response_duration'",
          '_id',
          'start_time',
          'l7_protocol',
          'request_type',
          'request_domain',
          'request_resource',
          'response_status',
          'response_code',
          'response_exception',
          'tap_side',
          "node_type(resource_gl0_0) AS 'client_node_type'",
          "node_type(resource_gl0_0) AS 'resource_gl0_0_node_type'",
          "icon_id(resource_gl0_0) AS 'client_icon_id'",
          "icon_id(resource_gl0_0) AS 'resource_gl0_0_icon_id'",
          'resource_gl0_type_0',
          'ip_0',
          "node_type(resource_gl0_1) AS 'server_node_type'",
          "node_type(resource_gl0_1) AS 'resource_gl0_1_node_type'",
          "icon_id(resource_gl0_1) AS 'server_icon_id'",
          "icon_id(resource_gl0_1) AS 'resource_gl0_1_icon_id'",
          'resource_gl0_type_1',
          'ip_1',
          'resource_gl0_0',
          'resource_gl0_1',
          'resource_gl0_id_0',
          'resource_gl0_id_1'
        ].join(',')
        const WHERE = tracing
          .map((e: any) => {
            return e._ids.map((id: string) => {
              return `_id='${id}'`
            })
          })
          .flat(Infinity)
          .join(' OR ')
        const detailPostData = {
          PAGE_INDEX: 1,
          PAGE_SIZE: services.length,
          SORT: {
            ORDER_BY: 'start_time',
            SORTED_BY: 'ASC'
          },
          DATABASE: 'flow_log',
          TABLE: 'l7_flow_log',
          QUERIES: [
            {
              QUERY_ID: 'R1-R1',
              WHERE,
              SELECT
            }
          ],
          time_end,
          time_start
        }
        detailList = await getBackendSrv()
          .fetch({
            method: 'POST',
            url: `${DATA_SOURCE_SETTINGS.basicUrl}/trace/v1/stats/querier/FlowLogDetailList`,
            headers: {
              'Content-Type': 'application/json',
              'X-User-Id': '1',
              'X-User-Type': '1'
            },
            data: detailPostData
          })
          .toPromise()
          .then((res: any) => {
            return res.data.DATA
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
      throw error
    }
  }
}
