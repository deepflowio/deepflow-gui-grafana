import { PanelPlugin } from '@grafana/data'
import { SimpleOptions } from './types'
import { SimplePanel } from './SimplePanel'

export const plugin = new PanelPlugin<SimpleOptions>(SimplePanel).setPanelOptions(builder => {
  return builder
})
