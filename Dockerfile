FROM busybox:1.28
COPY dashboards /dashboards
COPY grafana-clickhouse-datasource /deepflow-plugins/grafana-clickhouse-datasource
COPY deepflow-apptracing-panel/dist  /deepflow-plugins/deepflow-apptracing-panel
COPY deepflow-querier-datasource/dist  /deepflow-plugins/deepflow-querier-datasource
COPY deepflow-topo-panel/dist /deepflow-plugins/deepflow-topo-panel
