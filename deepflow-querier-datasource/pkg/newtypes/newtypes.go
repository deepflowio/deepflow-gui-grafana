package newtypes

type ApiMetrics struct {
	OPT_STATUS  string                 `json:"opt_status"`
	DESCRIPTION string                 `json:"description"`
	Result      map[string]interface{} `json:"result"`
	Debug       interface{}            `json:"debug"`
}
