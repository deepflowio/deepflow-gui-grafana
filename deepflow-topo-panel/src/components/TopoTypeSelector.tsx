import React from 'react'
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

export const TopoTypeSelector: React.FC<
  StandardEditorProps<{
    type: TOPO_TYPE
  }>
> = ({ item, value, onChange, context }) => {
  return (
    <div>
      <InlineField>
        <Select
          options={TOPO_TYPE_OPTS}
          value={value.type}
          onChange={(val: any) => {
            onChange({
              ...value,
              type: val.value
            })
          }}
          placeholder="Topo Type"
        />
      </InlineField>
    </div>
  )
}
