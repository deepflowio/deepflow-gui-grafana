import React, { PureComponent } from 'react'

import { Select, Button, Input, RadioButtonGroup } from '@grafana/ui'
import { FuncSelectOpts, LabelItem, MetricOpts, SelectOpts, SelectOptsWithStringValue } from 'QueryEditor'
import _ from 'lodash'
import { SubFuncsEditor } from './SubFuncsEditor'
import { BasicDataWithId, FormTypes, MAP_METRIC_TYPE_NUM } from 'consts'
import { TagValueSelector } from './TagValueSelector'
import { getRealKey, isEnumLikelyTag } from 'utils/tools'

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
  uuid: string
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

export class QueryEditorFormRow extends PureComponent<Props> {
  constructor(props: any) {
    super(props)
  }

  get operatorOpts(): SelectOpts {
    const { basicData, tagOpts, metricOpts } = this.props
    const result: MetricOpts = basicData.type === 'tag' ? tagOpts : metricOpts
    return (
      result.find(item => {
        return item.value === getRealKey(basicData)
      })?.operatorOpts || []
    )
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
    const { type, key, func, params, fromSelect } = this.props.basicData
    return (
      type === 'metric' &&
      !fromSelect &&
      !!key &&
      !!func &&
      (!Array.isArray(params) || (Array.isArray(params) && params.every(e => e)))
    )
  }

  onColumnTypeSelect = (val: any) => {
    const result = val ? val.value : ''
    this.props.onRowValChange({
      type: result,
      key: '',
      op: '',
      func: '',
      val: '',
      params: [],
      subFuncs: []
    })
  }

  onColumnSelect = (val: any) => {
    const result = val ? val.value : ''
    const { tagOpts, metricOpts, funcOpts, basicData } = this.props

    let newFuncOpts
    let _isEnumLikelyTag = false
    if (this.props.rowType === 'select' && basicData.type === 'tag') {
      const tagType = tagOpts.find(item => {
        return item.value === result
      })?.type
      _isEnumLikelyTag = isEnumLikelyTag({
        type: tagType
      })
      newFuncOpts = _isEnumLikelyTag ? enumLikelyTagFuncs : []
    } else {
      const metricType = metricOpts.find(item => {
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
      ...(result.includes('resource_gl')
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
      fromSelect: val?.fromSelect
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
      cache: {
        ...basicData?.cache,
        func: result,
        params: new Array(paramsLen).fill('')
      }
    })
  }

  onFuncParamChange = (ev: any, index: number) => {
    const { basicData } = this.props
    const result = basicData.params.map(e => e)
    result[index] = ev.target.value
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
      gotBasicData
    } = this.props
    const tagOptsFilted = config.disableTimeTag
      ? tagOpts.filter(item => {
          return !['start_time', 'end_time'].includes(item.value as string)
        })
      : tagOpts
    const opts = basicData.type === 'tag' ? tagOptsFilted : metricOpts

    // 当 key 存在, 且 opts 存在
    // 检查当前值是否存在在 opts 内, 若不存在, 置空 key 的值
    if (basicData.key && rowType !== 'groupBy' && gotBasicData) {
      const hasCurrentItem = opts.find((e: any) => {
        return e.value === basicData.key
      })
      if (!hasCurrentItem) {
        this.onColumnSelect('')
      } else {
        const current = _.pick(basicData, ['func', 'params', 'subFuncs'])
        if (rowType === 'select') {
          if (!usingGroupBy && basicData.type === 'metric') {
            const target = {
              func: '',
              params: [],
              subFuncs: []
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
            const latest = _.pick(hasCurrentItem.fromSelect, ['func', 'params', 'subFuncs'])
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
              />
            </div>
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
              ? basicData.params.map((item: string, index: number) => {
                  return (
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
                  currentTagType={this.currentTagType}
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
                    basicData.key.includes('resource_gl') ||
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
            <Button
              disabled={removeBtnDisabled}
              fill="outline"
              variant="secondary"
              icon="trash-alt"
              onClick={ev => this.onActiveBtnClick(ev, 'remove')}
            ></Button>
          </div>
        </div>
        {this.showSubFuncsEditor ? (
          <SubFuncsEditor
            subFuncs={basicData.subFuncs as any[]}
            subFuncOpts={subFuncOpts}
            onSubFuncsChange={this.onSubFuncsChange}
          ></SubFuncsEditor>
        ) : null}
      </>
    )
  }
}
