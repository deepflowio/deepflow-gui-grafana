import * as querierJs from 'deepflow-sdk-js'
import _ from 'lodash'

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
} = {
  basicUrl: ''
}

export const TAG_CACHE = _.get(querierJs, 'TagCache', {})
export const TAG_MAP_CACHE = _.get(querierJs, 'TagMapCache', {})
export const CLIENT_TAG_MAP_CACHE = _.get(querierJs, 'CTagMapCache', {})
export const SERVER_TAG_MAP_CACHE = _.get(querierJs, 'STagMapCache', {})

export const TAG_OPERATOR_CACHE = _.get(querierJs, 'TagOperatorCache', {})

export const METRIC_CACHE = _.get(querierJs, 'MetricCache', {})
export const METRIC_MAP_CACHE = _.get(querierJs, 'MetricMapCache', {})
export const METRIC_FUNCTION_CACHE = _.get(querierJs, 'MetricFunctionCache', {})
export const METRIC_FUNCTION_MAP_CACHE = _.get(querierJs, 'MetricFunctionMapCache', {})

export const getTagMapCache = (db: string, from: string, tag: string) => {
  return (
    _.get(TAG_MAP_CACHE, [db, from, tag]) ||
    _.get(CLIENT_TAG_MAP_CACHE, [db, from, tag]) ||
    _.get(SERVER_TAG_MAP_CACHE, [db, from, tag])
  )
}

export const SQL_CACHE = {
  content: ''
}
