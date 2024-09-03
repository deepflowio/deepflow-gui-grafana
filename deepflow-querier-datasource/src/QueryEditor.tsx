import React, { PureComponent } from 'react'
import { QueryEditorProps, VariableModel } from '@grafana/data'
import { DataSource } from './datasource'
import { MyDataSourceOptions, MyQuery } from './types'
import { Button, InlineField, Select, Input, Alert, getTheme, Icon, Tooltip } from '@grafana/ui'
import { BasicData, QueryEditorFormRow } from './components/QueryEditorFormRow'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import {
  formatTagOperators,
  genGetTagValuesSql,
  getRealKey,
  getAccessRelationshipQueryConfig,
  getParamByName,
  addTimeToWhere,
  uuid,
  queryCondsFilter
} from 'utils/tools'
import { getTemplateSrv } from '@grafana/runtime'
import {
  ALERTING_ALLOW_APP_TYPE,
  appTypeOpts,
  APP_TYPE,
  BasicDataWithId,
  defaultFormData,
  defaultFormDB,
  DISABLE_TAGS,
  formatAsOpts,
  formItemConfigs,
  FormTypes,
  GROUP_BY_DISABLE_TAG_TYPES,
  intervalOpts,
  MAP_METRIC_TYPE_NUM,
  MAP_TAG_TYPE,
  PCAP_TAG_TYPE,
  SELECT_GROUP_BY_DISABLE_TAGS,
  SERVICE_MAP_SUPPORTED,
  showMetricsOpts,
  ShowMetricsVal,
  SLIMIT_DEFAULT_VALUE,
  TAG_METRIC_TYPE_NUM,
  TIME_TAG_TYPE,
  VAR_INTERVAL_LABEL,
  PROFILING_SUPPORTED,
  PROFILING_REQUIRED_FIELDS
} from 'consts'
import { DATA_SOURCE_SETTINGS, getTagMapCache, SQL_CACHE } from 'utils/cache'
import { INPUT_TAG_VAL_TYPES, SELECT_TAG_VAL_OPS } from 'components/TagValueSelector'
import { TracingIdSelector } from 'components/TracingIdSelector'
import { format as sqlFormatter } from 'sql-formatter'
import './QueryEditor.css'
import { getI18NLabelByName } from 'utils/i18n'
import { genQueryParams, replaceIntervalAndVariables } from 'utils/genQueryParams'
import copy from 'copy-text-to-clipboard'

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>

export type LabelItem = {
  label: string
  value: string | number
  isVariable?: boolean
  variableType?: string
}

export type SelectOpts = LabelItem[]

export type SelectOptsWithStringValue = Array<
  LabelItem & {
    value: string
  }
>
export type FuncSelectOpts = Array<
  LabelItem & {
    paramCount: number
    support_metric_types: number[]
    is_support_other_operators: boolean
  }
>

type MetricOptsItem = LabelItem & {
  operatorOpts: LabelItem[]
  sideType?: 'from' | 'to'
  type?: string | number
  is_agg?: boolean
  whereOnly?: boolean
  fromSelect?: BasicDataWithId
  not_supported_operators?: string
}

export type MetricOpts = MetricOptsItem[]

interface FormConfigItem {
  label: string
  labelWidth: number
  targetDataKey: FormTypes
}
export class QueryEditor extends PureComponent<Props> {
  state: {
    formConfig: FormConfigItem[]
    databaseOpts: SelectOpts
    tableOpts: Array<LabelItem & { dataSources: null | string[] }>
    tagOpts: MetricOpts
    metricOpts: MetricOpts
    funcOpts: FuncSelectOpts
    subFuncOpts: SelectOptsWithStringValue
    appType: string
    db: string
    sources: string
    from: string
    select: BasicDataWithId[]
    where: BasicDataWithId[]
    having: BasicDataWithId[]
    groupBy: BasicDataWithId[]
    orderBy: BasicDataWithId[]
    interval: string
    slimit: string
    limit: string
    offset: string
    formatAs: 'timeSeries' | 'table' | ''
    alias: string
    showMetrics: ShowMetricsVal
    tracingId: LabelItem | null
    errorMsg: string
    showErrorAlert: boolean
    gotBasicData: boolean
    templateVariableOpts: SelectOpts
    runQueryWarning: boolean
    copied: boolean
    collapsed: boolean
  }
  constructor(props: any) {
    super(props)
    this.state = {
      formConfig: [
        {
          label: 'GROUP BY',
          labelWidth: 10,
          targetDataKey: 'groupBy'
        },
        {
          label: 'SELECT',
          labelWidth: 10,
          targetDataKey: 'select'
        },
        {
          label: 'WHERE',
          labelWidth: 10,
          targetDataKey: 'where'
        },
        {
          label: 'HAVING',
          labelWidth: 10,
          targetDataKey: 'having'
        },
        {
          label: 'ORDER BY',
          labelWidth: 10,
          targetDataKey: 'orderBy'
        }
      ],
      databaseOpts: [],
      tableOpts: [],
      tagOpts: [],
      metricOpts: [],
      funcOpts: [],
      subFuncOpts: [],
      appType: '',
      ...defaultFormDB,
      ...defaultFormData,
      tracingId: null,
      errorMsg: '',
      showErrorAlert: false,
      gotBasicData: false,
      templateVariableOpts: [],
      runQueryWarning: false,
      copied: false,
      collapsed: false
    }
  }

  get usingAlerting() {
    const usingAlerting = !!this.props.app?.includes('alerting')
    if (usingAlerting) {
      this.setState({
        groupBy: defaultFormData.groupBy
      })
    }
    return usingAlerting
  }

  get appTypeOptsComputed() {
    return appTypeOpts.filter(e => {
      return !this.usingAlerting || ALERTING_ALLOW_APP_TYPE.includes(e.value)
    })
  }

  get requestId() {
    return this.props.data?.request?.requestId ?? ''
  }

  get refId() {
    return this.props.query.refId
  }

  get sqlContent() {
    const content = _.get(SQL_CACHE, `${this.requestId}_${this.refId}`, '')
    let res = ''
    if (content === '') {
      return res
    }
    try {
      const sqlString = sqlFormatter(content.replace(/\$/g, 'symbol_dollar'), {
        tabWidth: 2,
        linesBetweenQueries: 2
      })
      res = sqlString
        .replace(/symbol_dollar/g, '$')
        .replace('SLIMIT', '\nSLIMIT \n ')
        .split('\n')
        .map(d => {
          return d.startsWith('\t') || d.startsWith(' ') ? `<p>${d}</p>` : `<p class='highlight'>${d}</p>`
        })
        .join('')
    } catch (error) {
      console.log(error)
    }
    return res
  }

  get grafanaTheme() {
    return getTheme().name.toLocaleLowerCase()
  }

  get selectTagOpts(): MetricOpts {
    const { groupBy, tagOpts, interval } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    let result = tagOpts
    if (groupByKeys.length > 0 || interval) {
      result = tagOpts.filter((item: any) => {
        return groupByKeys.includes(item.value)
      })
    }
    return result.filter(tag => {
      return (
        !tag.whereOnly &&
        !SELECT_GROUP_BY_DISABLE_TAGS.find((val: string) => {
          return (tag.value as string).includes(val)
        }) &&
        !tag.not_supported_operators?.includes('select')
      )
    })
  }

  get tagsFromSelect(): MetricOpts {
    const { select, tagOpts } = this.state
    if (!tagOpts?.length) {
      return []
    }
    const result = select
      .filter(e => {
        return e.type === 'tag' && !!e.key && e.as !== ''
      })
      .map((e, i) => {
        const orgOpt = tagOpts.find(opt => {
          return opt.value === e.key
        }) as MetricOptsItem
        if (!orgOpt) {
          return orgOpt
        }
        return {
          ...orgOpt,
          value: `fromSelect${e.uuid}`,
          label: `${e.as} ( #${i + 1} From Select )`,
          fromSelect: e
        }
      })
      .filter(e => !!e)
    return result
  }

  get metricsFromSelect(): MetricOpts {
    const { select, metricOpts } = this.state
    if (!metricOpts?.length) {
      return []
    }
    const result = select
      .filter(e => {
        return e.type === 'metric' && !!e.key
      })
      .map((e, i) => {
        const orgOpt = metricOpts.find(opt => {
          return opt.value === e.key
        }) as MetricOptsItem
        if (!orgOpt) {
          return orgOpt
        }
        return {
          ...orgOpt,
          value: `fromSelect${e.uuid}`,
          label: e.as ? `${e.as} ( #${i + 1} From Select )` : `${e.key} ( #${i + 1} From Select )`,
          fromSelect: e
        }
      })
    return result.filter(e => e !== undefined)
  }

  get basicMetricOpts(): MetricOpts {
    const { groupBy, metricOpts, interval } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    if (groupByKeys.length > 0 || interval) {
      return metricOpts.filter((item: any) => {
        return item.type !== MAP_METRIC_TYPE_NUM
      })
    }
    return metricOpts.filter((item: any) => {
      return !item.is_agg
    })
  }

  get orderByMetricOpts(): MetricOpts {
    const { groupBy, metricOpts, interval, select } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    if (groupByKeys.length > 0 || interval) {
      const optsFromSelect = select
        .filter(e => {
          return e.type === 'metric' && !!e.key
        })
        .map((e, i) => {
          const orgOpt = metricOpts.find(opt => {
            return opt.value === e.key
          }) as MetricOptsItem
          return {
            ...orgOpt,
            value: `fromSelect${i}`,
            label: e.as ? `${e.as} ( #${i + 1} From Select )` : `${e.key} ( #${i + 1} From Select )`,
            fromSelect: e
          }
        }) as MetricOpts
      return optsFromSelect.concat(
        interval
          ? [
              {
                label: 'interval',
                value: 'interval_' + interval,
                operatorOpts: []
              }
            ]
          : []
      )
    }
    return this.metricsFromSelect
      .concat(this.basicMetricOpts)
      .concat([
        {
          label: 'time',
          value: 'time',
          operatorOpts: []
        }
      ])
      .filter(item => {
        return item.type !== MAP_METRIC_TYPE_NUM
      })
  }

  get usingGroupBy(): boolean {
    const { groupBy, interval } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    return groupByKeys.length > 0 || !!interval
  }

  get showSlimit(): boolean {
    const { groupBy, interval } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    const result = groupByKeys.length > 0 && !!interval
    if (result) {
      if (this.state.slimit === undefined) {
        this.setState({ slimit: '' })
      }
    } else {
      this.setState({ slimit: undefined })
    }

    return result
  }

  get usingAppTraceType(): boolean {
    return this.state.appType === APP_TYPE.TRACING
  }
  get usingAccessRelationshipType(): boolean {
    return this.state.appType === APP_TYPE.SERVICE_MAP
  }
  get usingProfilingType(): boolean {
    return this.state.appType === APP_TYPE.PROFILING
  }

  get databaseOptsAfterFilter(): SelectOpts {
    const { appType, databaseOpts } = this.state
    switch (appType) {
      case APP_TYPE.TRACING:
        return [
          {
            label: 'flow_log',
            value: 'flow_log'
          }
        ]
      case APP_TYPE.SERVICE_MAP:
        return databaseOpts.filter(e => {
          return SERVICE_MAP_SUPPORTED.DB.includes(e.value as string)
        })
      case APP_TYPE.PROFILING:
        return databaseOpts.filter(e => {
          return PROFILING_SUPPORTED.DB.includes(e.value as string)
        })
      default:
        return databaseOpts
    }
  }

  get tableOptsAfterFilter(): SelectOpts {
    const { appType, tableOpts } = this.state
    switch (appType) {
      case APP_TYPE.TRACING:
        return [
          {
            label: 'l7_flow_log',
            value: 'l7_flow_log'
          }
        ]
      case APP_TYPE.SERVICE_MAP:
        return tableOpts.filter(e => {
          return SERVICE_MAP_SUPPORTED.TABLE.includes(e.value as string)
        })
      case APP_TYPE.PROFILING:
        return PROFILING_SUPPORTED.TABLE.map(e => {
          return {
            label: e,
            value: e
          }
        })
      default:
        return tableOpts
    }
  }

  get dataSourcesTypeOpts(): SelectOpts | null {
    const { tableOpts, from } = this.state
    const dataSources = tableOpts.find(e => {
      return e.value === from
    })?.dataSources
    return Array.isArray(dataSources)
      ? dataSources.map(e => {
          return {
            label: e,
            value: e,
            description: 'data interval'
          }
        })
      : null
  }

  get intervalOptsWithVariables(): SelectOpts {
    return this.state.templateVariableOpts
      .filter(item => {
        return item.variableType === 'interval'
      })
      .concat(
        !this.usingAlerting
          ? [
              {
                label: VAR_INTERVAL_LABEL,
                value: VAR_INTERVAL_LABEL
              }
            ]
          : []
      )
      .concat(intervalOpts)
  }

  get usingDerivativePreFunc(): {
    hasNotSet: boolean
    commonPreFunc: any
  } {
    const hasNotSet = ['select', 'having'].every(key => {
      const current = _.get(this.state, key)
      return current.every((e: BasicData) => {
        return !('preFunc' in e) || e.preFunc === undefined
      })
    })
    let commonPreFunc = ['select', 'having']
      .map(key => {
        const current = _.get(this.state, key)
        return current
      })
      .flat(Infinity)
      .find((e: BasicData) => {
        return e.type === 'metric' && e.key
      })?.preFunc
    return {
      hasNotSet,
      commonPreFunc
    }
  }

  setSourcesChange(val: LabelItem & { dataSources: null | string[] }) {
    const { dataSources } = val
    if (Array.isArray(dataSources)) {
      this.setState({
        sources: dataSources?.includes('1m') ? '1m' : dataSources[0]
      })
    } else {
      this.setState({
        sources: ''
      })
    }
  }

  derivativeChecker(select: BasicData[], having: BasicData[]) {
    const _select = [...select, ...having].filter((e: BasicData) => {
      return e.type === 'metric' && e.key && e.func
    })
    if (select.length >= 2) {
      const hasDerivative = _select.find((e: BasicData) => {
        return e.preFunc === 'Derivative'
      })
      if (hasDerivative) {
        const allHasDerivative = _select.every((e: BasicData) => {
          return e.preFunc === 'Derivative'
        })
        if (!allHasDerivative) {
          throw new Error('All metrics can only use (or not use) the Derivative operator simultaneously.')
        }
      }
    }
  }

  onSubmit = async (stopQuery = false) => {
    const dataObj = _.pick(this.state, [
      'appType',
      ...Object.keys({
        ...defaultFormDB,
        ...defaultFormData
      }),
      'tracingId'
    ])

    this.setState({
      errorMsg: '',
      showErrorAlert: false
    })
    try {
      dataObj.where = queryCondsFilter(dataObj?.where, 'tag')
      dataObj.having = queryCondsFilter(dataObj?.having, 'metric')
      const { appType, groupBy, select, interval, where, having, orderBy } = dataObj
      if (!stopQuery) {
        this.derivativeChecker(select as BasicDataWithId[], dataObj.having)
        const groupByKeys = (groupBy as BasicDataWithId[])
          .filter((item: any) => {
            return item.key
          })
          .map((item: any) => {
            return item.key
          })
        const hasMetricWithEmptyFuncParam = [
          ...(select as BasicDataWithId[]),
          ...(having as BasicDataWithId[]),
          ...(orderBy as BasicDataWithId[])
        ].find(e => {
          return e.type === 'metric' && e.key && e.params?.length && e.params.join('') === ''
        })
        if (hasMetricWithEmptyFuncParam) {
          throw new Error('Params is required')
        }
        if (appType === APP_TYPE.SERVICE_MAP) {
          const _resourceGroupBy = groupBy!.filter(e => e.isResourceType || e.isIpType)
          if (!_resourceGroupBy.find(e => e.sideType === 'from') || !_resourceGroupBy.find(e => e.sideType === 'to')) {
            throw new Error(
              'When using Service Map, need select at least one resource type tag as client and server in GROUP BY'
            )
          }
          if (
            !(select as BasicDataWithId[]).filter((item: any) => {
              return item.key
            }).length
          ) {
            throw new Error('When using Service Map, need to set at least one metric in SELECT')
          }
        }
        if (groupByKeys.length > 0 || interval) {
          const funcMetrics = (select as BasicDataWithId[])
            .concat(having as BasicDataWithId[])
            .concat(orderBy as BasicDataWithId[])
          const funcCheck = funcMetrics.find((item: BasicDataWithId) => {
            return !item.key.includes('interval') && item.type === 'metric' && item.key !== '' && item.func === ''
          })
          if (funcCheck) {
            throw new Error("When using group by or interval, metric's func is required")
          }
        }
        const valMetrics = (where as BasicDataWithId[]).concat(having as BasicDataWithId[])
        const valCheck = valMetrics.find((item: BasicDataWithId) => {
          return (
            item.key !== '' &&
            (item.op === '' || item.val === '' || (Array.isArray(item.val) && item.val?.length === 0))
          )
        })
        if (valCheck) {
          throw new Error('When using WHERE or HAVING, OP and VAL is required')
        }
      }
      let newQuery
      if (appType !== APP_TYPE.TRACING_FLAME) {
        const queryDataOriginal = addTimeToWhere(dataObj)
        const _queryText = JSON.stringify(queryDataOriginal)
        const parsedQueryData = genQueryParams(
          JSON.parse(replaceIntervalAndVariables(_queryText)),
          {},
          queryDataOriginal
        )
        // @ts-ignore
        const querierJsResult = querierJs.dfQuery(_.cloneDeep(parsedQueryData))
        const { returnTags, returnMetrics, sql } = querierJsResult.resource[0]
        _.set(SQL_CACHE, `${this.requestId}_${this.refId}`, sql)
        const metaExtra =
          dataObj.appType === APP_TYPE.SERVICE_MAP ? getAccessRelationshipQueryConfig(dataObj.groupBy, returnTags) : {}

        newQuery = {
          returnTags,
          returnMetrics,
          sql,
          metaExtra
        }
      }
      this.props.onChange({
        ...this.props.query,
        queryText: JSON.stringify(dataObj),
        debug: getParamByName('debug') === 'true',
        ...newQuery
      })
      this.setState({
        runQueryWarning: false
      })
      if (!stopQuery) {
        if (appType === APP_TYPE.PROFILING) {
          const fields = _.cloneDeep(PROFILING_REQUIRED_FIELDS)
          dataObj.where.forEach(e => {
            if (fields.includes(e.key)) {
              fields.splice(fields.indexOf(e.key), 1)
            }
          })
          if (fields.length) {
            throw new Error(`When using Continuous Profiling, ${fields.join(', ')} conditions is required`)
          }
        }
        setTimeout(() => {
          this.props.onRunQuery()
        })
      }
    } catch (error: any) {
      console.log(error)
      this.setState({
        errorMsg: error.toString(),
        showErrorAlert: true
      })
    }
  }

  accessRelationshipTypeCheck(appType: string) {
    return appType === APP_TYPE.SERVICE_MAP
      ? {
          groupBy: [
            {
              ...defaultFormData.groupBy[0],
              uuid: uuid()
            },
            {
              ...defaultFormData.groupBy[0],
              uuid: uuid()
            }
          ],
          select: [
            {
              ...defaultFormData.select[0],
              type: 'metric',
              uuid: uuid()
            }
          ],
          formatAs: ''
        }
      : {}
  }

  preFuncChecker = (oldData: BasicData, newData: BasicData) => {
    if (oldData.preFunc === newData.preFunc || newData.preFunc === undefined) {
      return
    }
    const result: Record<string, any> = {}
    ;['select', 'having', 'orderBy'].forEach(key => {
      const current = _.get(this.state, key)
      result[key] = current.map((e: BasicData) => {
        if (e.type === 'metric' && e.key) {
          e.preFunc = newData.preFunc
        }
        return {
          ...e,
          ...(e.type === 'metric' && e.key === 'value' ? { preFunc: newData.preFunc } : {})
        }
      })
    })
    return result
  }

  onRowValChange = (a: any, newValue: any) => {
    const { target, index } = a
    this.setState((state: any, props) => {
      const _result = state[target]
      const result = JSON.parse(JSON.stringify(_result))
      let preFuncCheckerResult
      if (Object.keys(newValue).length === 1 && 'preFunc' in newValue) {
        preFuncCheckerResult = this.preFuncChecker(result[index], {
          ...result[index],
          ...newValue
        })
      }
      result[index] = {
        ...result[index],
        ...newValue
      }
      return {
        [target]: result,
        ...preFuncCheckerResult,
        errorMsg: '',
        showErrorAlert: false,
        runQueryWarning: true
      }
    })
    setTimeout(() => {
      this.onSubmit(true)
    })
  }

  onActiveBtnClick = (a: any, type: string) => {
    const { target, index } = a
    this.setState((state: any, props) => {
      const _result = state[target]
      const result: any[] = JSON.parse(JSON.stringify(_result))
      if (type === 'add') {
        const { type } = result[index]
        result.splice(index + 1, 0, {
          type,
          key: '',
          func: '',
          op: '',
          val: '',
          as: '',
          ...(target === 'orderBy'
            ? {
                sort: 'asc'
              }
            : {}),
          params: [],
          uuid: uuid(),
          subFuncs: []
        })
      } else {
        result.splice(index, 1)
      }
      return {
        [target]: result
      }
    })
    setTimeout(() => {
      this.onSubmit(true)
    })
  }

  onFieldChange = async (field: string, val: LabelItem | boolean | string, disableFormat?: boolean) => {
    let result
    if (disableFormat) {
      result = val
    } else {
      if (typeof val === 'string') {
        result = val
      } else if (typeof val === 'boolean') {
        result = val
      } else {
        result = val ? val.value : ''
      }
    }
    if (field === 'appType') {
      let newState = {
        [field]: result,
        ...defaultFormDB,
        ...defaultFormData,
        tagOpts: [],
        metricOpts: [],
        funcOpts: []
      }
      if (result === APP_TYPE.TRACING) {
        const dbFrom = {
          db: 'flow_log',
          from: 'l7_flow_log'
        }
        // @ts-ignore
        await querierJs.loadTableConfig(dbFrom.from, dbFrom.db)
        newState = {
          ...newState,
          ...dbFrom,
          formatAs: '',
          where: [
            {
              type: 'tag',
              key: 'capture_nic_type',
              func: '',
              op: 'IN',
              val: [
                {
                  label: 'eBPF',
                  value: 7
                },
                {
                  label: 'OTel',
                  value: 8
                }
              ],
              as: '',
              params: [],
              uuid: uuid()
            }
          ]
        }
        this.getBasicData(dbFrom)
      }
      if (result === APP_TYPE.TRACING_FLAME) {
        const dbFrom = {
          db: 'flow_log',
          from: 'l7_flow_log'
        }
        // @ts-ignore
        await querierJs.loadTableConfig(dbFrom.from, dbFrom.db)
        newState = {
          ...newState,
          ...dbFrom
        }
        this.getBasicData(dbFrom)
      }
      if (result === APP_TYPE.PROFILING) {
        const dbFrom = {
          db: PROFILING_SUPPORTED.DB[0],
          from: PROFILING_SUPPORTED.TABLE[0]
        }
        // @ts-ignore
        await querierJs.loadTableConfig(dbFrom.from, dbFrom.db)
        newState = {
          ...newState,
          ...dbFrom,
          formatAs: '',
          where: [
            {
              type: 'tag',
              key: 'app_service',
              func: '',
              op: 'IN',
              val: [],
              as: '',
              params: [],
              uuid: uuid(),
              subFuncs: [],
              whereOnly: false,
              isResourceType: false,
              isIpType: false
            },
            {
              type: 'tag',
              key: 'profile_language_type',
              func: '',
              op: 'IN',
              val: '',
              as: '',
              params: [],
              uuid: uuid()
            },
            {
              type: 'tag',
              key: 'profile_event_type',
              func: '',
              op: 'IN',
              val: '',
              as: '',
              params: [],
              uuid: uuid()
            },
            {
              type: 'tag',
              key: '',
              func: '',
              op: '',
              val: '',
              as: '',
              params: [],
              uuid: uuid()
            }
          ]
        }
        this.getBasicData(dbFrom)
      }
      this.setState({
        ...newState,
        ...this.accessRelationshipTypeCheck(result as string)
      })
    } else if (field === 'db') {
      const { appType } = this.state
      this.setState({
        ...defaultFormDB,
        ...defaultFormData,
        [field]: result,
        tagOpts: [],
        metricOpts: [],
        funcOpts: [],
        ...this.accessRelationshipTypeCheck(appType)
      })
      this.getTableOpts(result as string)
    } else if (field === 'from') {
      const { appType, db } = this.state
      this.setState({
        ...defaultFormData,
        [field]: result,
        tagOpts: [],
        metricOpts: [],
        funcOpts: [],
        ...this.accessRelationshipTypeCheck(appType)
      })
      const table = { db: db as string, from: result as string }
      this.getBasicData(table)
    } else if (field === 'slimit' || field === 'limit') {
      this.setState({
        runQueryWarning: true,
        [field]: result,
        ...(!result
          ? {
              offset: ''
            }
          : {})
      })
    } else if (field === 'timeSeries') {
      this.setState({
        runQueryWarning: true,
        [field]: val
      })
    } else {
      this.setState({
        runQueryWarning: true,
        [field]: result
      })
    }

    if (['db', 'from', 'interval', 'slimit', 'limit', 'offset'].includes(field)) {
      setTimeout(() => {
        this.onSubmit(true)
      })
    }
  }

  getTemplateVariables() {
    const templateSrv = getTemplateSrv()
    const variables = templateSrv.getVariables()
    if (Array.isArray(variables)) {
      this.setState({
        templateVariableOpts: templateSrv
          .getVariables()
          .map((item: VariableModel) => {
            return {
              label: `$${item.name}`,
              value: `${item.type === 'interval' ? '$' : ''}${item.name}`,
              isVariable: true,
              variableType: item.type
            }
          })
          .flat(Infinity)
      })
    }
  }

  componentDidMount() {
    this.initFormData()
    this.getTemplateVariables()
  }

  getTableOpts = async (db: string) => {
    this.setState({
      tableOpts: []
    })
    try {
      // @ts-ignore
      const tables = await querierJs.getTables(db)
      this.setState({
        tableOpts: Array.isArray(tables)
          ? tables.map((e: { name: string; datasources: null | string[] }) => {
              return {
                label: e.name,
                value: e.name,
                dataSources: e.datasources
              }
            })
          : []
      })
    } catch (error) {
      console.log(error)
    }
  }

  updateWhereTagValueLabel = async (formData: any) => {
    try {
      const { db, from, where } = formData
      const tagValuesGroup: Record<any, any[]> = {}
      const tagTypeGroup: Record<any, string> = {}
      where.forEach((item: BasicDataWithId) => {
        if (!item.key) {
          return
        }
        const tagMapItem = getTagMapCache(db, from, getRealKey(item))
        const tagName = tagMapItem.name
        const tagType = _.get(tagMapItem, 'type')
        tagTypeGroup[tagName] = tagType
        if (!INPUT_TAG_VAL_TYPES.includes(tagType) && SELECT_TAG_VAL_OPS.includes(item.op)) {
          if (!tagValuesGroup[tagName]) {
            tagValuesGroup[tagName] = []
          }
          tagValuesGroup[tagName] = [
            ...tagValuesGroup[tagName],
            ...(Array.isArray(item.val) ? item.val : ([item.val] as LabelItem[]))
          ]
        }
      })
      const tagValuesGroupsKeys = Object.keys(tagValuesGroup)
      for (let index = 0; index < tagValuesGroupsKeys.length; index++) {
        const tagName = tagValuesGroupsKeys[index]
        const tagValues = tagValuesGroup[tagName].filter(e => !e.isVariable)
        if (!tagValues.length) {
          continue
        }
        // @ts-ignore
        const data = await querierJs.searchBySql(
          genGetTagValuesSql(
            {
              tagName,
              tagType: _.get(tagTypeGroup, [tagName]),
              from,
              keyword: [...new Set(tagValues.map(e => e.value))]
            },
            true
          ),
          db,
          (d: any) => {
            return {
              ...d,
              // add requestId to cancel request
              requestId: uuid
            }
          }
        )
        const tagValueMap = _.keyBy(data, 'value')
        tagValues.forEach(e => {
          e.label = _.get(tagValueMap, [e.value, 'display_name'], e.label)
        })
      }
    } catch (error) {
      console.log(error)
    }
  }

  initFormData = async () => {
    this.setState({
      databaseOpts: []
    })
    try {
      if (DATA_SOURCE_SETTINGS.language === '') {
        // @ts-ignore
        const langConfig = await querierJs.searchBySql('show language')
        DATA_SOURCE_SETTINGS.language = _.get(langConfig, [0, 'language']).includes('ch') ? 'zh-cn' : 'en-us'
      }
      // @ts-ignore
      const dataBases = await querierJs.getDatabases()
      this.setState({
        databaseOpts: dataBases.map((e: { name: string }) => {
          return {
            label: e.name,
            value: e.name
          }
        })
      })
      const { queryText } = this.props.query
      if (queryText) {
        const formData = JSON.parse(queryText)
        const { db, from } = formData
        if (db) {
          this.getTableOpts(db)
        }
        if (from) {
          const table = { db: db as string, from: from as string }
          await this.getBasicData(table)
          await this.updateWhereTagValueLabel(formData)
        }
        this.setState({
          ...formData
        })
      }
    } catch (error) {
      console.log(error)
    }
  }

  getBasicData = async ({ db, from }: { db: string; from: string }) => {
    this.setState({
      gotBasicData: false,
      tagOpts: [],
      metricOpts: [],
      funcOpts: [],
      subFuncOpts: []
    })
    try {
      // @ts-ignore
      await querierJs.loadOP()

      // @ts-ignore
      const { metrics, tags, functions } = await querierJs.loadTableConfig(from, db)
      const funcs: any[] = []
      const subFuncs: any[] = []
      functions.forEach((e: any) => {
        if (e.support_metric_types === null) {
          subFuncs.push(e)
        } else {
          funcs.push(e)
        }
      })

      const metricOpts = metrics.map((item: any) => {
        const { name, is_agg, operators, display_name, type } = item
        return {
          label: `${name} (${display_name})`,
          value: name,
          type,
          is_agg,
          operatorOpts: operators
            ? operators.map((op: any) => {
                return {
                  label: op,
                  value: op
                }
              })
            : []
        }
      }) as MetricOpts

      const deprecatedTags: any[] = []
      const tagOpts = tags
        .filter((item: any) => {
          if (item.deprecated) {
            deprecatedTags.push(item)
            return false
          }
          return !DISABLE_TAGS.includes(item.name)
        })
        .concat(deprecatedTags)
        .map((item: any) => {
          const { name, client_name, server_name, display_name, type, deprecated, not_supported_operators } = item
          const operatorOpts = formatTagOperators(item)
          const displaySuffix = deprecated ? ' ⚠️' : ''
          if (name === client_name && name === server_name) {
            return {
              label: (display_name === name ? `${name}` : `${name} (${display_name})`) + displaySuffix,
              value: name,
              type,
              operatorOpts,
              not_supported_operators
            }
          }
          return [
            ...((type === 'resource' || type === 'ip') && (client_name || server_name)
              ? [
                  {
                    label: `${name} (${display_name})` + displaySuffix,
                    value: name,
                    type,
                    whereOnly: true,
                    operatorOpts,
                    not_supported_operators
                  }
                ]
              : []),
            ...(client_name
              ? [
                  {
                    label: `${client_name} (${display_name} - ${getI18NLabelByName('client')})` + displaySuffix,
                    value: client_name,
                    type,
                    sideType: 'from',
                    operatorOpts,
                    not_supported_operators
                  }
                ]
              : []),
            ...(server_name
              ? [
                  {
                    label: `${server_name} (${display_name} - ${getI18NLabelByName('server')})` + displaySuffix,
                    value: server_name,
                    type,
                    sideType: 'to',
                    operatorOpts,
                    not_supported_operators
                  }
                ]
              : [])
          ]
        })
        .flat(Infinity) as MetricOpts

      const funcOpts = funcs.map((item: any) => {
        return {
          label: item.name,
          value: item.name,
          paramCount: item.additional_param_count,
          support_metric_types: item.support_metric_types,
          is_support_other_operators: item.is_support_other_operators
        }
      }) as FuncSelectOpts

      const subFuncOpts = subFuncs.map((item: any) => {
        return {
          label: item.name,
          value: item.name
        }
      }) as SelectOptsWithStringValue
      this.setState({
        tagOpts,
        metricOpts,
        funcOpts,
        subFuncOpts,
        gotBasicData: true
      })
    } catch (error) {
      console.log(error)
    }
  }

  getRemoveBtnDisabled(parent: BasicDataWithId[], current: BasicDataWithId, targetKey?: string) {
    return parent.length <= 1
  }

  onAlertRemove = () => {
    this.setState({
      errorMsg: '',
      showErrorAlert: false
    })
  }

  onCopySQLBtnClick = () => {
    copy(_.get(SQL_CACHE, `${this.requestId}_${this.refId}`, ''))
    this.setState({
      copied: true
    })
    setTimeout(() => {
      this.setState({
        copied: false
      })
    }, 1800)
  }

  onCollapseBtnClick = () => {
    this.setState({
      collapsed: !this.state.collapsed
    })
  }

  render() {
    const {
      formConfig,
      tagOpts,
      funcOpts,
      subFuncOpts,
      errorMsg,
      showErrorAlert,
      templateVariableOpts,
      runQueryWarning,
      appType,
      db,
      from,
      sources,
      gotBasicData,
      interval,
      slimit,
      limit,
      offset,
      formatAs,
      alias,
      showMetrics,
      tracingId
    } = this.state
    return (
      <div className={`${this.grafanaTheme} querier-editor`}>
        <div
          style={{
            width: '800px',
            maxWidth: '800px',
            position: 'relative',
            paddingBottom: '24px',
            flexShrink: 0
          }}
        >
          {
            <>
              <div className="save-btn-wrap">
                <Button
                  type="submit"
                  className="save-btn"
                  style={{
                    background: runQueryWarning ? '#F5B73D' : '',
                    border: runQueryWarning ? '1px solid #F5B73D' : ''
                  }}
                  onClick={() => {
                    this.onSubmit()
                  }}
                >
                  Run Query
                </Button>
              </div>
              {showErrorAlert ? (
                <Alert
                  style={{
                    width: '80%'
                  }}
                  title={errorMsg}
                  severity="error"
                  onRemove={this.onAlertRemove}
                />
              ) : null}
              <InlineField className="custom-label" label="APP" labelWidth={10}>
                <Select
                  options={this.appTypeOptsComputed}
                  value={appType}
                  onChange={(val: any) => this.onFieldChange('appType', val)}
                  placeholder="APP TYPE"
                  width="auto"
                />
              </InlineField>
              {appType !== APP_TYPE.TRACING_FLAME ? (
                <>
                  <InlineField className="custom-label" label="DATABASE" labelWidth={10}>
                    <div className="row-start-center database-selectors">
                      <Select
                        options={this.databaseOptsAfterFilter}
                        value={db}
                        onChange={(val: any) => this.onFieldChange('db', val)}
                        placeholder="DATABASE"
                        key={db ? 'dbWithVal' : 'dbWithoutVal'}
                        width="auto"
                        className="mr-4"
                      />
                      <Select
                        options={this.tableOptsAfterFilter}
                        value={from}
                        onChange={(val: any) => {
                          this.setSourcesChange(val)
                          this.onFieldChange('from', val)
                        }}
                        placeholder="TABLE"
                        key={from ? 'fromWithVal' : 'fromWithoutVal'}
                        width="auto"
                        className="mr-4"
                      />
                      {this.dataSourcesTypeOpts ? (
                        <Select
                          options={this.dataSourcesTypeOpts}
                          value={sources}
                          onChange={(val: any) => this.onFieldChange('sources', val)}
                          placeholder="DATA_INTERVAL"
                          key={sources ? 'sourceWithVal' : 'sourceWithoutVal'}
                          width="auto"
                        />
                      ) : null}
                    </div>
                  </InlineField>
                  {formConfig.map((conf: FormConfigItem, i: number) => {
                    return !(
                      (conf.targetDataKey === 'groupBy' && this.usingAppTraceType) ||
                      (conf.targetDataKey === 'orderBy' && this.usingAccessRelationshipType) ||
                      (['groupBy', 'select', 'having', 'orderBy'].includes(conf.targetDataKey) &&
                        this.usingProfilingType)
                    ) ? (
                      <>
                        <InlineField className="custom-label" label={conf.label} labelWidth={conf.labelWidth} key={i}>
                          <div className="w-100-percent">
                            {this.state[conf.targetDataKey].map((item: BasicDataWithId, index: number) => {
                              return (
                                <QueryEditorFormRow
                                  usingAlerting={this.usingAlerting}
                                  templateVariableOpts={templateVariableOpts.filter(item => {
                                    return item.variableType !== 'interval' && item.variableType !== 'datasource'
                                  })}
                                  templateVariableOptsFull={templateVariableOpts}
                                  config={formItemConfigs[conf.targetDataKey]}
                                  basicData={item}
                                  gotBasicData={gotBasicData}
                                  db={db}
                                  from={from}
                                  usingGroupBy={this.usingGroupBy}
                                  tagOpts={
                                    conf.targetDataKey === 'select'
                                      ? this.selectTagOpts
                                      : conf.targetDataKey === 'groupBy'
                                      ? tagOpts
                                          .filter(tag => {
                                            return (
                                              !GROUP_BY_DISABLE_TAG_TYPES.includes(tag.type as string) &&
                                              !tag.whereOnly &&
                                              !tag.not_supported_operators?.includes('group')
                                            )
                                          })
                                          .filter((tag: MetricOptsItem) => {
                                            const extra = true
                                            return (
                                              !SELECT_GROUP_BY_DISABLE_TAGS.concat([TIME_TAG_TYPE]).find(
                                                (val: string) => {
                                                  return (tag.value as string).includes(val)
                                                }
                                              ) && extra
                                            )
                                          })
                                      : this.tagsFromSelect.concat(tagOpts).filter(tag => {
                                          return ![MAP_TAG_TYPE, PCAP_TAG_TYPE, TIME_TAG_TYPE].includes(
                                            tag.type as string
                                          )
                                        })
                                  }
                                  metricOpts={
                                    conf.targetDataKey === 'orderBy'
                                      ? this.orderByMetricOpts
                                      : conf.targetDataKey === 'having'
                                      ? this.metricsFromSelect.concat(this.basicMetricOpts).filter(item => {
                                          return ![TAG_METRIC_TYPE_NUM, MAP_METRIC_TYPE_NUM].includes(
                                            item.type as number
                                          )
                                        })
                                      : this.basicMetricOpts
                                  }
                                  funcOpts={funcOpts}
                                  subFuncOpts={subFuncOpts}
                                  key={item.uuid}
                                  uuid={item.uuid}
                                  removeBtnDisabled={this.getRemoveBtnDisabled(
                                    this.state[conf.targetDataKey],
                                    item,
                                    conf.targetDataKey
                                  )}
                                  rowType={conf.targetDataKey}
                                  typeSelectDisabled={
                                    conf.targetDataKey === 'select' && this.usingAccessRelationshipType
                                  }
                                  onRowValChange={(obj: any) =>
                                    this.onRowValChange(
                                      {
                                        target: conf.targetDataKey,
                                        index: index
                                      },
                                      obj
                                    )
                                  }
                                  onActiveBtnClick={(type: string) =>
                                    this.onActiveBtnClick(
                                      {
                                        target: conf.targetDataKey,
                                        index: index
                                      },
                                      type
                                    )
                                  }
                                  usingDerivativePreFunc={this.usingDerivativePreFunc}
                                  usingProfilingType={this.usingProfilingType}
                                />
                              )
                            })}
                          </div>
                        </InlineField>
                        {conf.targetDataKey === 'groupBy' &&
                        !this.usingAppTraceType &&
                        !this.usingAccessRelationshipType &&
                        !this.usingProfilingType ? (
                          <InlineField className="custom-label" label="INTERVAL" labelWidth={10}>
                            <div className="w-100-percent">
                              <Select
                                key={interval ? 'intervalWithVal' : 'intervalWithoutVal'}
                                options={this.intervalOptsWithVariables}
                                value={interval}
                                onChange={(val: any) => this.onFieldChange('interval', val)}
                                placeholder="TIME"
                                isClearable={true}
                                width="auto"
                              />
                            </div>
                          </InlineField>
                        ) : null}
                      </>
                    ) : null
                  })}
                  <div className="row-start-center">
                    {this.showSlimit ? (
                      <InlineField className="custom-label" label="SLIMIT" labelWidth={6}>
                        <div className="w-100-percent">
                          <Input
                            value={slimit}
                            onChange={(ev: any) => this.onFieldChange('slimit', ev.target)}
                            placeholder={SLIMIT_DEFAULT_VALUE}
                            width={12}
                          />
                        </div>
                      </InlineField>
                    ) : null}
                    {!this.usingProfilingType ? (
                      <InlineField className="custom-label" label="LIMIT" labelWidth={6}>
                        <div className="w-100-percent">
                          <Input
                            value={limit}
                            onChange={(ev: any) => this.onFieldChange('limit', ev.target)}
                            placeholder="LIMIT"
                            width={12}
                          />
                        </div>
                      </InlineField>
                    ) : null}
                    {!this.usingProfilingType ? (
                      <InlineField className="custom-label" label="OFFSET" labelWidth={8}>
                        <div className="w-100-percent">
                          <Input
                            value={offset}
                            onChange={(ev: any) => this.onFieldChange('offset', ev.target)}
                            placeholder="OFFSET"
                            disabled={!limit}
                            width={12}
                          />
                        </div>
                      </InlineField>
                    ) : null}
                  </div>
                  {this.usingGroupBy && !this.usingAccessRelationshipType && !this.usingProfilingType ? (
                    <div className="row-start-center">
                      <InlineField className="custom-label" label="FORMAT AS" labelWidth={11}>
                        <Select
                          options={formatAsOpts}
                          value={formatAs}
                          onChange={(val: any) => this.onFieldChange('formatAs', val)}
                          placeholder="FORMAT_AS"
                          key={formatAs ? 'formatAsWithVal' : 'formatAsWithoutVal'}
                          width="auto"
                        />
                      </InlineField>
                      {formatAs === 'timeSeries' ? (
                        <>
                          <InlineField className="custom-label" label="ALIAS" labelWidth={6}>
                            <Input
                              value={alias}
                              onChange={(ev: any) => this.onFieldChange('alias', ev.target)}
                              placeholder="${tag0} ${tag1}"
                              width={28}
                            />
                          </InlineField>
                          <InlineField className="custom-label" label="SHOW METRICS" labelWidth={14.5}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <Select
                                options={showMetricsOpts}
                                value={showMetrics}
                                onChange={(val: any) => this.onFieldChange('showMetrics', val)}
                                placeholder="SHOW METRICS"
                                key={showMetrics ? 'showMetricsWithVal' : 'showMetricsWithoutVal'}
                                width="auto"
                              />
                              <Tooltip
                                placement="top"
                                content={
                                  <div>
                                    <span>whether to display metrics&apos;s names in legends.</span>
                                    <br />
                                    <span>auto: when select multiple metrics to display; otherwise do not show.</span>
                                  </div>
                                }
                              >
                                <Icon
                                  style={{
                                    cursor: 'pointer',
                                    marginLeft: '4px'
                                  }}
                                  name="question-circle"
                                />
                              </Tooltip>
                            </div>
                          </InlineField>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <InlineField className="custom-label" label="_id" labelWidth={10}>
                  <TracingIdSelector
                    tracingId={tracingId}
                    onChange={(v: LabelItem) => this.onFieldChange('tracingId', v, true)}
                    templateVariableOpts={templateVariableOpts.filter(item => {
                      return item.variableType !== 'interval' && item.variableType !== 'datasource'
                    })}
                  />
                </InlineField>
              )}
            </>
          }
        </div>
        {![APP_TYPE.TRACING_FLAME, APP_TYPE.PROFILING].includes(appType) && this.sqlContent ? (
          <div className="sql-content-wrapper">
            <div
              className="sql-content"
              style={{
                maxHeight: this.state.collapsed ? '32px' : '',
                padding: this.state.collapsed ? '32px 6px 0 6px' : ''
              }}
              dangerouslySetInnerHTML={{ __html: this.sqlContent }}
            ></div>
            <Tooltip content={this.state.collapsed ? 'Show' : 'Hide'} placement="top">
              <Button
                style={{ position: 'absolute', right: '32px', top: 0 }}
                fill="text"
                icon={this.state.collapsed ? 'eye' : 'eye-slash'}
                onClick={this.onCollapseBtnClick}
              />
            </Tooltip>
            <Tooltip content={this.state.copied ? 'Copied' : 'Copy'} placement="top">
              <Button
                style={{ position: 'absolute', right: 0, top: 0 }}
                fill="text"
                icon={this.state.copied ? 'check' : 'copy'}
                onClick={this.onCopySQLBtnClick}
              />
            </Tooltip>
          </div>
        ) : null}
      </div>
    )
  }
}
