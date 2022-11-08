import _ from 'lodash'
import { DATA_SOURCE_SETTINGS } from './cache'

export const I18N_RESOURCE = {
  'en-us': {
    client: 'client',
    server: 'server'
  },
  'zh-cn': {
    client: '客户端',
    server: '服务端'
  }
} as const

export const getI18NLabelByName = (name: keyof typeof I18N_RESOURCE['en-us']) => {
  return _.get(I18N_RESOURCE, [DATA_SOURCE_SETTINGS.language, name], name)
}
