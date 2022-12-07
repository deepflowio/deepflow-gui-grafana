FROM busybox:1.28
COPY dashboards /dashboards
ARG TARGETARCH 
RUN --mount=target=/tmp-mount \
    mkdir -p /deepflow-plugins/grafana-clickhouse-datasource && \
    cp -raf /tmp-mount/plugin-${TARGETARCH}/grafana-clickhouse-datasource/* /deepflow-plugins/grafana-clickhouse-datasource/
COPY deepflow-apptracing-panel/dist  /deepflow-plugins/deepflow-apptracing-panel
COPY deepflow-querier-datasource/dist  /deepflow-plugins/deepflow-querier-datasource
COPY deepflow-topo-panel/dist /deepflow-plugins/deepflow-topo-panel
CMD ["/bin/sh", "-c", "cp -raf /deepflow-plugins/* /var/lib/grafana/plugins/"]
