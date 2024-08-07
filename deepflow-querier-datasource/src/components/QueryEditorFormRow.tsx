import React, { PureComponent } from 'react'

import { Select, Button, Input, RadioButtonGroup } from '@grafana/ui'
import { FuncSelectOpts, LabelItem, MetricOpts, SelectOpts, SelectOptsWithStringValue } from 'QueryEditor'
import _ from 'lodash'
import { SubFuncsEditor } from './SubFuncsEditor'
import { BasicDataWithId, FormTypes, MAP_METRIC_TYPE_NUM, PROFILING_REQUIRED_FIELDS } from 'consts'
import { TagValueSelector } from './TagValueSelector'
import { getRealKey, isAutoGroupTag, isEnumLikelyTag, TAG_OPERATORS_MAP } from 'utils/tools'
import { SelectableValue } from '@grafana/data'

export interface RowConfig {
  type: boolean
  func: boolean
  op: boolean
  val: boolean
  as: boolean
  sort?: boolean
  disableTimeTag?: boolean
}
export interface BasicData {
  type: 'tag' | 'metric'
  key: string
  func: string
  val: string | number | LabelItem | LabelItem[]
  op: string
  as: string
  params: string[]
  sort?: string
  subFuncs?: any[]
  sideType?: 'from' | 'to'
  whereOnly?: boolean
  isResourceType?: boolean
  isIpType?: boolean
  fromSelect?: BasicDataWithId
  cache?: {
    func: string
    params: string[]
    subFuncs: any[]
  }
  preFunc?: string
}

type Props = {
  rowType: FormTypes
  config: RowConfig
  basicData: BasicData
  onRowValChange: any
  onActiveBtnClick: any
  addBtnDisabled?: boolean
  removeBtnDisabled?: boolean
  typeSelectDisabled?: boolean
  tagOpts: MetricOpts
  metricOpts: MetricOpts
  funcOpts: FuncSelectOpts
  subFuncOpts: SelectOptsWithStringValue
  db: string
  from: string
  gotBasicData: boolean
  usingGroupBy: boolean
  templateVariableOpts: SelectOpts
  templateVariableOptsFull: SelectOpts
  uuid: string
  usingAlerting: boolean
  usingDerivativePreFunc: {
    hasNotSet: boolean
    commonPreFunc: any
  }
  usingProfilingType: boolean
}

const columnTypeOpts = [
  {
    label: 'tag',
    value: 'tag'
  },
  {
    label: 'metric',
    value: 'metric'
  }
]
const sortOpts: SelectOpts = [
  {
    label: 'ASC',
    value: 'asc'
  },
  {
    label: 'DESC',
    value: 'desc'
  }
]

const enumLikelyTagFuncs = [
  {
    label: 'Enum',
    value: 'Enum'
  }
] as FuncSelectOpts

const preFuncs = [
  {
    label: 'Derivative',
    value: 'Derivative'
  }
] as FuncSelectOpts

export class QueryEditorFormRow extends PureComponent<Props> {
  constructor(props: any) {
    super(props)
  }

  get operatorOpts(): SelectOpts {
    const { basicData, tagOpts, metricOpts, usingProfilingType } = this.props
    const data: MetricOpts = basicData.type === 'tag' ? tagOpts : metricOpts
    const result =
      data.find(item => {
        return item.value === getRealKey(basicData)
      })?.operatorOpts || []

    // profiling app type special handle
    const isSpecTag = ['profile_event_type'].includes(basicData.key)
    if (usingProfilingType && isSpecTag) {
      const inOperator = TAG_OPERATORS_MAP.IN
      result.push({
        label: inOperator.display_name,
        value: 'IN',
        // @ts-ignore
        description: inOperator.description
      })
    }
    return result
  }

  get currentTagType(): string {
    const { basicData, tagOpts } = this.props

    return (
      (tagOpts.find(item => {
        return item.value === getRealKey(basicData)
      })?.type as string) || ''
    )
  }

  get currentFuncOpts(): SelectOpts {
    if (
      isEnumLikelyTag({
        type: this.currentTagType
      })
    ) {
      return enumLikelyTagFuncs
    }
    const { basicData, metricOpts, funcOpts } = this.props
    const metricType = metricOpts.find(item => {
      return item.value === getRealKey(basicData)
    })?.type as number

    return funcOpts.filter(item => {
      return item.support_metric_types?.includes(metricType)
    })
  }

  get showSubFuncsEditor(): boolean {
    const { funcOpts } = this.props
    const { type, key, func, params, fromSelect } = this.props.basicData
    const result = funcOpts.find((e: any) => e.value === func)
    return (
      type === 'metric' &&
      !fromSelect &&
      !!key &&
      !!func &&
      (!Array.isArray(params) || (Array.isArray(params) && params.every(e => e))) &&
      !!result?.is_support_other_operators
    )
  }

  get showPreFuncsSelector(): boolean {
    const { config, db, basicData, usingGroupBy } = this.props
    const isPromDB = db === 'prometheus'
    const isValueMetrics = basicData.key.toLowerCase() === 'value'
    const { fromSelect } = basicData
    const result =
      usingGroupBy && config.func && !fromSelect && basicData.type === 'metric' && isPromDB && isValueMetrics

    if (!basicData.fromSelect && !result && 'preFunc' in basicData && basicData.preFunc !== undefined) {
      this.onPreFuncChange({
        value: undefined
      })
    }

    return result
  }

  get preFuncsOpts(): FuncSelectOpts {
    const { basicData } = this.props
    return this.showPreFuncsSelector && basicData.key ? preFuncs : []
  }

  get profilingRemoveBtnHidden(): boolean {
    const { usingProfilingType, basicData } = this.props
    return usingProfilingType && PROFILING_REQUIRED_FIELDS.includes(basicData.key)
  }

  onColumnTypeSelect = (val: SelectableValue<string>) => {
    const result = val ? val.value : ''
    this.props.onRowValChange({
      type: result,
      key: '',
      op: '',
      func: '',
      val: '',
      params: [],
      subFuncs: [],
      preFunc: undefined
    })
  }

  onColumnSelect = (val: any) => {
    const result = val ? val.value : ''
    const { config, db, from, tagOpts, metricOpts, funcOpts, basicData, usingGroupBy } = this.props
    const { hasNotSet, commonPreFunc } = this.props.usingDerivativePreFunc
    let newFuncOpts
    let _isEnumLikelyTag = false
    let metricType = -Infinity
    if (this.props.rowType === 'select' && basicData.type === 'tag') {
      const tagType = tagOpts.find(item => {
        return item.value === result
      })?.type
      _isEnumLikelyTag = isEnumLikelyTag({
        type: tagType
      })
      newFuncOpts = _isEnumLikelyTag ? enumLikelyTagFuncs : []
    } else {
      metricType = metricOpts.find(item => {
        return item.value === result
      })?.type as number
      newFuncOpts = funcOpts.filter(item => {
        return item.support_metric_types?.includes(metricType)
      })
    }

    const hasCurrentFunc =
      basicData?.cache?.func &&
      newFuncOpts.find(item => {
        return item.value === basicData?.cache?.func
      })

    const isPromDB = db === 'prometheus'
    const _fromSelect = val?.fromSelect

    const isValueMetrics = result.toLowerCase() === 'value'
    const showSubFuncsEditorWithNewVal =
      usingGroupBy && config.func && !_fromSelect && basicData.type === 'metric' && isPromDB && isValueMetrics

    const tableNameHasTotal = from.toLowerCase().endsWith('_total')

    this.props.onRowValChange({
      key: result,
      op: '',
      val: '',
      ...(hasCurrentFunc
        ? basicData!.cache
        : {
            func: '',
            params: [],
            subFuncs: []
          }),
      ...(isAutoGroupTag(result)
        ? {
            as: ''
          }
        : {}),
      ...(_isEnumLikelyTag
        ? {
            func: newFuncOpts[0].value
          }
        : {}),
      whereOnly: !!val?.whereOnly,
      sideType: val?.sideType,
      isResourceType: val?.type === 'resource',
      isIpType: val?.type === 'ip',
      fromSelect: val?.fromSelect,
      ...(basicData.type === 'metric'
        ? showSubFuncsEditorWithNewVal
          ? {
              preFunc: !result ? '' : hasNotSet && tableNameHasTotal ? 'Derivative' : commonPreFunc ?? ''
            }
          : { preFunc: undefined }
        : { preFunc: undefined })
    })
  }

  onPreFuncChange = (val: any) => {
    const result = val ? val.value : ''
    this.props.onRowValChange({
      preFunc: result
    })
  }

  onFuncChange = (val: any) => {
    const { funcOpts, basicData } = this.props
    const result = val ? val.value : ''
    const paramsLen =
      funcOpts.find(item => {
        return item.value === result
      })?.paramCount || 0
    this.props.onRowValChange({
      func: result,
      params: new Array(paramsLen).fill(''),
      subFuncs: basicData?.cache?.subFuncs || [],
      cache: {
        ...basicData?.cache,
        func: result,
        params: new Array(paramsLen).fill('')
      },
      ...(result === ''
        ? {
            subFuncs: []
          }
        : {})
    })
  }

  onFuncParamChange = (ev: any, index: number) => {
    const { basicData } = this.props
    const result = basicData.params.map(e => e)
    result[index] = ev.target ? ev.target.value : ev.value
    this.props.onRowValChange({
      params: Array.isArray(result) ? result : [],
      cache: {
        ...basicData?.cache,
        params: Array.isArray(result) ? result : []
      }
    })
  }

  onOperatorChange = (val: any) => {
    const result = val ? val.value : ''

    this.props.onRowValChange({
      op: result,
      val: this.props.basicData.type === 'tag' ? [] : ''
    })
  }

  onValueChange = (type: string, val: any) => {
    let value
    if (type === 'input') {
      value = val.target.value
    } else {
      value = val
    }
    this.props.onRowValChange({
      val: value
    })
  }

  onAsInput = (val: any) => {
    this.props.onRowValChange({
      as: val.target.value
    })
  }

  onSortChange = (val: any) => {
    this.props.onRowValChange({
      sort: val
    })
  }

  onSubFuncsChange = (val: any) => {
    this.props.onRowValChange({
      subFuncs: val,
      cache: {
        ...this.props.basicData?.cache,
        subFuncs: val
      }
    })
  }

  onActiveBtnClick = (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>, type: 'add' | 'remove') => {
    ev.preventDefault()
    this.props.onActiveBtnClick(type)
  }

  render() {
    const {
      rowType,
      config,
      basicData,
      tagOpts,
      metricOpts,
      usingGroupBy,
      addBtnDisabled,
      removeBtnDisabled,
      typeSelectDisabled,
      subFuncOpts,
      gotBasicData,
      usingAlerting,
      templateVariableOptsFull
    } = this.props
    const tagOptsAfterFilter = config.disableTimeTag
      ? tagOpts.filter(item => {
          return !['start_time', 'end_time'].includes(item.value as string)
        })
      : tagOpts
    const opts = basicData.type === 'tag' ? tagOptsAfterFilter : metricOpts

    // 当 key 存在, 且 opts 存在
    // 检查当前值是否存在在 opts 内, 若不存在, 置空 key 的值
    if (basicData.key && rowType !== 'groupBy' && gotBasicData) {
      const hasCurrentItem = opts.find((e: any) => {
        return e.value === basicData.key
      })
      if (!hasCurrentItem) {
        this.onColumnSelect('')
      } else {
        const fields = ['func', 'params', 'subFuncs']
        const current = _.pick(basicData, fields)
        if ('preFunc' in current) {
          fields.push('preFunc')
        }
        if (rowType === 'select') {
          if (!usingGroupBy && basicData.type === 'metric') {
            const target = {
              func: '',
              params: [],
              subFuncs: []
            }
            if ('preFunc' in current) {
              _.set(target, 'preFunc', undefined)
            }
            if (!_.isEqual(current, target)) {
              this.props.onRowValChange({
                ...target,
                cache: {
                  ...target
                }
              })
            }
          }
        } else if (rowType === 'where') {
          if (hasCurrentItem.fromSelect && hasCurrentItem.fromSelect.key !== getRealKey(basicData)) {
            this.props.onRowValChange({
              op: '',
              val: '',
              fromSelect: hasCurrentItem.fromSelect
            })
          }
        } else {
          if (basicData.type === 'metric' && hasCurrentItem.fromSelect) {
            const latest = _.pick(hasCurrentItem.fromSelect, fields)
            if (hasCurrentItem.fromSelect.key !== getRealKey(basicData) || !_.isEqual(current, latest)) {
              this.props.onRowValChange({
                fromSelect: hasCurrentItem.fromSelect,
                ...latest,
                cache: {
                  ...latest
                }
              })
            }
          }
        }
      }
    }

    return (
      <>
        <div className="editor-form-row">
          <div className="content">
            {config.type ? (
              <Select
                width="auto"
                options={columnTypeOpts}
                onChange={this.onColumnTypeSelect}
                placeholder="type"
                value={basicData.type}
                disabled={typeSelectDisabled}
              />
            ) : null}
            <div>
              <Select
                width="auto"
                options={opts}
                onChange={this.onColumnSelect}
                placeholder={`${basicData.type.toUpperCase()}`}
                value={basicData.key}
                isClearable={true}
                key={basicData.key ? 'keyWithVal' : 'keyWithoutVal'}
                disabled={rowType === 'groupBy' && usingAlerting}
              />
            </div>
            {this.showPreFuncsSelector ? (
              <Select
                width="auto"
                options={this.preFuncsOpts}
                onChange={this.onPreFuncChange}
                placeholder="PRE_FUNC"
                value={basicData.preFunc}
                isClearable={true}
                key={basicData.preFunc ? 'preFuncWithVal' : 'preFuncWithoutVal'}
                disabled={!usingGroupBy}
              />
            ) : null}
            {config.func &&
            !basicData.fromSelect &&
            (basicData.type === 'metric' ||
              isEnumLikelyTag({
                type: this.currentTagType
              })) ? (
              <Select
                width="auto"
                options={this.currentFuncOpts}
                onChange={this.onFuncChange}
                placeholder="FUNC"
                value={basicData.func}
                isClearable={true}
                key={basicData.func ? 'funcWithVal' : 'funcWithoutVal'}
                disabled={!usingGroupBy && basicData.type === 'metric'}
              />
            ) : null}
            {config.func && basicData.type === 'metric' && !basicData.fromSelect && Array.isArray(basicData.params)
              ? basicData.params.map((item: string | number, index: number) => {
                  const isPercent = basicData.func.toLowerCase().includes('percent')
                  const isTopK = basicData.func.toLowerCase() === 'topk'
                  if (!isPercent && !isTopK) {
                    return null
                  }
                  const options = isPercent
                    ? new Array(99).fill('').map((e, i) => {
                        const res = 99 - i
                        return {
                          label: `${res}`,
                          value: res
                        }
                      })
                    : new Array(isPercent ? 99 : 100).fill('').map((e, i) => {
                        return {
                          label: `${i + 1}`,
                          value: i + 1
                        }
                      })
                  return isPercent || isTopK ? (
                    <Select
                      width="auto"
                      options={options}
                      onChange={ev => this.onFuncParamChange(ev, index)}
                      value={item}
                      key={index}
                      placeholder={`param${index + 1}`}
                      isClearable={true}
                    />
                  ) : (
                    <Input
                      value={item}
                      key={index}
                      onChange={ev => this.onFuncParamChange(ev, index)}
                      placeholder={`param${index + 1}`}
                      width={12}
                    ></Input>
                  )
                })
              : null}
            {config.op ? (
              <Select
                width="auto"
                options={this.operatorOpts}
                onChange={this.onOperatorChange}
                placeholder="OP"
                value={basicData.op}
                className="op-selector"
                key={basicData.op ? 'opWithVal' : 'opWithoutVal'}
              />
            ) : null}
            {config.val ? (
              basicData.type === 'tag' ? (
                <TagValueSelector
                  parentProps={this.props}
                  onChange={(ev: any) => this.onValueChange('asyncselect', ev)}
                ></TagValueSelector>
              ) : (
                <Input
                  value={basicData.val as string}
                  onChange={(ev: any) => this.onValueChange('input', ev)}
                  width={12}
                ></Input>
              )
            ) : null}
            {config.as ? (
              <>
                <span>AS</span>
                <Input
                  value={basicData.as}
                  onChange={this.onAsInput}
                  disabled={
                    isAutoGroupTag(basicData.key) ||
                    metricOpts.find(e => e.value === basicData.key)?.type === MAP_METRIC_TYPE_NUM
                  }
                  width={12}
                ></Input>
              </>
            ) : null}
            {config.sort ? (
              <RadioButtonGroup options={sortOpts} value={basicData.sort} size="md" onChange={this.onSortChange} />
            ) : null}
          </div>
          <div className="active-btns row-start-center">
            <Button
              fill="outline"
              variant="secondary"
              icon="plus"
              onClick={ev => this.onActiveBtnClick(ev, 'add')}
              disabled={addBtnDisabled}
            ></Button>
            {!this.profilingRemoveBtnHidden ? (
              <Button
                disabled={removeBtnDisabled}
                fill="outline"
                variant="secondary"
                icon="trash-alt"
                onClick={ev => this.onActiveBtnClick(ev, 'remove')}
              ></Button>
            ) : null}
          </div>
        </div>
        {this.showSubFuncsEditor ? (
          <SubFuncsEditor
            subFuncs={basicData.subFuncs as any[]}
            subFuncOpts={subFuncOpts}
            onSubFuncsChange={this.onSubFuncsChange}
            usingAlerting={usingAlerting}
            templateVariableOptsFull={templateVariableOptsFull}
          ></SubFuncsEditor>
        ) : null}
      </>
    )
  }
}
