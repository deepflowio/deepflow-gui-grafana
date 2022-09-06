import { BasicData, RowConfig } from 'components/QueryEditorFormRow'
import { SelectOpts } from 'QueryEditor'
import { uuid } from 'utils/tools'

// 不支持做分组的 tag: 负载均衡监听器, ingress
export const SELECT_GROUP_BY_DISABLE_TAGS = ['lb_listener', 'pod_ingress']

export const SERVICE_MAP_SUPPORT_DB = ['flow_log', 'flow_metrics']
export const SERVICE_MAP_SUPPORT_TABLE = ['l4_flow_log', 'l7_flow_log', 'vtap_flow_edge_port', 'vtap_app_edge_port']

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
    label: '$__interval',
    value: '$__interval_ms'
  },
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

export type FormKeys = 'select' | 'where' | 'having' | 'groupBy' | 'orderBy'

type Configs = Record<FormKeys, RowConfig>

export const formItemConfigs: Configs = {
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
    func: true,
    op: false,
    val: false,
    as: false,
    sort: true
  }
}

export type BasicDataWithId = BasicData & { uuid: string }

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
  limit: string
  offset: string
  formatAs: 'timeSeries' | 'table' | ''
  alias: string
}

export const defaultFormDB: Pick<QueryDataType, 'db' | 'sources'> = {
  db: '',
  sources: ''
}

const defaultItem = () => {
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
  limit: '100',
  offset: '',
  formatAs: 'timeSeries',
  alias: ''
}
