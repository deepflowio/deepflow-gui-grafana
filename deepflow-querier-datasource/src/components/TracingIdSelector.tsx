import React, { useState } from 'react'
import { Select } from '@grafana/ui'
import { LabelItem, SelectOpts } from 'QueryEditor'
import _ from 'lodash'

export const TracingIdSelector = (props: {
  tracingId: LabelItem | null
  templateVariableOpts: SelectOpts
  onChange: (ev: any) => void
}) => {
  const { tracingId, templateVariableOpts } = props

  const [selectInputOpts, setSelectInputOpts] = useState([
    ...(tracingId !== null
      ? [tracingId].filter((item: LabelItem) => {
          return !item.isVariable
        })
      : []),
    ...templateVariableOpts.map((item: LabelItem) => {
      return {
        ...item,
        value: `$${item.value}`
      }
    })
  ])

  return (
    <Select
      value={tracingId}
      options={selectInputOpts}
      onChange={v => {
        props.onChange(v)
      }}
      allowCustomValue
      onCreateOption={v => {
        const customValue = { value: v, label: v }
        setSelectInputOpts([...selectInputOpts, customValue])
        props.onChange(customValue)
      }}
      width="auto"
      key={tracingId ? 'selectWithVal' : 'selectWithoutVal'}
    />
  )
}
