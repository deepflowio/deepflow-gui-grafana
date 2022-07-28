import { PanelPlugin } from '@grafana/data'
import { SimpleOptions } from './types'
import { SimplePanel } from './SimplePanel'
import { TopoTypeSelector, TOPO_TYPE_OPTS } from 'components/TopoTypeSelector'

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions(builder => {
  return builder.addCustomEditor({
    id: 'topoSettings',
    path: 'topoSettings',
    name: 'Topo Settings',
    editor: TopoTypeSelector,
    defaultValue: {
      type: TOPO_TYPE_OPTS[0].value,
      nodeTags: []
    }
  })
})
