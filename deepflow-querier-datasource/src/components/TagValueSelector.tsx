import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Select, Input, AsyncSelect } from '@grafana/ui'
import { LabelItem, SelectOpts } from 'QueryEditor'
import _ from 'lodash'
import * as querierJs from 'deepflow-sdk-js'
import { genGetTagValuesSql, getRealKey } from 'utils/tools'
import { getTagMapCache } from 'utils/cache'
import { PROFILING_REQUIRED_FIELDS } from 'consts'

export const INPUT_TAG_VAL_TYPES = ['int', 'ip', 'mac', 'ip_array']
export const SELECT_TAG_VAL_OPS = ['=', '!=', 'IN', 'NOT IN']
export const MULTI_SELECT_TAG_VAL_OPS = ['IN', 'NOT IN', 'LIKE', 'NOT LIKE']

export const TagValueSelector = (props: {
  parentProps: {
    db: string
    from: string
    basicData: any
    gotBasicData: boolean
    templateVariableOpts: SelectOpts
    uuid: string
    usingProfilingType: boolean
  }
  onChange: (ev: any) => void
}) => {
  const { db, from, basicData, gotBasicData, templateVariableOpts, uuid, usingProfilingType } = props.parentProps
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

  const tagMapItem = useMemo(() => {
    if (!db || !from || !basicData.key) {
      return {}
    }
    return getTagMapCache(db, from, getRealKey(basicData)) || {}
  }, [db, from, basicData])

  const useInput = useMemo(() => {
    return INPUT_TAG_VAL_TYPES.includes(tagMapItem.type) || !SELECT_TAG_VAL_OPS.includes(basicData.op)
  }, [tagMapItem.type, basicData.op])

  const isProfilingSpecTags = useMemo(() => {
    return usingProfilingType && PROFILING_REQUIRED_FIELDS.includes(basicData.key)
  }, [basicData.key, usingProfilingType])

  const isMulti = useMemo(() => {
    return MULTI_SELECT_TAG_VAL_OPS.includes(basicData.op)
  }, [basicData.op])

  const loadTagValOpts = useCallback(
    async (keyword: string) => {
      const nullOption = {
        label: 'NULL',
        value: 0
      }
      const addNullOption = tagMapItem.type === 'resource' && ['IN', 'NOT IN'].includes(basicData.op)
      if (!db || !from || !basicData.key) {
        return addNullOption ? [nullOption] : []
      }

      let opts: LabelItem[] = []
      try {
        // @ts-ignore
        const data = await querierJs.searchBySql(
          tagMapItem.name === 'profile_event_type'
            ? `SELECT profile_event_type AS \`value\`, profile_event_type AS \`display_name\` FROM ${from} GROUP BY profile_event_type`
            : genGetTagValuesSql({
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

        if (tagMapItem.name === 'profile_event_type') {
        }

        opts = [
          // if is not tag of resource type, gen custom option by keyword
          ...(tagMapItem.type !== 'resource' &&
          keyword &&
          data.find((item: any) => {
            return item.display_name !== keyword
          })
            ? [
                {
                  label: `${keyword} (by input)`,
                  value: keyword
                }
              ]
            : []),
          ...data.map((item: any) => {
            return {
              label: item.display_name,
              value: item.value
            }
          })
        ]
      } catch (error) {
        console.log(error)
      }

      return [...templateVariableOpts, ...(addNullOption ? [nullOption] : []), ...opts]
    },
    [uuid, templateVariableOpts, db, from, basicData, tagMapItem]
  )

  const [selectInputOpts, setSelectInputOpts] = useState<SelectOpts>([])

  useEffect(() => {
    if (useInput) {
      setSelectInputOpts(
        [
          ...(Array.isArray(basicData.val) ? basicData.val : [basicData.val])
            .filter((item: LabelItem | string) => {
              if (typeof item === 'string') {
                return item !== ''
              }
              return item.value !== '' && !item.isVariable
            })
            .map((e: string | LabelItem) => {
              return typeof e === 'string'
                ? {
                    label: e,
                    value: e
                  }
                : e
            })
        ].concat(templateVariableOpts)
      )
    }
  }, [useInput, basicData.val, templateVariableOpts])
  return gotBasicData && !!tagMapItem.type && typeof useInput === 'boolean' ? (
    tagMapItem.type === 'bool' ? (
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
        isMulti={isMulti && !isProfilingSpecTags}
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
