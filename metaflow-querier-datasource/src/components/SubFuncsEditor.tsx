import React, { useState } from 'react'
import { Select, Input, Icon, Button } from '@grafana/ui'
import { LabelItem, SelectOptsWithStringValue } from 'QueryEditor'

interface SubFuncsEditorProps {
  customClassName?: string
  subFuncs: any[]
  subFuncOpts: SelectOptsWithStringValue
  onSubFuncsChange: (newSubFuncs: GenFuncDisplayNameParam[]) => void
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
const mathOpreatorOpts = (Object.keys(mathOpsMap) as MathOpKeys[]).map((key: MathOpKeys) => {
  return {
    label: mathOpsMap[key],
    value: key
  }
})

export function SubFuncsEditor(props: SubFuncsEditorProps) {
  const [func, setFunc] = useState('')
  const [op, setOp] = useState('')
  const [params, setParams] = useState<number | undefined>(undefined)

  function genFuncDisplayName(item: GenFuncDisplayNameParam) {
    if (item.func.toLocaleLowerCase() === 'math') {
      return `${item.func}(${mathOpsMap[item.op as MathOpKeys]}${item.params as number})`
    }
    return item.func
  }

  const subFuncOpts = [
    ...props.subFuncOpts.filter((item: LabelItem & { value: string }) => {
      return !props.subFuncs.find((subFunc: any) => {
        return subFunc.func === item.value
      })
    }),
    {
      label: 'Math',
      value: 'Math'
    }
  ]

  const noFunc = !func
  const mathWithoutOpOrParams = func.toLocaleLowerCase() === 'math' && (!op || !Number.isInteger(params))
  const sunFuncsMaxLen = props.subFuncs.length >= 8
  const addBtnDisable = noFunc || mathWithoutOpOrParams || sunFuncsMaxLen

  function onAddBtnClick(ev: React.MouseEvent<HTMLButtonElement>) {
    const basic = {
      func,
      op,
      params
    }
    props.onSubFuncsChange([...props.subFuncs, basic])
    if (func.toLocaleLowerCase() !== 'math') {
      setFunc('')
      setOp('')
      setParams(undefined)
    }
    ev.stopPropagation()
    ev.preventDefault()
  }

  function onRemoveBtnClick(index: number) {
    props.subFuncs.splice(index, 1)
    props.onSubFuncsChange(props.subFuncs)
  }

  return (
    <div className={`${props.customClassName} sub-functions-wrap`}>
      <div className="sub-functions-editor">
        <p className="sub-functions-title">SUB FUNCTIONS:</p>
        <Select
          width={14}
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
            width={8}
            options={mathOpreatorOpts}
            value={op}
            onChange={ev => {
              setOp(ev.value || '')
            }}
            placeholder="OP"
          ></Select>
        ) : null}
        {func === 'Math' && op ? (
          <Input
            width={10}
            type="number"
            value={params}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
              }
            }}
            onChange={(ev: React.ChangeEvent<HTMLInputElement>) => {
              const { value } = ev.target
              const valueNumber = Number(value)
              setParams(valueNumber < 1 ? 1 : valueNumber)
            }}
            placeholder="NUMBER"
          ></Input>
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
