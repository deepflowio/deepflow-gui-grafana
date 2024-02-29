# DeepFlow data source

[DeepFlow](https://deepflow.io/community.html) is a highly automated observability platform open sourced by [YUNSHAN Network Inc](https://www.yunshan.net/). It is a full stack, full span and high-performance data engine built for cloud-native observability application developers. With new technologies such as eBPF, WASM and OpenTelemetry, DeepFlow innovatively implements core mechanisms such as AutoTracing, AutoMetrics, AutoTagging and SmartEncoding, helping developers to improve the automation level of code injection, reducing the maintanence complexity of the observability platform. With the programmability and open API of DeepFlow, developers can quickly integrate it into their observability stack.

For instructions on how to add a data source to Grafana, refer to the [administration documentation](https://grafana.com/docs/grafana/latest/administration/data-source-management/). Only users with the organization administrator role can add data sources.

Once you’ve added the deepflow data source, you can configure it so that your Grafana instance’s users can create queries in its query editor when they build dashboards, use Explore, and annotate visualizations.

# Configure the data source

## Data source options
| Name             | Description |
| ---------------- | ----------- |
| Request Url      | The url address of deepflow-querier server. |
| Tracing Url      | The url address of deepflow-app server, only used for `Distributed Tracing` app type. |

# Query editor
The deepflow query editor is available when editing a panel using a `Deepflow Querier` data source.

You can edit conditions in the left side of editor, then run the built query by pressing the Run query button, and the generated sql statement will be displayed on the right side of editor.

## APP TYPE
Choose one app type to start query, it's required.

### General Metrics:
Basic type, the response data is a standard grafana dataframe, can work with most grafana built-in panels.
Grafana alerting supported.

#### DATABASE
Select database and table, or data precision

#### GROUP BY
Select tags to group by.

#### INTERVAL
Time granularity, the minimum unit is seconds.

#### SELECT
Select tags or metrics from `DATABASE`.
Could use `AS`, except tags of automatically grouped.
Could use `FUNC` for a metrics, when using `GROUP BY` and `INTERVAL`.
Will add `Enum` function for a tag of enum type.

#### WHERE
Conditions, can only use tags.

#### HAVING
Conditions, can only use metrics.

#### ORDER BY
Sort configuration, can only use metrics.

#### SLIMIT
Limit of time series, can only be used when using `GROUP BY` and `INTERVAL`.

#### LIMIT
Limit.

#### OFFSET
Offset.

#### FORMAT AS
- Table: for `Table Panel`.
- Time series: for `Time series Panel`.

#### ALIAS
Alias for time series legend prefix, can only be used when `FORMAT AS` is `Time series`.
Use tags values in results by `${selected_tag}`, for example:
```Bash
region_0 = "deepflow-region"
az_1 = "deepflow-az"
ALIAS = "${region_0} ${az_1}:example"
result will be: "deepflow-region deepflow-az:example"
```

#### SHOW METRICS
Whether to display metrics names in time series legend.
- auto: show when multiple metrics are selected, otherwise hide.
- true: show.
- false: hide.

### Service Map:
A type for work with `Deepflow Topo Panel`, the response data is a standard grafana dataframe, can work with most grafana built-in panels.

For better presentation, it should work with `Deepflow Topo Panel`.

#### GROUP BY
At least two tags of resource type need to be selected as the client and server respectively.

### Distributed Tracing:
A type for work with `Deepflow Apptracing Panel`, the response data is a standard grafana dataframe, can work with most grafana built-in panels.

When you want use it as the start of `Deepflow Apptracing Panel` , it should work with `Table Panel` .

### Distributed Tracing - Flame:
A type for work with `Deepflow Apptracing Panel`, the response data is not a standard grafana dataframe, can only work with `Deepflow Apptracing Panel`.

#### _id
The only and required form item. Can input and select `traincg _id` or better using with grafana variables.

# Generate grafana variables by tags
- get all values

	```SQL
	show tag ${tag_name} values from ${table_name}
	```

- filter by tag name

	```SQL
	show tag ${tag_name} values from ${table_name} where display_name like '*abc*'
	```

- filter by other variables value:

    for example, cluster is an existing grafana variable
	- Use `$cluster`, when the value of cluster is id:

	  ```Bash
	  cluster = [1, 2]
	  result: 1, 2
	  ```
	  ```SQL
	  // Add 5 minutes before and after the time range to avoid frequent changes of candidates
	  // Use pod_id as `value`, make the value of current variable be id
	  SELECT pod_id as `value`, pod as `display_name` FROM `network.1m` WHERE pod_cluster IN ($cluster) AND time >= ${__from:date:seconds}-500 AND time <= ${__to:date:seconds}+500 GROUP BY `value`
	  ```
	- Use `${cluster:singlequote}`, when the value of cluster is name:

	  ```Bash
	  cluster = [deepflow-a, deepflow-b]
	  result: 'deepflow-a', 'deepflow-b'
	  ```
	  ```SQL
	  // Use pod as `value`, make the value of current variable be name
	  SELECT pod as `value`, pod as `display_name` FROM `network.1m` WHERE pod_cluster IN (${cluster:singlequote}) AND  time >= ${__from:date:seconds}-500 AND time <= ${__to:date:seconds}+500 GROUP BY `value`
	  ```
