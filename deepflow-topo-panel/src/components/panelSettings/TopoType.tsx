import React, { useMemo } from 'react'
import { InlineField, Select } from '@grafana/ui'
import { StandardEditorProps } from '@grafana/data'

export const TOPO_TYPE_OPTS = [
  {
    label: 'Simple Topo',
    value: 'simpleTopo'
  },
  {
    label: 'Tree Topo',
    value: 'treeTopo'
  },
  {
    label: 'Tree Topo With Group',
    value: 'treeTopoWithGroup'
  }
]
export type TOPO_TYPE = 'simpleTopo' | 'treeTopo' | 'treeTopoWithGroup'

export const TopoType: React.FC<
  StandardEditorProps<{
    type: TOPO_TYPE
    nodeTags: string[]
  }>
> = ({ item, value, onChange, context }) => {
  const nodeTags = useMemo(() => {
    const customData = context.data[0]?.meta?.custom
    if (!customData) {
      return []
    }
    const { from, to, common } = context.data[0]?.meta?.custom as {
      returnMetrics: any[]
      returnTags: any[]
      from: string[] | undefined
      to: string[] | undefined
      common: string[] | undefined
    }

    const _from = from?.length ? from : []
    const _to = to?.length ? to : []
    const _common = common?.length ? common : []
    const result = [
      ...new Set(
        [..._from, ..._to].map(e => {
          return e.replace('_0', '').replace('_1', '').replace('_id', '')
        })
      ),
      ..._common
    ]
    if (result.length) {
      result.unshift('node_type')
    }
    return result.map(e => {
      return {
        label: e,
        value: e
      }
    })
  }, [context])

  return (
    <div
      style={{
        width: '100%'
      }}
    >
      <InlineField label="Type" className="options-custom-label">
        <Select
          options={TOPO_TYPE_OPTS}
          value={value.type}
          onChange={(val: any) => {
            onChange({
              ...value,
              type: val.value,
              ...(val.value === 'simpleTopo' ? { nodeTags: [] } : {})
            })
          }}
          placeholder="Topo Type"
        />
      </InlineField>
      {value.type === 'simpleTopo' ? null : (
        <InlineField label="Node tags" className="options-custom-label">
          <Select
            options={nodeTags}
            value={value.nodeTags}
            onChange={(val: any) => {
              onChange({
                ...value,
                nodeTags: val.map((e: any) => e.value).slice(0, 4)
              })
            }}
            isMulti
            placeholder="Node tags"
          />
        </InlineField>
      )}
    </div>
  )
}
