# DeepFlow-Querier data source

[DeepFlow](https://deepflow.yunshan.net/community.html) is a highly automated observability platform open sourced by [YUNSHAN Network Inc](https://www.yunshan.net/). It is a full stack, full span and high-performance data engine built for cloud-native observability application developers. With new technologies such as eBPF, WASM and OpenTelemetry, DeepFlow innovatively implements core mechanisms such as AutoTracing, AutoMetrics, AutoTagging and SmartEncoding, helping developers to improve the automation level of code injection, reducing the maintanence complexity of the observability platform. With the programmability and open API of DeepFlow, developers can quickly integrate it into their observability stack.

For instructions on how to add a data source to Grafana, refer to the [administration documentation](https://grafana.com/docs/grafana/latest/administration/data-source-management/). Only users with the organization administrator role can add data sources.

Once you’ve added the deepflow-querier data source, you can configure it so that your Grafana instance’s users can create queries in its query editor when they build dashboards, use Explore, and annotate visualizations.

### Configure the data source

### Query builder