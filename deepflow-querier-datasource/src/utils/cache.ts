import * as querierJs from 'deepflow-sdk-js'
import _ from 'lodash'
import { I18N_RESOURCE } from './i18n'

export const QUERY_DATA_CACHE: {
  time_start: number | undefined
  time_end: number | undefined
  config: {
    [P in string]: {
      returnTags: any[]
      returnMetrics: any[]
      from?: string
      to?: string
    }
  }
} = {
  time_start: undefined,
  time_end: undefined,
  config: {}
}

export const DATA_SOURCE_SETTINGS: {
  basicUrl: string
  language: keyof typeof I18N_RESOURCE | ''
  aiUrl: string
} = {
  basicUrl: '',
  language: '',
  aiUrl: ''
}

export const getTagMapCache = (db: string, from: string, tag: string) => {
  const TAG_MAP_CACHE = _.get(querierJs, 'TagMapCache', {})
  const CLIENT_TAG_MAP_CACHE = _.get(querierJs, 'CTagMapCache', {})
  const SERVER_TAG_MAP_CACHE = _.get(querierJs, 'STagMapCache', {})
  return (
    _.get(TAG_MAP_CACHE, [db, from, tag]) ||
    _.get(CLIENT_TAG_MAP_CACHE, [db, from, tag]) ||
    _.get(SERVER_TAG_MAP_CACHE, [db, from, tag])
  )
}

export const SQL_CACHE: Record<string, string> = {}
