import React, { PureComponent } from 'react'
import { QueryEditorProps } from '@grafana/data'
import { DataSource } from './datasource'
import { MyDataSourceOptions, MyQuery } from './types'
import { Button, Form, InlineField, Select, Input, Alert, Switch } from '@grafana/ui'
import { BasicData, QueryEditorFormRow, RowConfig } from './components/QueryEditorFormRow'
import _ from 'lodash'
import * as querierJs from 'metaflow-sdk-js'
import './QueryEditor.css'

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>

export type LabelItem = {
  label: string
  value: string | number
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
  sideType: 'from' | 'to'
  type?: string | number
  is_agg?: boolean
}

export type MetricOpts = MetricOptsItem[]

const intervalOpts: SelectOpts = [
  {
    label: '1s',
    value: '1'
  },
  {
    label: '10s',
    value: '10'
  },
  {
    label: '30s',
    value: '30'
  },
  {
    label: '1m',
    value: '60'
  },
  {
    label: '10m',
    value: '600'
  },
  {
    label: '30m',
    value: '1800'
  },
  {
    label: '1h',
    value: '3600'
  },
  {
    label: '6h',
    value: '21600'
  },
  {
    label: '12h',
    value: '43200'
  },
  {
    label: '1d',
    value: '86400'
  },
  {
    label: '7d',
    value: '604800'
  }
]

type FormKeys = 'select' | 'where' | 'having' | 'groupBy' | 'orderBy'

type Configs = Record<FormKeys, RowConfig>

const formItemConfigs: Configs = {
  groupBy: {
    type: false,
    func: false,
    op: false,
    val: false,
    as: false
  },
  select: {
    type: true,
    func: true,
    op: false,
    val: false,
    as: true
  },
  where: {
    type: false,
    func: false,
    op: true,
    val: true,
    as: false,
    disableTimeTag: true
  },
  having: {
    type: false,
    func: true,
    op: true,
    val: true,
    as: false
  },
  orderBy: {
    type: false,
    func: true,
    op: false,
    val: false,
    as: false,
    sort: true
  }
}

interface FormConfigItem {
  label: string
  labelWidth: number
  targetDataKey: FormKeys
}

export function uuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

export type BasicDataWithId = BasicData & { uuid: string }

export type QueryDataType = {
  appType: string
  db: string
  from: string
  select: BasicDataWithId[]
  where: BasicDataWithId[]
  having: BasicDataWithId[]
  groupBy: BasicDataWithId[]
  orderBy: BasicDataWithId[]
  interval: string
  limit: string
  offset: string
  resultGroupBy: boolean
}

const defaultFormDB: Pick<QueryDataType, 'db'> = {
  db: ''
}
const defaultFormData: Omit<QueryDataType, 'appType' | 'db'> = {
  from: '',
  select: [
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
  ],
  where: [
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
  ],
  having: [
    {
      type: 'metric',
      key: '',
      func: '',
      op: '',
      val: '',
      as: '',
      params: [],
      uuid: uuid()
    }
  ],
  groupBy: [
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
  ],
  orderBy: [
    {
      type: 'metric',
      key: '',
      func: '',
      op: '',
      val: '',
      as: '',
      params: [],
      uuid: uuid(),
      sort: 'asc'
    }
  ],
  interval: '',
  limit: '100',
  offset: '',
  resultGroupBy: true
}

// 不支持做分组的 tag: 负载均衡监听器, ingress
const GROUP_BY_DISABLE_TAGS = ['lb_listener', 'pod_ingress']

export type QueryDataKeys = keyof QueryDataType
export class QueryEditor extends PureComponent<Props> {
  state: {
    formConfig: FormConfigItem[]
    databaseOpts: SelectOpts
    tableOpts: SelectOpts
    tagOpts: MetricOpts
    metricOpts: MetricOpts
    funcOpts: FuncSelectOpts
    subFuncOpts: SelectOptsWithStringValue
    appTypeOpts: SelectOpts
    appType: string
    db: string
    from: string
    select: BasicDataWithId[]
    where: BasicDataWithId[]
    having: BasicDataWithId[]
    groupBy: BasicDataWithId[]
    orderBy: BasicDataWithId[]
    interval: string
    limit: string
    offset: string
    resultGroupBy: boolean
    errorMsg: string
    showErrorAlert: boolean
    gotBasicData: boolean
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
          label: '应用追踪',
          value: 'appTracing'
        },
        {
          label: '流量查询',
          value: 'trafficQuery'
        },
        {
          label: '访问关系',
          value: 'accessRelationship'
        }
      ],
      appType: '',
      ...defaultFormDB,
      ...defaultFormData,
      errorMsg: '',
      showErrorAlert: false,
      gotBasicData: false
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
      const selectMetricKeys = select
        .filter((item: any) => {
          return item.type === 'metric'
        })
        .map((item: any) => {
          return item.key
        })
      return metricOpts.filter((item: any) => {
        return selectMetricKeys.includes(item.value)
      })
    }
    return this.basciMetricOpts
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
    return appType === 'appTracing'
      ? [
          {
            label: 'flow_log',
            value: 'flow_log'
          }
        ]
      : databaseOpts
  }

  get tableOptsAfterFilter(): SelectOpts {
    const { appType, tableOpts } = this.state
    return appType === 'appTracing'
      ? [
          {
            label: 'l7_flow_log',
            value: 'l7_flow_log'
          }
        ]
      : tableOpts
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
      if (appType === 'accessRelationship') {
        if (!groupBy!.find(e => e.sideType === 'from') || !groupBy!.find(e => e.sideType === 'to')) {
          throw new Error('When using accessRelationship, need to set from and to in GROUP BY')
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
          return item.type === 'metric' && item.key !== '' && item.func === ''
        })
        if (funcCheck) {
          throw new Error('group by 时, metric 需要设置 func')
        }
      }
      const valMetrics = (where as BasicDataWithId[]).concat(having as BasicDataWithId[])
      const valCheck = valMetrics.find((item: BasicDataWithId) => {
        return item.type === 'metric' && item.key !== '' && (item.op === '' || item.val === '')
      })
      if (valCheck) {
        throw new Error('where 和 having 内 需要设置 op 及 val')
      }

      const hasNoOpOrVal = (where as BasicDataWithId[])
        .filter((item: any) => {
          return item.key
        })
        .some((item: any) => {
          return !item.op || !item.val
        })
      if (hasNoOpOrVal) {
        throw new Error('where 中 缺少 operator 或 value')
      }
      this.props.onChange({
        ...this.props.query,
        queryText: JSON.stringify(dataObj)
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

  // groupBy || interval 时,
  // select 的可选 tag 为 groupBy 内选中的值
  groupBySelectCheck = (target: any, interval: string, result: any) => {
    let obj = {}
    if (target === 'groupBy') {
      const groupByKeys = result.map((e: any) => e.key)
      const useGroupBy = groupByKeys.filter((e: any) => e).length
      if (!useGroupBy && !interval) {
        return obj
      }
      const newSelect = this.state.select.filter((item: any) => {
        return item.type === 'metric' || !item.key || groupByKeys.includes(item.key)
      })
      obj = {
        select: newSelect.length
          ? newSelect
          : [
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
    }
    return obj
  }

  // groupBy || interval 时,
  // orderBy 的可选 metric 为 select 内选中的值
  selectOrderByCheck = (target: any, interval: string, result: any) => {
    let obj = {}
    if (target === 'select' || target === 'groupBy') {
      const groupBy = target === 'select' ? this.state.groupBy : result
      const groupByKeys = groupBy.map((e: any) => e.key)
      const useGroupBy = groupByKeys.filter((e: any) => e).length
      const select = target === 'select' ? result : this.state.select
      if (!useGroupBy && !interval) {
        return {
          select: select.map((e: any) => {
            return {
              ...e,
              func: '',
              params: []
            }
          }),
          having: this.state.having.map((e: any) => {
            return {
              ...e,
              func: '',
              params: []
            }
          }),
          orderBy: this.state.orderBy.map((e: any) => {
            return {
              ...e,
              func: '',
              params: []
            }
          })
        }
      }
      const selectKeys = select
        .filter((item: any) => {
          return item.type === 'metric'
        })
        .map((e: any) => e.key)
      const newOrderBy = this.state.orderBy.filter((item: any) => {
        return !item.key || selectKeys.includes(item.key)
      })
      obj = {
        orderBy: newOrderBy.length
          ? newOrderBy
          : [
              {
                type: 'metric',
                key: '',
                func: '',
                op: '',
                val: '',
                as: '',
                params: [],
                uuid: uuid(),
                sort: 'asc'
              }
            ]
      }
    }
    return obj
  }

  accessRelationshipTypeCheck(apptype: string) {
    return apptype === 'accessRelationship'
      ? {
          groupBy: [
            {
              ...defaultFormData.groupBy[0],
              sideType: 'from',
              uuid: uuid()
            },
            {
              ...defaultFormData.groupBy[0],
              sideType: 'to',
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
          resultGroupBy: false
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
        ...this.groupBySelectCheck(target, state.interval, result),
        ...this.selectOrderByCheck(target, state.interval, result),
        errorMsg: '',
        showErrorAlert: false
      }
    })
  }

  onActiveBtnClick = (a: any, type: string) => {
    const { target, index } = a
    this.setState((state: any, props) => {
      const _result = state[target]
      const result: any[] = JSON.parse(JSON.stringify(_result))
      if (type === 'add') {
        const { type, sideType } = result[index]
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
          subFuncs: [],
          ...(sideType
            ? {
                sideType
              }
            : {})
        })
      } else {
        result.splice(index, 1)
      }
      return {
        [target]: result,
        ...this.groupBySelectCheck(target, state.interval, result),
        ...this.selectOrderByCheck(target, state.interval, result)
      }
    })
  }

  onFieldChange = (field: string, val: LabelItem | boolean) => {
    let result
    if (field === 'sort') {
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
          resultGroupBy: false,
          where: [
            {
              type: 'tag',
              key: 'tap_port_type',
              func: '',
              op: '=',
              val: {
                label: 'eBPF',
                value: 7
              },
              as: '',
              params: [],
              uuid: uuid()
            },
            {
              type: 'tag',
              key: 'tap_port_type',
              func: '',
              op: '=',
              val: {
                label: 'OTel',
                value: 8
              },
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
    } else if (field === 'interval') {
      this.setState({
        [field]: result,
        ...this.groupBySelectCheck('groupBy', result as string, this.state.groupBy),
        ...this.selectOrderByCheck('select', result as string, this.state.select)
      })
    } else if (field === 'limit') {
      this.setState({
        [field]: result,
        ...(!result
          ? {
              offset: ''
            }
          : {})
      })
    } else if (field === 'resultGroupBy') {
      this.setState({
        [field]: val
      })
    } else {
      this.setState({
        [field]: result
      })
    }
  }

  componentDidMount() {
    this.initFormData()
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
          ? tables.map((e: { name: string }) => {
              return {
                label: e.name,
                value: e.name
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
      this.setState({
        gotBasicData: true
      })
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
            label: `${item.display_name}(${item.name})`,
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
          if (name === client_name && name === server_name) {
            return {
              label: item.display_name === item.name ? `${item.name}` : `${item.display_name}(${item.name})`,
              value: item.name,
              type: item.type,
              operatorOpts: item.operators
                ? item.operators.map((op: any) => {
                    return {
                      label: op,
                      value: op
                    }
                  })
                : []
            }
          }
          return [
            ...(item.client_name
              ? [
                  {
                    label: `${item.display_name}-客户端(${item.client_name})`,
                    value: item.client_name,
                    type: item.type,
                    sideType: 'from',
                    operatorOpts: item.operators
                      ? item.operators.map((op: any) => {
                          return {
                            label: op,
                            value: op
                          }
                        })
                      : []
                  }
                ]
              : []),
            ...(item.server_name
              ? [
                  {
                    label: `${item.display_name}-服务端(${item.server_name})`,
                    value: item.server_name,
                    type: item.type,
                    sideType: 'to',
                    operatorOpts: item.operators
                      ? item.operators.map((op: any) => {
                          return {
                            label: op,
                            value: op
                          }
                        })
                      : []
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
        subFuncOpts
      })
    } catch (error) {
      console.log(error)
    }
  }

  getRemoveBtnDisabled(parent: BasicDataWithId[], current: BasicDataWithId, targetKey?: string) {
    return (
      parent.length <= 1 ||
      (targetKey === 'groupBy' &&
        this.usingAccessRelationshipType &&
        parent.filter(parentItem => {
          return parentItem.sideType === current.sideType
        }).length <= 1)
    )
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
    const { formConfig, tagOpts, funcOpts, subFuncOpts, appTypeOpts, errorMsg, showErrorAlert } = this.state
    const formStyle = {
      width: '900px',
      maxWidth: '900px'
    }

    return (
      <Form
        onSubmit={() => {
          this.onSubmit()
        }}
        style={formStyle}
      >
        {() => (
          <>
            {showErrorAlert ? <Alert title={errorMsg} severity="error" onRemove={this.onAlertRemove} /> : null}
            <InlineField className="custom-label" label="APP TYPE" labelWidth={10}>
              <Select
                options={appTypeOpts}
                value={this.state.appType}
                onChange={(val: any) => this.onFieldChange('appType', val)}
                placeholder="APP TYPE"
              />
            </InlineField>
            <InlineField className="custom-label" label="DATABASE" labelWidth={10}>
              <Select
                options={this.databaseOptsAfterFilter}
                value={this.state.db}
                onChange={(val: any) => this.onFieldChange('db', val)}
                placeholder="DATABASE"
                key={this.state.db ? 'dbSelectWithVal' : 'dbSelectWithoutVal'}
              />
            </InlineField>
            <InlineField className="custom-label" label="FROM" labelWidth={10}>
              <Select
                options={this.tableOptsAfterFilter}
                value={this.state.from}
                onChange={(val: any) => this.onFieldChange('from', val)}
                placeholder="TABLE"
                key={this.state.from ? 'fromWithVal' : 'fromWithoutVal'}
              />
            </InlineField>
            {formConfig.map((conf: FormConfigItem, i: number) => {
              return (
                <>
                  <InlineField className="custom-label" label={conf.label} labelWidth={conf.labelWidth} key={i}>
                    <div className="w-100-percent">
                      {this.state[conf.targetDataKey].map((item: BasicDataWithId, index: number) => {
                        return (
                          <QueryEditorFormRow
                            config={formItemConfigs[conf.targetDataKey]}
                            basicData={item}
                            gotBasicData={this.state.gotBasicData}
                            db={this.state.db}
                            from={this.state.from}
                            usingGroupBy={this.usingGroupBy}
                            tagOpts={
                              conf.targetDataKey === 'select'
                                ? this.selectTagOpts
                                : conf.targetDataKey === 'groupBy'
                                ? tagOpts
                                    .filter(tag => {
                                      return tag.type !== 'map'
                                    })
                                    .filter((tag: MetricOptsItem) => {
                                      const accessRelationshipAllowTagTypes = ['resource', 'ip']
                                      const extra = this.usingAccessRelationshipType
                                        ? accessRelationshipAllowTagTypes.includes(tag.type as string) &&
                                          tag?.sideType === item!.sideType
                                        : true
                                      return (
                                        !GROUP_BY_DISABLE_TAGS.find((val: string) => {
                                          return (tag.value as string).includes(val)
                                        }) && extra
                                      )
                                    })
                                : tagOpts.filter(tag => {
                                    return tag.type !== 'map'
                                  })
                            }
                            metricOpts={
                              conf.targetDataKey === 'orderBy' ? this.orderByMetricOpts : this.basciMetricOpts
                            }
                            funcOpts={funcOpts}
                            subFuncOpts={subFuncOpts}
                            key={item.uuid}
                            showSideType={this.showSideType(this.state[conf.targetDataKey], item, conf.targetDataKey)}
                            keySelectDisabled={
                              (conf.targetDataKey === 'groupBy' && this.usingAppTraceType) ||
                              (conf.targetDataKey === 'orderBy' && this.usingAccessRelationshipType)
                            }
                            removeBtnDisabled={this.getRemoveBtnDisabled(
                              this.state[conf.targetDataKey],
                              item,
                              conf.targetDataKey
                            )}
                            // addBtnDisabled={conf.targetDataKey === 'groupBy' && this.usingAccessRelationshipType}
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
                  {conf.targetDataKey === 'groupBy' ? (
                    <InlineField className="custom-label" label="INTERVAL" labelWidth={10}>
                      <div className="w-100-percent">
                        <Select
                          key={this.state.interval ? '' : uuid()}
                          options={intervalOpts}
                          value={this.state.interval}
                          onChange={(val: any) => this.onFieldChange('interval', val)}
                          placeholder="TIME"
                          isClearable={true}
                          width={36.5}
                          disabled={this.usingAppTraceType || this.usingAccessRelationshipType}
                        />
                      </div>
                    </InlineField>
                  ) : null}
                </>
              )
            })}
            <InlineField className="custom-label" label="LIMIT" labelWidth={10}>
              <div className="w-100-percent">
                <Input
                  value={this.state.limit}
                  onChange={(ev: any) => this.onFieldChange('limit', ev.target)}
                  placeholder="LIMIT"
                />
              </div>
            </InlineField>
            <InlineField className="custom-label" label="OFFSET" labelWidth={10}>
              <div className="w-100-percent">
                <Input
                  value={this.state.offset}
                  onChange={(ev: any) => this.onFieldChange('offset', ev.target)}
                  placeholder="OFFSET"
                  disabled={!this.state.limit}
                />
              </div>
            </InlineField>
            {this.usingGroupBy && !this.usingAccessRelationshipType ? (
              <InlineField className="custom-label" label="AUTO AGG" labelWidth={10}>
                <div className="w-100-percent h32 row-start-center">
                  <Switch
                    value={this.state.resultGroupBy}
                    onChange={(ev: any) => this.onFieldChange('resultGroupBy', ev.target.checked)}
                  />
                </div>
              </InlineField>
            ) : null}
            <Button type="submit" className="save-btn">
              SUBMIT
            </Button>
          </>
        )}
      </Form>
    )
  }
}
