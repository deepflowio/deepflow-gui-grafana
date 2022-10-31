import React, { useState } from 'react'
import { Icon, Switch, Tooltip } from '@grafana/ui'

export interface MyVariableQuery {
  database: string
  sql: string
  datasource: string
  useDisabled?: boolean
  useAny?: boolean
}

interface VariableQueryProps {
  query: MyVariableQuery
  onChange: (query: MyVariableQuery, definition: string) => void
}

export const VariableQueryEditor: React.FC<VariableQueryProps> = ({ onChange, query }) => {
  const [state, setState] = useState(query)

  const saveQuery = () => {
    onChange(state, JSON.stringify(state))
  }

  const handleOnOffChange = (event: React.FormEvent<HTMLInputElement>) => {
    const newState = {
      ...state,
      [event.currentTarget.name]: event.currentTarget.checked
    }
    setState(newState)
    onChange(newState, JSON.stringify(newState))
  }

  const handleChange = (event: React.FormEvent<HTMLInputElement>) => {
    setState({
      ...state,
      [event.currentTarget.name]: event.currentTarget.value
    })
  }

  return (
    <>
      <div className="gf-form">
        <span className="gf-form-label width-10">DATABASE</span>
        <input
          name="database"
          className="gf-form-input"
          onBlur={saveQuery}
          onChange={handleChange}
          value={state.database}
        />
      </div>
      <div className="gf-form">
        <span className="gf-form-label width-10">SQL</span>
        <input name="sql" className="gf-form-input" onBlur={saveQuery} onChange={handleChange} value={state.sql} />
      </div>
      <div className="gf-form">
        <span className="gf-form-label width-10">DATASOURCE</span>
        <input
          name="datasource"
          className="gf-form-input"
          onBlur={saveQuery}
          onChange={handleChange}
          value={state.datasource}
        />
      </div>
      <div className="gf-form">
        <span className="gf-form-label width-10" style={{ fontSize: '12px' }}>
          Include Disabled option
          <Tooltip content={'The variable is allowed to be disabled (ignored) in SQL statement.'}>
            <Icon name="info-circle" style={{ color: '#7b8087', fontSize: '12px' }} size="sm" />
          </Tooltip>
        </span>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '32px'
          }}
        >
          <Switch name="useDisabled" value={state.useDisabled} onChange={handleOnOffChange} />
        </div>
      </div>
      <div className="gf-form">
        <span className="gf-form-label width-10" style={{ fontSize: '12px' }}>
          Include Any option
          <Tooltip content={'The variable supports filtering all optional values without expanding the SQL statement.'}>
            <Icon name="info-circle" style={{ color: '#7b8087', fontSize: '12px' }} size="sm" />
          </Tooltip>
        </span>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '32px'
          }}
        >
          <Switch name="useAny" value={state.useAny} onChange={handleOnOffChange} />
        </div>
      </div>
    </>
  )
}
