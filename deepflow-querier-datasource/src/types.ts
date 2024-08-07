import { DataQuery, DataSourceJsonData } from '@grafana/data'

export interface MyQuery extends DataQuery {
  isQuery?: boolean
  queryText: string
  debug: boolean
  returnTags: any[]
  returnMetrics: any[]
  sql: string
  metaExtra?:
    | {
        from: string[]
        to: string[]
        common: string[]
      }
    | {}
  _id?: string
  profile_event_type?: string
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  requestUrl: string
  token: string
  traceUrl: string
  aiUrl: string
  doRequest: any
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MyJsonData {
  requestUrl: string
  token: string
  traceUrl: string
  aiUrl: string
}
