import React, { PureComponent, useState } from 'react'

import { Select, AsyncSelect, Button, Input, RadioButtonGroup } from '@grafana/ui'
import { FuncSelectOpts, LabelItem, MetricOpts, SelectOpts, SelectOptsWithStringValue } from 'QueryEditor'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import { SubFuncsEditor } from './SubFuncsEditor'

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
  subFuncs?: []
  sideType?: 'from' | 'to'
  whereOnly?: boolean
  isResourceType?: boolean
  isIpType?: boolean
}

type Props = {
  config: RowConfig
  basicData: BasicData
  onRowValChange: any
  onActiveBtnClick: any
  addBtnDisabled?: boolean
  removeBtnDisabled?: boolean
  typeSelectDisabled?: boolean
  keySelectDisabled?: boolean
  tagOpts: MetricOpts
  metricOpts: MetricOpts
  funcOpts: FuncSelectOpts
  subFuncOpts: SelectOptsWithStringValue
  db: string
  from: string
  gotBasicData: boolean
  usingGroupBy: boolean
  templateVariableOpts: SelectOpts
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

const TAG_VAL_OPTS_LABEL_SHOW_VALUE = ['server_port']
const BasicSelectAsync = (props: {
  parentProps: {
    db: string
    from: string
    basicData: any
    gotBasicData: boolean
    templateVariableOpts: SelectOpts
  }
  currentTagType: string
  isMulti: boolean
  useInput: boolean
  onChange: (ev: any) => void
}) => {
  const { db, from, basicData, gotBasicData, templateVariableOpts } = props.parentProps
  const { useInput } = props
  const boolOpts = [
    {
      label: '是',
      value: 1
    },
    {
      label: '否',
      value: 0
    }
  ]

  const loadTagValOpts = async (val: string) => {
    if (!db || !from || !basicData.key) {
      return []
    }
    const options = {
      search(item: any) {
        const _val = val.toLocaleLowerCase()
        const itemDisplayName = (item.display_name as string).toLocaleLowerCase()
        const itemVal = `${item.value}`.toLocaleLowerCase()
        const valMatch = TAG_VAL_OPTS_LABEL_SHOW_VALUE.includes(basicData.key) ? itemVal.includes(_val) : false
        return itemDisplayName.includes(_val) || valMatch
      }
    }

    // @ts-ignore
    const data = await querierJs.getTagValues(basicData.key, from, db, options)

    const result = data.map((item: any) => {
      return {
        label: TAG_VAL_OPTS_LABEL_SHOW_VALUE.includes(basicData.key)
          ? `${item.display_name}(${item.value})`
          : item.display_name,
        value: item.value
      }
    })
    return result.concat(templateVariableOpts)
  }

  const [selectInputOpts, setSelectInputOpts] = useState(
    [
      ...(Array.isArray(basicData.val)
        ? basicData.val.map((e: string) => {
            return typeof e === 'string'
              ? {
                  label: e,
                  value: e
                }
              : e
          })
        : basicData.val !== ''
        ? [
            {
              label: basicData.val,
              value: basicData.val
            }
          ]
        : [])
    ].concat(templateVariableOpts)
  )
  return gotBasicData && props.currentTagType !== '' && typeof useInput === 'boolean' ? (
    props.currentTagType === 'bool' ? (
      <Select
        options={boolOpts}
        value={basicData.val}
        onChange={v => {
          props.onChange(v)
        }}
      />
    ) : useInput ? (
      <Select
        value={basicData.val}
        options={selectInputOpts}
        onChange={v => {
          props.onChange(v)
        }}
        allowCustomValue
        onCreateOption={v => {
          const customValue = { value: v, label: v }
          setSelectInputOpts([...selectInputOpts, customValue])
          if (props.isMulti) {
            props.onChange([...basicData.val, customValue])
          } else {
            props.onChange(v)
          }
        }}
        isMulti={props.isMulti}
      />
    ) : (
      <AsyncSelect
        value={basicData.val}
        loadOptions={loadTagValOpts}
        defaultOptions
        onChange={v => {
          props.onChange(v)
        }}
        isMulti={props.isMulti}
      />
    )
  ) : null
}

const INPUT_TAG_VAL_TYPES = ['int', 'string', 'ip', 'mac']
const SELECT_TAG_VAL_OPS = ['=', '!=', 'IN', 'NOT IN']

export class QueryEditorFormRow extends PureComponent<Props> {
  state: {
    funcsCache?: {
      func: string
      params: string[]
      subFuncs: any[]
    }
  }
  static defaultProps = {}
  constructor(props: any) {
    super(props)
    const { type, func, params, subFuncs } = this.props.basicData
    if (type === 'metric') {
      this.state = {
        funcsCache: {
          func,
          params,
          subFuncs: subFuncs || []
        }
      }
    } else {
      this.state = {}
    }
  }

  get operatorOpts(): SelectOpts {
    const { basicData, tagOpts, metricOpts } = this.props
    const result: MetricOpts = basicData.type === 'tag' ? tagOpts : metricOpts
    return (
      result.find(item => {
        return item.value === basicData.key
      })?.operatorOpts || []
    )
  }

  get currentTagType(): string {
    const { basicData, tagOpts } = this.props

    return (
      (tagOpts.find(item => {
        return item.value === basicData.key
      })?.type as string) || ''
    )
  }

  get currentFuncOpts(): SelectOpts {
    const { basicData, metricOpts, funcOpts } = this.props
    const metricType = metricOpts.find(item => {
      return item.value === basicData.key
    })?.type as number

    return funcOpts.filter(item => {
      return item.support_metric_types?.includes(metricType)
    })
  }

  get showSubFuncsEditor(): boolean {
    const { type, key, func, params } = this.props.basicData
    return (
      type === 'metric' &&
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
    const { metricOpts, funcOpts } = this.props
    const metricType = metricOpts.find(item => {
      return item.value === result
    })?.type as number

    const newFuncOpts = funcOpts.filter(item => {
      return item.support_metric_types?.includes(metricType)
    })
    const { funcsCache } = this.state
    const hasCurrentFunc =
      funcsCache &&
      newFuncOpts.find(item => {
        return item.value === funcsCache.func
      })

    this.props.onRowValChange({
      key: result,
      op: '',
      val: '',
      ...(hasCurrentFunc
        ? funcsCache
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
      whereOnly: !!val?.whereOnly,
      sideType: val?.sideType,
      isResourceType: val?.type === 'resource',
      isIpType: val?.type === 'ip'
    })
  }

  onFuncChange = (val: any) => {
    const { funcOpts } = this.props
    const result = val ? val.value : ''
    const paramsLen =
      funcOpts.find(item => {
        return item.value === result
      })?.paramCount || 0
    this.props.onRowValChange({
      func: result,
      params: new Array(paramsLen).fill('')
    })
    this.setState({
      funcsCache: {
        ...this.state.funcsCache,
        func: result,
        params: new Array(paramsLen).fill('')
      }
    })
  }

  onFuncParamChange = (ev: any, index: number) => {
    const result = this.props.basicData.params.map(e => e)
    result[index] = ev.target.value
    this.props.onRowValChange({
      params: Array.isArray(result) ? result : []
    })
    this.setState({
      funcsCache: {
        ...this.state.funcsCache,
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
      subFuncs: val
    })
    this.setState({
      funcsCache: {
        ...this.state.funcsCache,
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
      config,
      basicData,
      tagOpts,
      metricOpts,
      usingGroupBy,
      addBtnDisabled,
      removeBtnDisabled,
      keySelectDisabled,
      typeSelectDisabled,
      subFuncOpts
    } = this.props
    const tagOptsFilted = config.disableTimeTag
      ? tagOpts.filter(item => {
          return !['start_time', 'end_time'].includes(item.value as string)
        })
      : tagOpts
    const opts = basicData.type === 'tag' ? tagOptsFilted : metricOpts
    const columnWidthFix = config.type ? 0 : 10.5

    // 当 type 为 metric, 且 key 存在, 且 opts 存在
    // 检查当前值是否存在在 opts 内, 若不存在, 置空 key 的值
    if (basicData.type === 'metric' && basicData.key && metricOpts.length) {
      const hasCurrentMetric = metricOpts.find((e: any) => {
        return e.value === basicData.key
      })
      if (!hasCurrentMetric) {
        this.onColumnSelect('')
      }
    }

    return (
      <div>
        <div className="editor-form-row">
          <div className="content">
            {config.type ? (
              <div>
                <Select
                  width={10}
                  options={columnTypeOpts}
                  onChange={this.onColumnTypeSelect}
                  placeholder="type"
                  value={basicData.type}
                  disabled={typeSelectDisabled}
                />
              </div>
            ) : null}
            <div>
              <Select
                width={basicData.type === 'tag' ? 45.5 + columnWidthFix : 26 + columnWidthFix}
                options={opts}
                onChange={this.onColumnSelect}
                placeholder={`${basicData.type.toUpperCase()}`}
                value={basicData.key}
                isClearable={true}
                disabled={keySelectDisabled}
                key={basicData.key ? 'keyWithVal' : 'keyWithoutVal'}
              />
            </div>
            {config.func && basicData.type === 'metric' ? (
              usingGroupBy ? (
                <div>
                  <Select
                    width={19}
                    options={this.currentFuncOpts}
                    onChange={this.onFuncChange}
                    placeholder="FUNC"
                    value={basicData.func}
                    isClearable={true}
                    key={basicData.func ? 'funcWithVal' : 'funcWithoutVal'}
                    disabled={keySelectDisabled}
                  />
                </div>
              ) : (
                <div>
                  <Select
                    width={19}
                    options={[]}
                    onChange={() => {}}
                    placeholder="FUNC"
                    isClearable={true}
                    key={'funcSelectDisabled'}
                    disabled
                  />
                </div>
              )
            ) : null}
            {config.func && basicData.type === 'metric' && Array.isArray(basicData.params)
              ? basicData.params.map((item: string, index: number) => {
                  return (
                    <Input
                      value={item}
                      key={index}
                      onChange={ev => this.onFuncParamChange(ev, index)}
                      placeholder={`param${index + 1}`}
                    ></Input>
                  )
                })
              : null}
            {config.op ? (
              <div>
                <Select
                  width={8}
                  options={this.operatorOpts}
                  onChange={this.onOperatorChange}
                  placeholder="OP"
                  value={basicData.op}
                  className="op-selector"
                  key={basicData.op ? 'opWithVal' : 'opWithoutVal'}
                />
              </div>
            ) : null}
            {config.val ? (
              basicData.type === 'tag' ? (
                <BasicSelectAsync
                  parentProps={this.props}
                  currentTagType={this.currentTagType}
                  onChange={(ev: any) => this.onValueChange('asyncselect', ev)}
                  isMulti={['IN', 'NOT IN', 'LIKE', 'NOT LIKE'].includes(basicData.op)}
                  useInput={
                    INPUT_TAG_VAL_TYPES.includes(this.currentTagType) || !SELECT_TAG_VAL_OPS.includes(basicData.op)
                  }
                ></BasicSelectAsync>
              ) : (
                <Input value={basicData.val as string} onChange={(ev: any) => this.onValueChange('input', ev)}></Input>
              )
            ) : null}
            {config.as ? (
              <>
                <span>AS</span>
                <Input
                  value={basicData.as}
                  onChange={this.onAsInput}
                  disabled={basicData.key.includes('resource_gl')}
                ></Input>
              </>
            ) : null}
            {config.sort ? (
              <RadioButtonGroup
                options={sortOpts}
                value={basicData.sort}
                size="md"
                onChange={this.onSortChange}
                disabled={keySelectDisabled}
              />
            ) : null}
          </div>
          <div className="active-btns row-start-center">
            <Button
              fill="outline"
              variant="secondary"
              icon="plus"
              onClick={ev => this.onActiveBtnClick(ev, 'add')}
              disabled={addBtnDisabled || keySelectDisabled}
            ></Button>
            <Button
              disabled={removeBtnDisabled || keySelectDisabled}
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
      </div>
    )
  }
}
