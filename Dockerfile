FROM busybox:1.28
COPY metaflow-apptrace-panel/dist  /metaflow-plugins/metaflow-apptrace-panel
COPY metaflow-querier-datasource/dist  /metaflow-plugins/metaflow-querier-datasource
COPY metaflow-topo-panel/dist /metaflow-plugins/metaflow-topo-panel
