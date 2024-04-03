import React, { ChangeEvent, PureComponent } from 'react'
import { Input } from '@grafana/ui'
import { DataSourcePluginOptionsEditorProps } from '@grafana/data'
import { MyDataSourceOptions, MyJsonData } from './types'

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions> {}

interface State {}

export class ConfigEditor extends PureComponent<Props, State> {
  onJsonChange = (key: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props
    const jsonData = {
      ...options.jsonData,
      [key]: event.target.value
    }
    onOptionsChange({ ...options, jsonData })
  }

  render() {
    const { options } = this.props
    const jsonData = (options.jsonData || {}) as MyJsonData

    return (
      <div className="max-width-30">
        <div className="gf-form">
          <span className="width-10">Request Url</span>
          <div style={{ flexGrow: 1 }}>
            <Input
              value={jsonData.requestUrl}
              onChange={this.onJsonChange('requestUrl')}
              placeholder="request url"
            ></Input>
          </div>
        </div>
        <div className="gf-form">
          <span className="width-10">Tracing Url</span>
          <div style={{ flexGrow: 1 }}>
            <Input
              name="Tracing Url"
              value={jsonData.traceUrl}
              onChange={this.onJsonChange('traceUrl')}
              placeholder="app tracing request url"
            ></Input>
          </div>
        </div>
        <div className="gf-form">
          <span className="width-10">AI Url</span>
          <div style={{ flexGrow: 1 }}>
            <Input
              name="AI Url"
              value={jsonData.aiUrl}
              onChange={this.onJsonChange('aiUrl')}
              placeholder="AI request url"
            ></Input>
          </div>
        </div>
      </div>
    )
  }
}
