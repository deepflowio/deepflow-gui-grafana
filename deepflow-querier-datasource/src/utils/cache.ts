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
