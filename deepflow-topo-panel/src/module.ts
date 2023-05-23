import { PanelPlugin } from '@grafana/data'
import { SimpleOptions } from './types'
import { SimplePanel } from './SimplePanel'
import { TopoType, TOPO_TYPE_OPTS } from 'components/panelSettings/TopoType'
import { MetricsUnits } from 'components/panelSettings/MetricsUnits'

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions(builder => {
  return builder
    .addCustomEditor({
      id: 'topoSettings',
      path: 'topoSettings',
      name: 'Topo Settings',
      editor: TopoType,
      defaultValue: {
        type: TOPO_TYPE_OPTS[0].value,
        nodeTags: []
      }
    })
    .addCustomEditor({
      id: 'metricsUnits',
      path: 'metricsUnits',
      name: 'Metrics Units',
      editor: MetricsUnits,
      defaultValue: {
      }
    })
})
