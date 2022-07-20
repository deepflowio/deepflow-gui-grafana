FROM busybox:1.28
COPY dashboards /dashboards
COPY grafana-clickhouse-datasource /deepflow-plugins/grafana-clickhouse-datasource
COPY deepflow-apptrace-panel/dist  /deepflow-plugins/deepflow-apptrace-panel
COPY deepflow-querier-datasource/dist  /deepflow-plugins/deepflow-querier-datasource
COPY deepflow-topo-panel/dist /deepflow-plugins/deepflow-topo-panel
