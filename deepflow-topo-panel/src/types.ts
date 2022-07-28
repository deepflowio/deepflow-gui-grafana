import { TOPO_TYPE } from 'components/TopoTypeSelector'

export interface SimpleOptions {
  topoSettings: {
    type: TOPO_TYPE
    nodeTags: string[]
  }
}
