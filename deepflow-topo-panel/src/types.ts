import { TOPO_TYPE } from 'components/panelSettings/TopoType'

export interface SimpleOptions {
  topoSettings: {
    type: TOPO_TYPE
    nodeTags: string[]
  },
  metricsUnits: Record<string, string>
}
