import { DataQuery, DataSourceJsonData } from '@grafana/data'

export interface MyQuery extends DataQuery {
  queryText?: string
  constant: number
  val?: string
}

export interface DfQuery {
  headers?: Record<string, any>
  method: string
  url: string
  params: object
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  requestUrl: string
  token: string
  traceUrl: string
  doRequest: any
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MyJsonData {
  requestUrl: string
  token: string
  traceUrl: string
}
