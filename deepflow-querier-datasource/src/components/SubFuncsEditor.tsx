import React, { useState } from 'react'
import { Select, Icon, Button } from '@grafana/ui'
import { LabelItem, SelectOpts, SelectOptsWithStringValue } from 'QueryEditor'
import { SelectableValue } from '@grafana/data'
import { VAR_INTERVAL_LABEL } from 'consts'
interface SubFuncsEditorProps {
  customClassName?: string
  subFuncs: any[]
  subFuncOpts: SelectOptsWithStringValue
  onSubFuncsChange: (newSubFuncs: GenFuncDisplayNameParam[]) => void
  usingAlerting: boolean
  templateVariableOptsFull: SelectOpts
}

interface GenFuncDisplayNameParam {
  func: string
  op: string
  params: number | undefined
}

interface MathOpsMap {
  ADD: '+'
  SUBTRACT: '-'
  MULTIPLY: '*'
  DIVIDE: '/'
}
const mathOpsMap: MathOpsMap = {
  ADD: '+',
  SUBTRACT: '-',
  MULTIPLY: '*',
  DIVIDE: '/'
} as const
type MathOpKeys = keyof MathOpsMap
const mathOperatorOpts = (Object.keys(mathOpsMap) as MathOpKeys[]).map((key: MathOpKeys) => {
  return {
    label: mathOpsMap[key],
    value: key
  }
})

export function SubFuncsEditor(props: SubFuncsEditorProps) {
  const [func, setFunc] = useState('')
  const [op, setOp] = useState('')
  const [params, setParams] = useState<number | string | undefined>(undefined)

  function genFuncDisplayName(item: GenFuncDisplayNameParam) {
    if (item.func.toLocaleLowerCase() === 'math') {
      return `${item.func}(${mathOpsMap[item.op as MathOpKeys]}${item.params as number})`
    }
    return item.func
  }

  const subFuncOpts = [
    ...props.subFuncOpts.filter((item: LabelItem & { value: string }) => {
      return (
        item.value.toLocaleLowerCase() !== 'histogram' &&
        !props.subFuncs.find((subFunc: any) => {
          return subFunc.func === item.value
        })
      )
    }),
    {
      label: 'Math',
      value: 'Math'
    }
  ]

  const noFunc = !func
  const isVariableParams = props.templateVariableOptsFull.find(e => e.label === params)
  const mathWithoutOpOrParams =
    func.toLocaleLowerCase() === 'math' &&
    (!op || !(Number.isInteger(params) || params === VAR_INTERVAL_LABEL || isVariableParams))
  const sunFuncsMaxLen = props.subFuncs.length >= 8
  const addBtnDisable = noFunc || mathWithoutOpOrParams || sunFuncsMaxLen

  function onAddBtnClick(ev: React.MouseEvent<HTMLButtonElement>) {
    const basic: {
      func: string
      op?: string
      params?: number | string
    } = {
      func
    }
    if (func.toLocaleLowerCase() !== 'math') {
      setFunc('')
      setOp('')
      setParams(undefined)
    } else {
      basic.op = op
      basic.params = params
    }
    props.onSubFuncsChange([...props.subFuncs, basic])
    ev.stopPropagation()
    ev.preventDefault()
  }

  function onRemoveBtnClick(index: number) {
    props.subFuncs.splice(index, 1)
    props.onSubFuncsChange(props.subFuncs)
  }

  const [numberOpts, setNumberOpts] = useState<SelectOpts>(
    !props.usingAlerting
      ? [
          ...props.templateVariableOptsFull
            .filter(e => {
              return e.variableType === 'interval'
            })
            .map(e => {
              return {
                ...e,
                value: e.value
                // value: e.label
              }
            }),
          {
            label: VAR_INTERVAL_LABEL,
            value: VAR_INTERVAL_LABEL
          }
        ]
      : []
  )

  return (
    <div
      className={`${props.customClassName || ''} sub-functions-wrap`}
      style={{
        marginBottom: '4px'
      }}
    >
      <div className="sub-functions-editor">
        <p className="sub-functions-title">SUB FUNCTIONS:</p>
        <Select
          width="auto"
          options={subFuncOpts}
          value={func}
          onChange={ev => {
            const val = ev.value as string
            setFunc(val || '')
          }}
          placeholder="SUB FUNC"
          key={func ? 'funcSelWithValue' : 'funcSelWithoutValue'}
        ></Select>
        {func === 'Math' ? (
          <Select
            width="auto"
            options={mathOperatorOpts}
            value={op}
            onChange={ev => {
              setOp(ev.value || '')
            }}
            placeholder="OP"
          ></Select>
        ) : null}
        {func === 'Math' && op ? (
          <Select
            allowCustomValue
            options={numberOpts}
            value={params}
            onCreateOption={v => {
              const valueNumber = parseInt(v, 10)
              let _v: number
              if (isNaN(valueNumber)) {
                return
              } else if (valueNumber < 1) {
                _v = 1
              } else {
                _v = valueNumber
              }
              const customValue = { value: _v, label: `${_v}` }
              setNumberOpts([...numberOpts, customValue])
              setParams(_v)
            }}
            onChange={(value: SelectableValue<string | number>) => {
              setParams(value.value)
            }}
            width="auto"
            key={
              (Array.isArray(params) && params.length) || (!Array.isArray(params) && params)
                ? 'selectWithVal'
                : 'selectWithoutVal'
            }
          />
        ) : null}
        <Button
          fill="outline"
          variant="secondary"
          icon="angle-double-right"
          onClick={(ev: React.MouseEvent<HTMLButtonElement>) => {
            onAddBtnClick(ev)
          }}
          disabled={addBtnDisable}
        ></Button>
      </div>

      <div className="sub-functions-list">
        {props.subFuncs.map((e: any, index: number) => {
          return (
            <div className="sub-function-item" key={index}>
              <span>{genFuncDisplayName(e)}</span>
              <Icon
                name="times"
                className="remove-icon"
                onClick={() => {
                  onRemoveBtnClick(index)
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
