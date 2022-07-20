import { DataSourcePlugin } from '@grafana/data'
import { DataSource } from './datasource'
import { ConfigEditor } from './ConfigEditor'
import { QueryEditor } from './QueryEditor'
import { MyQuery, MyDataSourceOptions } from './types'
import { VariableQueryEditor } from 'components/VariableQueryEditor'

export const plugin = new DataSourcePlugin<DataSource, MyQuery, MyDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setVariableQueryEditor(VariableQueryEditor)
