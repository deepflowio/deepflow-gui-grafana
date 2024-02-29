import { BasicData } from 'components/QueryEditorFormRow'
import { SelectOpts } from 'QueryEditor'
import { uuid } from 'utils/tools'

// 不支持做分组的 tag: 负载均衡监听器, ingress
export const SELECT_GROUP_BY_DISABLE_TAGS = [
  'lb_listener',
  'pod_ingress',
  'capture_nic_host',
  'capture_nic_chost',
  'capture_nic_pod_node',
  // TODO
  'tap_port_host',
  'tap_port_chost',
  'tap_port_pod_node'
]

export const DISABLE_TAGS = ['_id', 'time']

export const SERVICE_MAP_SUPPORT_DB = ['flow_log', 'flow_metrics']
export const SERVICE_MAP_SUPPORT_TABLE = ['l4_flow_log', 'l7_flow_log', 'network_map', 'application_map']

export const TAG_METRIC_TYPE_NUM = 6
export const MAP_METRIC_TYPE_NUM = 7

export const TIME_TAG_TYPE = 'time'
export const MAP_TAG_TYPE = 'map'
export const PCAP_TAG_TYPE = 'pcap'
export const IP_ARRAY_TAG_TYPE = 'ip_array'
export const RESOURCE_ARRAY_TAG_TYPE = 'resource_array'
export const GROUP_BY_DISABLE_TAG_TYPES = [MAP_TAG_TYPE, PCAP_TAG_TYPE, IP_ARRAY_TAG_TYPE, RESOURCE_ARRAY_TAG_TYPE]

export const APPTYPE_APP_TRACING_FLAME = 'appTracingFlame'
export const appTypeOpts = [
  {
    label: 'General Metrics',
    value: 'trafficQuery'
  },
  {
    label: 'Service Map',
    value: 'accessRelationship'
  },
  {
    label: 'Distributed Tracing',
    value: 'appTracing'
  },
  {
    label: 'Distributed Tracing - Flame',
    value: APPTYPE_APP_TRACING_FLAME
  }
]

export const ALERTING_ALLOW_APP_TYPE = ['trafficQuery']

export const formatAsOpts: SelectOpts = [
  {
    label: 'Time series',
    value: 'timeSeries'
  },
  {
    label: 'Table',
    value: 'table'
  }
]
export const intervalOpts: SelectOpts = [
  {
    label: '1s',
    value: '1'
  },
  {
    label: '10s',
    value: '10'
  },
  {
    label: '30s',
    value: '30'
  },
  {
    label: '1m',
    value: '60'
  },
  {
    label: '10m',
    value: '600'
  },
  {
    label: '30m',
    value: '1800'
  },
  {
    label: '1h',
    value: '3600'
  },
  {
    label: '6h',
    value: '21600'
  },
  {
    label: '12h',
    value: '43200'
  },
  {
    label: '1d',
    value: '86400'
  },
  {
    label: '7d',
    value: '604800'
  }
]

export const VAR_INTERVAL_LABEL = '$__interval'

export const formItemConfigs = {
  groupBy: {
    type: false,
    func: false,
    op: false,
    val: false,
    as: false
  },
  select: {
    type: true,
    func: true,
    op: false,
    val: false,
    as: true
  },
  where: {
    type: false,
    func: false,
    op: true,
    val: true,
    as: false,
    disableTimeTag: true
  },
  having: {
    type: false,
    func: true,
    op: true,
    val: true,
    as: false
  },
  orderBy: {
    type: false,
    func: false,
    op: false,
    val: false,
    as: false,
    sort: true
  }
} as const

export type FormTypes = keyof typeof formItemConfigs

export type BasicDataWithId = BasicData & { uuid: string }

export type ShowMetricsVal = -1 | 1 | 0
export type QueryDataType = {
  appType: string
  db: string
  sources: string
  from: string
  select: BasicDataWithId[]
  where: BasicDataWithId[]
  having: BasicDataWithId[]
  groupBy: BasicDataWithId[]
  orderBy: BasicDataWithId[]
  interval: string
  slimit: string
  limit: string
  offset: string
  formatAs: 'timeSeries' | 'table' | ''
  alias: string
  showMetrics: ShowMetricsVal
}

export const defaultFormDB: Pick<QueryDataType, 'db' | 'sources'> = {
  db: '',
  sources: ''
}

export const defaultItem = () => {
  return {
    key: '',
    func: '',
    op: '',
    val: '',
    as: '',
    params: [],
    uuid: uuid()
  }
}

export const defaultFormData: Omit<QueryDataType, 'appType' | 'db' | 'sources'> = {
  from: '',
  select: [
    {
      ...defaultItem(),
      type: 'metric'
    }
  ],
  where: [
    {
      ...defaultItem(),
      type: 'tag'
    }
  ],
  having: [
    {
      ...defaultItem(),
      type: 'metric'
    }
  ],
  groupBy: [
    {
      ...defaultItem(),
      type: 'tag'
    }
  ],
  orderBy: [
    {
      ...defaultItem(),
      type: 'metric',
      sort: 'asc'
    }
  ],
  interval: '',
  slimit: '',
  limit: '100',
  offset: '',
  formatAs: 'timeSeries',
  alias: '',
  showMetrics: -1
}

export const ID_PREFIX = 'id-'

export const showMetricsOpts: SelectOpts = [
  {
    label: 'auto',
    value: -1
  },
  {
    label: 'true',
    value: 1
  },
  {
    label: 'false',
    value: 0
  }
]

export const SLIMIT_DEFAULT_VALUE = '20'
