FROM busybox:1.28
COPY dashboards /dashboards
COPY grafana-clickhouse-datasource /metaflow-plugins/grafana-clickhouse-datasource
COPY metaflow-apptrace-panel/dist  /metaflow-plugins/metaflow-apptrace-panel
COPY metaflow-querier-datasource/dist  /metaflow-plugins/metaflow-querier-datasource
COPY metaflow-topo-panel/dist /metaflow-plugins/metaflow-topo-panel
