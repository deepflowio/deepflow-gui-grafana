import React, { useState, useMemo } from 'react'
import { Select, Input, AsyncSelect } from '@grafana/ui'
import { SelectOpts } from 'QueryEditor'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import { genGetTagValuesSql, getRealKey } from 'utils/tools'
import { getTagMapCache } from 'utils/cache'

const TAG_VAL_OPTS_LABEL_SHOW_VALUE = ['server_port']
export const INPUT_TAG_VAL_TYPES = ['int', 'ip', 'mac']
export const SELECT_TAG_VAL_OPS = ['=', '!=', 'IN', 'NOT IN']

export const TagValueSelector = (props: {
  parentProps: {
    db: string
    from: string
    basicData: any
    gotBasicData: boolean
    templateVariableOpts: SelectOpts
    uuid: string
  }
  currentTagType: string
  onChange: (ev: any) => void
}) => {
  const { db, from, basicData, gotBasicData, templateVariableOpts, uuid } = props.parentProps
  const { currentTagType } = props
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

  const useInput = useMemo(() => {
    return INPUT_TAG_VAL_TYPES.includes(currentTagType) || !SELECT_TAG_VAL_OPS.includes(basicData.op)
  }, [currentTagType, basicData.op])

  const isMulti = useMemo(() => {
    return ['IN', 'NOT IN', 'LIKE', 'NOT LIKE'].includes(basicData.op)
  }, [basicData.op])

  const loadTagValOpts = async (keyword: string) => {
    if (!db || !from || !basicData.key) {
      return []
    }

    const tagMapItem = getTagMapCache(db, from, basicData.key)
    // @ts-ignore
    const data = await querierJs.searchBySql(
      genGetTagValuesSql({
        tagName: tagMapItem.name,
        tagType: tagMapItem.type,
        from,
        keyword
      }),
      db,
      (d: any) => {
        return {
          ...d,
          // add requestId to cancel request
          requestId: uuid
        }
      }
    )

    const opts = data.map((item: any) => {
      return {
        label: TAG_VAL_OPTS_LABEL_SHOW_VALUE.includes(getRealKey(basicData))
          ? `${item.display_name}(${item.value})`
          : item.display_name,
        value: item.value
      }
    })
    const result = templateVariableOpts.concat(opts)
    return result
  }

  const [selectInputOpts, setSelectInputOpts] = useState(
    useInput
      ? [
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
      : []
  )

  return gotBasicData && props.currentTagType !== '' && typeof useInput === 'boolean' ? (
    props.currentTagType === 'bool' ? (
      <Select
        options={boolOpts}
        value={basicData.val}
        onChange={v => {
          props.onChange(v)
        }}
        width="auto"
        key={
          (Array.isArray(basicData.val) && basicData.val.length) || (!Array.isArray(basicData.val) && basicData.val)
            ? 'selectWithVal'
            : 'selectWithoutVal'
        }
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
          if (isMulti) {
            props.onChange([...basicData.val, customValue])
          } else {
            props.onChange(v)
          }
        }}
        isMulti={isMulti}
        width="auto"
        key={
          (Array.isArray(basicData.val) && basicData.val.length) || (!Array.isArray(basicData.val) && basicData.val)
            ? 'selectWithVal'
            : 'selectWithoutVal'
        }
      />
    ) : (
      <AsyncSelect
        value={basicData.val}
        loadOptions={loadTagValOpts}
        defaultOptions
        onChange={v => {
          props.onChange(v)
        }}
        isMulti={isMulti}
        width="auto"
        key={
          (Array.isArray(basicData.val) && basicData.val.length) || (!Array.isArray(basicData.val) && basicData.val)
            ? 'selectWithVal'
            : 'selectWithoutVal'
        }
      />
    )
  ) : (
    <Input width={12} placeholder="VALUE" disabled />
  )
}
