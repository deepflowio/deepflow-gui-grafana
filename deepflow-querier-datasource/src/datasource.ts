import { DataQueryRequest, DataQueryResponse, DataSourceInstanceSettings, ScopedVars } from '@grafana/data'

import { MyQuery, MyDataSourceOptions } from './types'
import {
  BackendDataSourceResponse,
  BackendSrvRequest,
  DataSourceWithBackend,
  getBackendSrv,
  getTemplateSrv,
  toDataQueryResponse
} from '@grafana/runtime'
import qs from 'qs'
import {
  addTimeToWhere,
  getAccessRelationshipeQueryConfig,
  getParamByName,
  getTracingId,
  getTracingQuery
} from 'utils/tools'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import { genQueryParams, replaceInterval } from 'utils/genQueryParams'
import { DATA_SOURCE_SETTINGS, SQL_CACHE } from 'utils/cache'
import { MyVariableQuery } from 'components/VariableQueryEditor'
import { Observable, of, zip } from 'rxjs'
import { catchError, switchMap } from 'rxjs/operators'
import { APPTYPE_APP_TRACING_FLAME } from 'consts'

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
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
  }

  query(request: DataQueryRequest<MyQuery>): Observable<DataQueryResponse> {
    const promisesList = [
      // @ts-ignore
      querierJs.loadOP()
    ]
    let languageConfigIndex = -1
    if (DATA_SOURCE_SETTINGS.language === '') {
      // @ts-ignore
      promisesList.push(querierJs.searchBySql('show language'))
      languageConfigIndex = promisesList.length
    }
    const basicPromisesLen = promisesList.length
    const { intervalMs, maxDataPoints, targets, range, requestId } = request
    let tracingQueryIndex = -1
    const _targets = targets.filter(q => {
      return !!q.queryText
    })
    let hasAddedTracingConfig = false
    _targets.forEach(q => {
      const queryData = JSON.parse(q.queryText)
      const { appType, from, db } = queryData
      if (!hasAddedTracingConfig && appType === APPTYPE_APP_TRACING_FLAME) {
        hasAddedTracingConfig = true
        tracingQueryIndex = promisesList.length
        _.set(q, ['_id'], getTracingId(queryData.tracingId))
      }
      // @ts-ignore
      promisesList.push(querierJs.loadTableConfig(from, db))
    })

    return zip(promisesList).pipe(
      switchMap(res => {
        if (languageConfigIndex !== -1) {
          // @ts-ignore
          DATA_SOURCE_SETTINGS.language = _.get(res, [1, 0, 'language'], '').includes('ch') ? 'zh-cn' : 'en-us'
        }

        const queries = _targets
          .map((q, i) => {
            q.isQuery = true
            const { type, uid } = this
            const datasource =
              typeof this.getRef === 'function'
                ? this.getRef()
                : {
                    type,
                    uid
                  }
            const datasourceId = this.id
            if (tracingQueryIndex !== -1 && i === tracingQueryIndex - basicPromisesLen) {
              const tracingQuery = getTracingQuery(res[tracingQueryIndex])
              q = {
                ...q,
                ...tracingQuery
              }
            }
            return {
              ...this.applyTemplateVariables(q, request.scopedVars),
              datasource,
              datasourceId,
              intervalMs,
              maxDataPoints
            }
          })
          .filter(q => {
            // not appTrcaingFlame type or has no _id value
            return q._id === undefined || q._id !== ''
          })

        // no queries exist
        if (!queries.length) {
          return of({ data: [] })
        }
        const body: any = { queries }

        if (range) {
          body.range = range
          body.from = range.from.valueOf().toString()
          body.to = range.to.valueOf().toString()
        }
        return getBackendSrv()
          .fetch<BackendDataSourceResponse>({
            url: '/api/ds/query',
            method: 'POST',
            data: body,
            requestId
          })
          .pipe(
            switchMap(raw => {
              const rsp = toDataQueryResponse(raw, queries)
              return of(rsp)
            }),
            catchError(error => {
              return of(toDataQueryResponse(error))
            })
          )
      }),
      catchError(error => {
        console.log('@get config failed', error)
        return of(toDataQueryResponse(error))
      })
    )
  }

  applyTemplateVariables(query: MyQuery, scopedVars: ScopedVars): any {
    const _queryText = replaceInterval(query.queryText, scopedVars)
    const queryData = JSON.parse(_queryText)
    const result = {} as MyQuery
    // set new params after replaced variables
    if (queryData.appType !== APPTYPE_APP_TRACING_FLAME) {
      const parsedQueryData = genQueryParams(addTimeToWhere(queryData), scopedVars)
      // @ts-ignore
      const querierJsResult = querierJs.dfQuery(_.cloneDeep(parsedQueryData))
      const { returnTags, returnMetrics, sql } = querierJsResult.resource[0]
      _.set(SQL_CACHE, query.refId, sql)
      const metaExtra =
        queryData.appType === 'accessRelationship'
          ? getAccessRelationshipeQueryConfig(queryData.groupBy, returnTags)
          : {}

      result.returnTags = returnTags
      result.returnMetrics = returnMetrics
      result.sql = sql
      result.metaExtra = metaExtra
    }
    result.debug = getParamByName('debug') === 'true'

    return {
      ...query,
      ...result
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

  async metricFindQuery(query: MyVariableQuery) {
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
