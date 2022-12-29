package plugin

// test file

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

func newResourceHandler() backend.CallResourceHandler {
	mux := http.NewServeMux()
	mux.HandleFunc("/querier", handleQueryTypes)

	return httpadapter.New(mux)
}

type queryTypesResponse struct {
	QueryTypes []string `json:"queryTypes"`
}

type queryResponse struct {
	QueryName    []string    `json:"queryName"`
	QueryTime    []time.Time `json:"QueryTime"`
	QueryMetrics []float64   `json:"QueryMetrics"`
}

func handleQueryTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}

	tag_app_name := []string{"statistics", "statistics", "statistics"}

	time_60 := []time.Time{time.Unix(int64(1668564140), 0), time.Unix(int64(1668565820), 0), time.Unix(int64(1668566360), 0)}
	metrics_value := []float64{1, 3, 4}

	queryTypes := &queryResponse{
		QueryName:    tag_app_name,
		QueryTime:    time_60,
		QueryMetrics: metrics_value,
	}

	j, err := json.Marshal(queryTypes)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = w.Write(j)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}
