import React, { PureComponent } from 'react'
import { QueryEditorProps, VariableModel } from '@grafana/data'
import { DataSource } from './datasource'
import { MyDataSourceOptions, MyQuery } from './types'
import { Button, Form, InlineField, Select, Input, Alert } from '@grafana/ui'
import { QueryEditorFormRow } from './components/QueryEditorFormRow'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import './QueryEditor.css'
import { formatTagOperators, uuid } from 'utils/tools'
import { getTemplateSrv } from '@grafana/runtime'
import {
  BasicDataWithId,
  defaultFormData,
  defaultFormDB,
  formatAsOpts,
  formItemConfigs,
  FormTypes,
  intervalOpts,
  SELECT_GROUP_BY_DISABLE_TAGS,
  SERVICE_MAP_SUPPORT_DB,
  SERVICE_MAP_SUPPORT_TABLE
} from 'consts'

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
  }
>

type MetricOptsItem = LabelItem & {
  operatorOpts: LabelItem[]
  sideType?: 'from' | 'to'
  type?: string | number
  is_agg?: boolean
  whereOnly?: boolean
  fromSelect?: BasicDataWithId
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
    appTypeOpts: SelectOpts
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
    limit: string
    offset: string
    formatAs: 'timeSeries' | 'table' | ''
    alias: string
    errorMsg: string
    showErrorAlert: boolean
    gotBasicData: boolean
    templateVariableOpts: SelectOpts
    runQueryWarning: boolean
  }
  editor: any | undefined
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
      appTypeOpts: [
        {
          label: 'General Metrics',
          value: 'trafficQuery'
        },
        {
          label: 'Service Map',
          value: 'accessRelationship'
        },
        {
          label: 'Distributed Tracing',
          value: 'appTracing'
        }
      ],
      appType: '',
      ...defaultFormDB,
      ...defaultFormData,
      errorMsg: '',
      showErrorAlert: false,
      gotBasicData: false,
      templateVariableOpts: [],
      runQueryWarning: false
    }
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
    if (groupByKeys.length > 0 || interval) {
      return tagOpts.filter((item: any) => {
        return groupByKeys.includes(item.value)
      })
    }
    return tagOpts
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

  get basciMetricOpts(): MetricOpts {
    const { groupBy, metricOpts, interval } = this.state
    const groupByKeys = groupBy
      .filter((item: any) => {
        return item.key
      })
      .map((item: any) => {
        return item.key
      })
    if (groupByKeys.length > 0 || interval) {
      return metricOpts
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
    return this.metricsFromSelect.concat(this.basciMetricOpts).concat([
      {
        label: 'time',
        value: 'time',
        operatorOpts: []
      }
    ])
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

  get usingAppTraceType(): boolean {
    return this.state.appType === 'appTracing'
  }
  get usingAccessRelationshipType(): boolean {
    return this.state.appType === 'accessRelationship'
  }

  get databaseOptsAfterFilter(): SelectOpts {
    const { appType, databaseOpts } = this.state
    switch (appType) {
      case 'appTracing':
        return [
          {
            label: 'flow_log',
            value: 'flow_log'
          }
        ]
      case 'accessRelationship':
        return databaseOpts.filter(e => {
          return SERVICE_MAP_SUPPORT_DB.includes(e.value as string)
        })
      default:
        return databaseOpts
    }
  }

  get tableOptsAfterFilter(): SelectOpts {
    const { appType, tableOpts } = this.state
    switch (appType) {
      case 'appTracing':
        return [
          {
            label: 'l7_flow_log',
            value: 'l7_flow_log'
          }
        ]
      case 'accessRelationship':
        return tableOpts.filter(e => {
          return SERVICE_MAP_SUPPORT_TABLE.includes(e.value as string)
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
      .concat(intervalOpts)
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

  onSubmit = () => {
    const dataObj = _.pick(this.state, [
      'appType',
      ...Object.keys({
        ...defaultFormDB,
        ...defaultFormData
      })
    ])

    try {
      const { appType, groupBy, select, interval, where, having, orderBy } = dataObj
      const groupByKeys = (groupBy as BasicDataWithId[])
        .filter((item: any) => {
          return item.key
        })
        .map((item: any) => {
          return item.key
        })
      const hasMetrciWithEmptyFuncParam = [
        ...(select as BasicDataWithId[]),
        ...(having as BasicDataWithId[]),
        ...(orderBy as BasicDataWithId[])
      ].find(e => {
        return e.type === 'metric' && e.key && e.params?.length && e.params.join('') === ''
      })
      if (hasMetrciWithEmptyFuncParam) {
        throw new Error('Params is required')
      }
      if (appType === 'accessRelationship') {
        const _resourceGroupBy = groupBy!.filter(e => e.isResourceType || e.isIpType)
        if (!_resourceGroupBy.find(e => e.sideType === 'from') || !_resourceGroupBy.find(e => e.sideType === 'to')) {
          throw new Error(
            'When using service map, need select at least one resource type tag as client and server in group by'
          )
        }
        if (
          !(select as BasicDataWithId[]).filter((item: any) => {
            return item.key
          }).length
        ) {
          throw new Error('When using accessRelationship, need to set at least one metric in SELECT')
        }
      }
      if (groupByKeys.length > 0 || interval) {
        const funcMetrics = (select as BasicDataWithId[])
          .concat(having as BasicDataWithId[])
          .concat(orderBy as BasicDataWithId[])
        const funcCheck = funcMetrics.find((item: BasicDataWithId) => {
          const isTime = item.key && (item.key === "'time_$__interval_ms'" || item.key.startsWith('interval_'))
          return item.type === 'metric' && item.key !== '' && !isTime && item.func === ''
        })
        if (funcCheck) {
          throw new Error("When using group by or interval, metric's func is required")
        }
      }
      const valMetrics = (where as BasicDataWithId[]).concat(having as BasicDataWithId[])
      const valCheck = valMetrics.find((item: BasicDataWithId) => {
        return item.key !== '' && (item.op === '' || item.val === '')
      })
      if (valCheck) {
        throw new Error('When using where or having, op and val is required')
      }
      this.props.onChange({
        ...this.props.query,
        queryText: JSON.stringify(dataObj)
      })
      this.setState({
        runQueryWarning: false
      })
      this.props.onRunQuery()
    } catch (error: any) {
      console.log(error)
      this.setState({
        errorMsg: error.toString(),
        showErrorAlert: true
      })
    }
  }

  accessRelationshipTypeCheck(apptype: string) {
    return apptype === 'accessRelationship'
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

  onRowValChange = (a: any, newValue: any) => {
    const { target, index } = a
    this.setState((state: any, props) => {
      const _result = state[target]
      const result = JSON.parse(JSON.stringify(_result))
      result[index] = {
        ...result[index],
        ...newValue
      }
      return {
        [target]: result,
        errorMsg: '',
        showErrorAlert: false,
        runQueryWarning: true
      }
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
  }

  onFieldChange = (field: string, val: LabelItem | boolean | string) => {
    let result
    if (typeof val === 'string') {
      result = val
    } else if (typeof val === 'boolean') {
      result = val
    } else {
      result = val ? val.value : ''
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
      if (result === 'appTracing') {
        const dbFrom = {
          db: 'flow_log',
          from: 'l7_flow_log'
        }
        newState = {
          ...newState,
          ...dbFrom,
          formatAs: '',
          where: [
            {
              type: 'tag',
              key: 'tap_port_type',
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
    } else if (field === 'limit') {
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
              value: item.name,
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

  initFormData = async () => {
    this.setState({
      databaseOpts: []
    })
    try {
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
          this.getBasicData(table)
          this.setState({
            ...formData
          })
        }
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

      const TAG_METRIC_TYPE_NUM = 6
      const metricOpts = metrics
        .filter((item: any) => {
          return item.type !== TAG_METRIC_TYPE_NUM
        })
        .map((item: any) => {
          return {
            label: `${item.name} (${item.display_name})`,
            value: item.name,
            type: item.type,
            is_agg: item.is_agg,
            operatorOpts: item.operators
              ? item.operators.map((op: any) => {
                  return {
                    label: op,
                    value: op
                  }
                })
              : []
          }
        }) as MetricOpts

      const tagOpts = tags
        .map((item: any) => {
          const { name, client_name, server_name } = item
          const operatorOpts = formatTagOperators(item.operators, item)
          if (name === client_name && name === server_name) {
            return {
              label: item.display_name === item.name ? `${item.name}` : `${item.name} (${item.display_name})`,
              value: item.name,
              type: item.type,
              operatorOpts
            }
          }
          return [
            ...((item.type === 'resource' || item.type === 'ip') && (item.client_name || item.server_name)
              ? [
                  {
                    label: `${item.name} (${item.display_name})`,
                    value: item.name,
                    type: item.type,
                    whereOnly: true,
                    operatorOpts
                  }
                ]
              : []),
            ...(item.client_name
              ? [
                  {
                    label: `${item.client_name} (${item.display_name}-客户端)`,
                    value: item.client_name,
                    type: item.type,
                    sideType: 'from',
                    operatorOpts
                  }
                ]
              : []),
            ...(item.server_name
              ? [
                  {
                    label: `${item.server_name} (${item.display_name}-服务端)`,
                    value: item.server_name,
                    type: item.type,
                    sideType: 'to',
                    operatorOpts
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
          support_metric_types: item.support_metric_types
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

  showSideType(parent: BasicDataWithId[], current: BasicDataWithId, targetKey?: string) {
    return (
      targetKey === 'groupBy' &&
      this.usingAccessRelationshipType &&
      parent
        .filter(parentItem => {
          return parentItem.sideType === current.sideType
        })
        .findIndex(parentItem => {
          return parentItem.uuid === current.uuid
        }) === 0
    )
  }

  onAlertRemove = () => {
    this.setState({
      errorMsg: '',
      showErrorAlert: false
    })
  }

  render() {
    const { formConfig, tagOpts, funcOpts, subFuncOpts, appTypeOpts, errorMsg, showErrorAlert, templateVariableOpts } =
      this.state

    return (
      <Form
        onSubmit={() => {
          this.onSubmit()
        }}
        style={{
          width: '900px',
          maxWidth: '900px',
          position: 'relative',
          paddingBottom: '24px'
        }}
      >
        {() => (
          <>
            <div className="save-btn-wrap">
              <Button
                type="submit"
                className="save-btn"
                style={{
                  background: this.state.runQueryWarning ? '#F5B73D' : '',
                  border: this.state.runQueryWarning ? '1px solid #F5B73D' : ''
                }}
              >
                Run Query
              </Button>
            </div>
            {showErrorAlert ? <Alert title={errorMsg} severity="error" onRemove={this.onAlertRemove} /> : null}
            <InlineField className="custom-label" label="APP" labelWidth={10}>
              <div>
                <Select
                  options={appTypeOpts}
                  value={this.state.appType}
                  onChange={(val: any) => this.onFieldChange('appType', val)}
                  placeholder="APP TYPE"
                  width={22}
                />
              </div>
            </InlineField>
            <InlineField className="custom-label" label="DATABASE" labelWidth={10}>
              <div className="row-start-center">
                <Select
                  options={this.databaseOptsAfterFilter}
                  value={this.state.db}
                  onChange={(val: any) => this.onFieldChange('db', val)}
                  placeholder="DATABASE"
                  key={this.state.db ? 'dbWithVal' : 'dbWithoutVal'}
                  width={15}
                />
                <Select
                  options={this.tableOptsAfterFilter}
                  value={this.state.from}
                  onChange={(val: any) => {
                    this.setSourcesChange(val)
                    this.onFieldChange('from', val)
                  }}
                  placeholder="TABLE"
                  key={this.state.from ? 'fromWithVal' : 'fromWithoutVal'}
                  width={22.5}
                />
                {this.dataSourcesTypeOpts ? (
                  <Select
                    options={this.dataSourcesTypeOpts}
                    value={this.state.sources}
                    onChange={(val: any) => this.onFieldChange('sources', val)}
                    placeholder="DATA_INTERVAL"
                    key={this.state.sources ? 'sourceWithVal' : 'sourceWithoutVal'}
                    width={14}
                  />
                ) : null}
              </div>
            </InlineField>
            {formConfig.map((conf: FormConfigItem, i: number) => {
              return !(
                (conf.targetDataKey === 'groupBy' && this.usingAppTraceType) ||
                (conf.targetDataKey === 'orderBy' && this.usingAccessRelationshipType)
              ) ? (
                <>
                  <InlineField className="custom-label" label={conf.label} labelWidth={conf.labelWidth} key={i}>
                    <div className="w-100-percent">
                      {this.state[conf.targetDataKey].map((item: BasicDataWithId, index: number) => {
                        return (
                          <QueryEditorFormRow
                            templateVariableOpts={templateVariableOpts.filter(item => {
                              return item.variableType !== 'interval' && item.variableType !== 'datasource'
                            })}
                            config={formItemConfigs[conf.targetDataKey]}
                            basicData={item}
                            gotBasicData={this.state.gotBasicData}
                            db={this.state.db}
                            from={this.state.from}
                            usingGroupBy={this.usingGroupBy}
                            tagOpts={
                              conf.targetDataKey === 'select'
                                ? this.selectTagOpts.filter(tag => {
                                    return (
                                      !tag.whereOnly &&
                                      !SELECT_GROUP_BY_DISABLE_TAGS.find((val: string) => {
                                        return (tag.value as string).includes(val)
                                      })
                                    )
                                  })
                                : conf.targetDataKey === 'groupBy'
                                ? tagOpts
                                    .filter(tag => {
                                      return tag.type !== 'map' && !tag.whereOnly
                                    })
                                    .filter((tag: MetricOptsItem) => {
                                      const extra = true
                                      return (
                                        !SELECT_GROUP_BY_DISABLE_TAGS.find((val: string) => {
                                          return (tag.value as string).includes(val)
                                        }) && extra
                                      )
                                    })
                                : this.tagsFromSelect.concat(
                                    tagOpts.filter(tag => {
                                      return tag.type !== 'map'
                                    })
                                  )
                            }
                            metricOpts={
                              conf.targetDataKey === 'orderBy'
                                ? this.orderByMetricOpts
                                : conf.targetDataKey === 'having'
                                ? this.metricsFromSelect.concat(this.basciMetricOpts)
                                : this.basciMetricOpts
                            }
                            funcOpts={funcOpts}
                            subFuncOpts={subFuncOpts}
                            key={item.uuid}
                            removeBtnDisabled={this.getRemoveBtnDisabled(
                              this.state[conf.targetDataKey],
                              item,
                              conf.targetDataKey
                            )}
                            rowType={conf.targetDataKey}
                            typeSelectDisabled={conf.targetDataKey === 'select' && this.usingAccessRelationshipType}
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
                          />
                        )
                      })}
                    </div>
                  </InlineField>
                  {conf.targetDataKey === 'groupBy' && !this.usingAppTraceType && !this.usingAccessRelationshipType ? (
                    <InlineField className="custom-label" label="INTERVAL" labelWidth={10}>
                      <div className="w-100-percent">
                        <Select
                          key={this.state.interval ? 'intervalWithVal' : 'intervalWithoutVal'}
                          options={this.intervalOptsWithVariables}
                          value={this.state.interval}
                          onChange={(val: any) => this.onFieldChange('interval', val)}
                          placeholder="TIME"
                          isClearable={true}
                          width={36.5}
                        />
                      </div>
                    </InlineField>
                  ) : null}
                </>
              ) : null
            })}
            <div className="row-start-center">
              <InlineField className="custom-label" label="LIMIT" labelWidth={6}>
                <div className="w-100-percent">
                  <Input
                    value={this.state.limit}
                    onChange={(ev: any) => this.onFieldChange('limit', ev.target)}
                    placeholder="LIMIT"
                    width={6}
                  />
                </div>
              </InlineField>
              <InlineField className="custom-label" label="OFFSET" labelWidth={8}>
                <div className="w-100-percent">
                  <Input
                    value={this.state.offset}
                    onChange={(ev: any) => this.onFieldChange('offset', ev.target)}
                    placeholder="OFFSET"
                    disabled={!this.state.limit}
                    width={9}
                  />
                </div>
              </InlineField>
            </div>
            {this.usingGroupBy && !this.usingAccessRelationshipType ? (
              <div className="row-start-center">
                <InlineField className="custom-label" label="FORMAT AS" labelWidth={11}>
                  <Select
                    options={formatAsOpts}
                    value={this.state.formatAs}
                    onChange={(val: any) => this.onFieldChange('formatAs', val)}
                    placeholder="FORMAT_AS"
                    key={this.state.formatAs ? 'formatAsWithVal' : 'formatAsWithoutVal'}
                  />
                </InlineField>
                {this.state.formatAs === 'timeSeries' ? (
                  <InlineField className="custom-label" label="ALIAS" labelWidth={6}>
                    <Input
                      value={this.state.alias}
                      onChange={(ev: any) => this.onFieldChange('alias', ev.target)}
                      placeholder="${tag0} ${tag1}"
                      width={60}
                    />
                  </InlineField>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </Form>
    )
  }
}
