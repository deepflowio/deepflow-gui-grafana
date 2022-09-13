import React, { useState } from 'react'

import { Select, AsyncSelect } from '@grafana/ui'
import { SelectOpts } from 'QueryEditor'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import { getRealKey } from 'utils/tools'

const TAG_VAL_OPTS_LABEL_SHOW_VALUE = ['server_port']

export const TagValueSelector = (props: {
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
        const valMatch = TAG_VAL_OPTS_LABEL_SHOW_VALUE.includes(getRealKey(basicData)) ? itemVal.includes(_val) : false
        return itemDisplayName.includes(_val) || valMatch
      }
    }

    // @ts-ignore
    const data = await querierJs.getTagValues(getRealKey(basicData), from, db, options)

    const result = data.map((item: any) => {
      return {
        label: TAG_VAL_OPTS_LABEL_SHOW_VALUE.includes(getRealKey(basicData))
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
