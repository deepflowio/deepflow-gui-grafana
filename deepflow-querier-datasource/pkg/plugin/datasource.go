package plugin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"

	"deepflow-grafana-backend-plugin/pkg/formattools"
	"deepflow-grafana-backend-plugin/pkg/newtypes"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler interfaces. Plugin should not implement all these
// interfaces- only those which are required for a particular task.

var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ backend.CallResourceHandler   = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	opts, err := settings.HTTPClientOptions()
	if err != nil {
		return nil, fmt.Errorf("http client options: %w", err)
	}
	httpclient.DefaultTimeoutOptions.Timeout = 300 * time.Second
	opts.Timeouts = &httpclient.DefaultTimeoutOptions

	cl, err := httpclient.New(opts)
	if err != nil {
		return nil, fmt.Errorf("httpclient new: %w", err)
	}
	return &Datasource{
		CallResourceHandler: newResourceHandler(),
		settings:            settings,
		httpClient:          cl,
	}, nil
}

// Datasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type Datasource struct {
	backend.CallResourceHandler

	settings backend.DataSourceInstanceSettings

	httpClient *http.Client
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
	d.httpClient.CloseIdleConnections()
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	//恢复panic

	defer func() {
		if r := recover(); r != nil {
			log.DefaultLogger.Debug("从查询数据错误中恢复", "错误", r)
		}
	}()

	// 记录日志
	log.DefaultLogger.Info("所有提交的查询", "数据", req)

	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res, err := d.query(ctx, req.PluginContext, q)
		if err != nil {
			// return nil, fmt.Errorf("查询错误: %w", err)
			log.DefaultLogger.Error("子查询错误：" + err.Error())

			response.Responses[q.RefID] = backend.ErrDataResponse(
				backend.StatusBadRequest,
				err.Error(),
			)
		} else {
			// save the response in a hashmap
			// based on with RefID as identifier
			response.Responses[q.RefID] = res
		}

	}

	return response, nil
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) (backend.DataResponse, error) {

	log.DefaultLogger.Info("子查询", "数据", query)

	response := backend.DataResponse{}

	//数据源配置项
	var vv interface{}
	json.Unmarshal(d.settings.JSONData, &vv)

	dsj := vv.(map[string]interface{})

	if response.Error != nil {
		log.DefaultLogger.Warn("settings.JSONData解码失败", "错误", response.Error, "数据", string(d.settings.JSONData))
		return response, fmt.Errorf("ettings.JSONData解码失败: %w", response.Error)
	}

	//查询时间段
	qt := query.TimeRange
	fromTime := qt.From
	toTime := qt.To
	fromTimeInt64 := fromTime.Unix()
	toTimeInt64 := toTime.Unix()

	// query查询
	var v interface{}
	json.Unmarshal(query.JSON, &v)

	qj := v.(map[string]interface{})

	if response.Error != nil {
		log.DefaultLogger.Error("query.JSON解码失败", "错误", response.Error, "数据", string(query.JSON))
		return response, fmt.Errorf("query.JSON解码失败: %w", response.Error)
	}

	if _, ok := qj["queryText"]; !ok {
		return response, fmt.Errorf("缺失数据: queryText")
	}

	// 格式化queryText
	var queryText map[string]interface{}
	if err := json.Unmarshal([]byte(qj["queryText"].(string)), &queryText); err != nil {
		return response, fmt.Errorf("queryText 序列化失败: " + err.Error())
	}

	// 基础校验参数
	err := d.verifyParamsBase(dsj, qj, queryText)
	if err != nil {
		return response, err
	}

	// 从数据源配置中获取
	//requestUrl
	requestUrl := dsj["requestUrl"].(string)
	//traceUrl
	traceUrl := dsj["traceUrl"].(string)
	//token
	token := ""
	if _, ok := dsj["token"]; ok {
		token = dsj["token"].(string)
	}

	// 从qj获取
	// 是否 panel 发起
	var isQuery bool
	if _, ok := qj["isQuery"]; ok {
		isQuery = true
	} else {
		isQuery = false
	}

	// 获取sql
	sql := qj["sql"].(string)
	// 获取returnMetrics
	returnMetrics := qj["returnMetrics"].([]interface{})
	// 获取returnTags
	returnTags := qj["returnTags"].([]interface{})

	//基本值判断，刚进入时为空，直接返回空
	if sql, ok := qj["sql"]; ok {
		if sql == "" {
			return response, nil
		}
	}

	//app类型
	appType := queryText["appType"].(string)
	// 获取db
	db := queryText["db"].(string)
	// 获取sources
	sources := queryText["sources"].(string)

	if appType == "appTracingFlame" {
		//开启debug
		tracedeug := false
		if _, ok := qj["debug"]; ok {
			tracedeug = qj["debug"].(bool)
		}

		if _, ok := qj["_id"]; !ok {
			return response, fmt.Errorf("缺失字段: _id")
		}

		tracingIdValue := qj["_id"].(string)

		// 获取tracing数据
		traceRes, err := d.trace(ctx, tracedeug, traceUrl, tracingIdValue, fromTimeInt64, toTimeInt64)
		if err != nil {
			return response, err
		}

		if _, ok := traceRes["DATA"]; !ok {
			return response, fmt.Errorf("trace 查询返回格式错误，缺失DATA")
		}

		// 空数据
		if _, ok := traceRes["DATA"].([]interface{}); ok {
			return response, nil
		}
		//存在数据
		traceResData := traceRes["DATA"].(map[string]interface{})

		if _, ok := traceResData["services"]; !ok {
			return response, fmt.Errorf("trace 查询返回格式错误，DATA缺失services")
		}
		if _, ok := traceResData["tracing"]; !ok {
			return response, fmt.Errorf("trace 查询返回格式错误，DATA缺失tracing")
		}

		services := traceResData["services"].([]interface{})
		tracings := traceResData["tracing"].([]interface{})

		// 获取tag 翻译
		tagTranslate := make(map[string]interface{})

		//获取l7_protocol 翻译
		l7_protocol, err := d.querier(ctx, "flow_log", "show tag l7_protocol values from l7_flow_log", sources, token, requestUrl, fromTimeInt64, toTimeInt64)

		if err != nil {
			return response, err
		}

		//翻译l7_protocol
		tag17Protocol, err := formattools.TagTranslate(l7_protocol)
		if err != nil {
			return response, err
		}

		tagTranslate["l7_protocol"] = tag17Protocol

		//获取response_status翻译
		response_status, err := d.querier(ctx, "flow_log", "show tag response_status values from l7_flow_log", sources, token, requestUrl, fromTimeInt64, toTimeInt64)
		if err != nil {
			return response, err
		}
		//翻译response_status
		tagResponseStatus, err := formattools.TagTranslate(response_status)
		if err != nil {
			return response, err
		}
		tagTranslate["response_status"] = tagResponseStatus

		// 获取tap_side翻译
		tap_side, err := d.querier(ctx, "flow_log", "show tag tap_side values from l7_flow_log", sources, token, requestUrl, fromTimeInt64, toTimeInt64)
		if err != nil {
			return response, err
		}
		//翻译tap_side
		tagTapSide, err := formattools.TagTranslate(tap_side)
		if err != nil {
			return response, err
		}
		tagTranslate["tap_side"] = tagTapSide

		log.DefaultLogger.Info("tag: ", fmt.Sprintf("%v", tagTranslate))

		// tracings 追加翻译
		//生成where
		tracingWhere := " where "
		for _, tracingsSub := range tracings {
			tracingsSubType := tracingsSub.(map[string]interface{})

			tracingids := tracingsSubType["_ids"].([]interface{})
			for _, v := range tracingids {
				tracingWhere = tracingWhere + "_id=" + v.(string) + " or "
			}

			for k, v := range tagTranslate {
				//
				tagTranslateSub := v.(map[interface{}]map[string]interface{})
				// tracings中每个tag用到的值
				tagTransName := tracingsSubType[k]
				// 用到的值是否在该tag范围内，如果在用对应的display_name
				if tagTransDisName, ok := tagTranslateSub[tagTransName]; ok {
					tagTransName = tagTransDisName["display_name"]
				}

				if k == "l7_protocol" {
					if tracingsSubType[k] == 0 || tracingsSubType[k] == 1 {
						tracingsSubType["Enum("+k+")"] = ""
					} else {
						tracingsSubType["Enum("+k+")"] = tagTransName
					}
				} else {
					tracingsSubType["Enum("+k+")"] = tagTransName
				}
			}

		}
		//拼接sql
		tracingWhereNew := strings.TrimSuffix(tracingWhere, " or ")
		tracingsql := sql + tracingWhereNew + " order by `start_time`"
		// 请求数据
		tracingsqlRes, err := d.querier(ctx, "flow_log", tracingsql, sources, token, requestUrl, fromTimeInt64, toTimeInt64)

		if err != nil {
			return response, err
		}

		// 获取列
		var columns []interface{}
		if _, ok := tracingsqlRes.Result["columns"]; !ok {
			return response, fmt.Errorf("接口返回数据格缺失字段: columns")
		}
		columns = tracingsqlRes.Result["columns"].([]interface{})

		// 获取值
		if _, ok := tracingsqlRes.Result["values"]; !ok {
			return response, fmt.Errorf("接口返回数据格缺失字段: values")
		}
		//
		var dataListsAll []map[string]interface{}

		if tracingsqlRes.Result["values"] == nil {
			dataLists := make([]map[string]interface{}, 0)
			dataListsAll = dataLists
		} else {
			values := tracingsqlRes.Result["values"].([]interface{})

			//column为key，格式化数据
			dataLists := make([]map[string]interface{}, len(values))

			for i := 0; i < len(values); i++ {
				subValue := values[i].([]interface{})
				if len(subValue) != len(columns) {
					return response, fmt.Errorf(fmt.Sprintf("value子值: %v和columns: %v长度不一致,", subValue, columns))
				}
				kv := make(map[string]interface{})
				for j := 0; j < len(columns); j++ {
					kv[columns[j].(string)] = subValue[j]
				}
				dataLists[i] = kv
			}
			dataListsAll = dataLists
		}
		//记录日志
		log.DefaultLogger.Info("columns和value对应后的数据", dataListsAll)

		//数据
		frame := data.NewFrame("response")

		frame.Fields = append(frame.Fields,
			// data.NewField("services", nil, []json.RawMessage{}),
			data.NewField("services", nil, []string{}),
		)
		frame.Fields = append(frame.Fields,
			// data.NewField("tracing", nil, []json.RawMessage{}),
			data.NewField("tracing", nil, []string{}),
		)
		frame.Fields = append(frame.Fields,
			// data.NewField("detailList", nil, []json.RawMessage{}),
			data.NewField("detailList", nil, []string{}),
		)

		//返回数据
		vals := make([]interface{}, 3)

		//格式化返回
		// var serviceJson json.RawMessage
		// serviceJson, _ = json.Marshal(services)
		// vals[0] = serviceJson
		serviceJson, _ := json.Marshal(services)
		vals[0] = string(serviceJson)

		//格式化返回
		// var tracingJson json.RawMessage
		// tracingJson, _ = json.Marshal(tracings)
		// vals[1] = tracingJson
		tracingJson, _ := json.Marshal(tracings)
		vals[1] = string(tracingJson)

		//格式化返回
		// var dataListJson json.RawMessage
		// dataListJson, _ = json.Marshal(dataListsAll)
		// vals[2] = dataListJson
		dataListJson, _ := json.Marshal(dataListsAll)
		vals[2] = string(dataListJson)

		frame.AppendRow(vals...)

		//处理Custom
		type FrameMetas struct {
			TAGS    []interface{} `json:"tags"`
			METRICS []interface{} `json:"metrics"`
		}
		frameMetasAll := FrameMetas{}
		frameMetasAll.TAGS = returnTags
		frameMetasAll.METRICS = returnMetrics

		// 定义元数据
		var FrameMeta data.FrameMeta
		FrameMeta.Custom = frameMetasAll

		frame.Meta = &FrameMeta
		response.Frames = append(response.Frames, frame)
		return response, nil
	}

	// 非appTracingFlame类型基础校验参数
	err = d.verifyParams(qj, queryText)
	if err != nil {
		return response, err
	}

	// 从qj获取
	//metaExtra
	metaExtra := qj["metaExtra"].(map[string]interface{})

	//从qj.queryText获取
	//formatAs
	formatAs := queryText["formatAs"].(string)
	//alias
	alias := queryText["alias"].(string)

	var queryShowMetrics bool
	//showMetrics
	if _, ok := queryText["showMetrics"]; ok {
		showMetrics := queryText["showMetrics"].(float64)
		switch showMetrics {
		case 1:
			queryShowMetrics = true
		case 0:
			queryShowMetrics = false
		case -1:
			fallthrough
		default:
			queryShowMetrics = len(returnMetrics) > 1
		}
	} else {
		queryShowMetrics = len(returnMetrics) > 1
	}

	// 获取metrics name
	returnMetricNames := make([]string, len(returnMetrics))

	if len(returnMetrics) > 0 {
		for k, v := range returnMetrics {
			vv := v.(map[string]interface{})
			if _, ok := vv["name"]; !ok {
				return response, fmt.Errorf("参数: returnMetrics 缺失字段: name")
			}
			if _, ok := vv["type"]; !ok {
				return response, fmt.Errorf("参数: returnMetrics 缺失字段: type")
			}
			returnMetricNames[k] = vv["name"].(string)
		}
	}

	//

	// 请求querier
	body, err := d.querier(ctx, db, sql, sources, token, requestUrl, fromTimeInt64, toTimeInt64)

	if err != nil {
		return response, err
	}

	// 获取列
	var columns []interface{}
	if _, ok := body.Result["columns"]; !ok {
		return response, fmt.Errorf("接口返回数据格缺失字段: columns")
	}
	columns = body.Result["columns"].([]interface{})

	// 获取值
	if res, ok := body.Result["values"]; !ok {
		return response, fmt.Errorf("接口返回数据格缺失字段: values")
	} else {
		//查询为空
		if res == nil {
			return response, nil
		}
	}
	values := body.Result["values"].([]interface{})

	//column为key，格式化数据
	valueBycolumns := make([]map[string]interface{}, len(values))

	for i := 0; i < len(values); i++ {
		subValue := values[i].([]interface{})
		if len(subValue) != len(columns) {
			return response, fmt.Errorf(fmt.Sprintf("value子值: %v和columns: %v长度不一致,", subValue, columns))
		}
		kv := make(map[string]interface{})
		for j := 0; j < len(columns); j++ {
			kvName := columns[j].(string)
			kvValue := subValue[j]
			if kvName == "toString(_id)" {
				kvName = "_id"
				kvValue = "id-" + formattools.ValueToString(kvValue).(string)
			}

			kv[kvName] = kvValue
		}
		valueBycolumns[i] = kv
	}
	//记录日志
	log.DefaultLogger.Info("columns和value对应后的数据", valueBycolumns)

	if len(valueBycolumns) <= 0 {
		return response, nil
	}

	//特殊处理
	for _, v := range valueBycolumns {
		if _, ok := v["client_node_type"]; ok {
			formattools.AddResourceFieldsInData(v, "client")
		}
		if _, ok := v["server_node_type"]; ok {
			formattools.AddResourceFieldsInData(v, "server")
		}
	}

	// 获取第一个值
	firstResponse := valueBycolumns[0]
	// columns  排序
	firstResponseSort := make([]string, len(firstResponse))
	i := 0
	for k := range firstResponse {
		firstResponseSort[i] = k
		i++
	}
	sort.Strings(firstResponseSort)
	//key 分类
	metricKeys := make([]string, 0, len(firstResponse))
	timeKeys := make([]string, 0, len(firstResponse))
	tagKeys := make([]string, 0, len(firstResponse))

	j := 0
	for k, v := range firstResponse {
		isMetric := false
		for _, v := range returnMetricNames {
			if k == v {
				isMetric = true
				break
			}
		}
		if isMetric {
			metricKeys = append(metricKeys, k)
		} else if isTime := strings.Contains(k, "time"); isTime {
			if _, ok := v.(json.Number); ok {
				timeKeys = append(timeKeys, k)
			}

		} else {
			tagKeys = append(tagKeys, k)
		}
		j++
	}
	//处理Custom
	type FrameMetas struct {
		ReturnTags    []interface{} `json:"returnTags"`
		ReturnMetrics []interface{} `json:"returnMetrics"`
		From          interface{}   `json:"from"`
		To            interface{}   `json:"to"`
		Common        interface{}   `json:"common"`
	}

	frameMetasAll := FrameMetas{}
	frameMetasAll.ReturnTags = returnTags
	frameMetasAll.ReturnMetrics = returnMetrics

	if v, ok := metaExtra["from"]; ok {
		frameMetasAll.From = v
	}

	if v, ok := metaExtra["to"]; ok {
		frameMetasAll.To = v
	}

	if v, ok := metaExtra["common"]; ok {
		frameMetasAll.Common = v
	}

	// 定义元数据
	var FrameMeta data.FrameMeta
	FrameMeta.Custom = frameMetasAll

	log.DefaultLogger.Info("FrameMeta.Custom数据", FrameMeta)

	//返回
	usingGroupBy := false
	if formatAs == "timeSeries" && strings.Contains(sql, "GROUP BY") {
		usingGroupBy = true
	}

	log.DefaultLogger.Info("排序后返回值第一值", firstResponseSort)

	//无需分组，直接一个frame返回
	if !usingGroupBy {

		log.DefaultLogger.Info("返回数据无需分组处理")

		//返回
		frame := data.NewFrame("response")

		frame.Meta = &FrameMeta

		// 按照排序后添加字段
		for _, columnsSort := range firstResponseSort {
			columnsType, _ := formatParams(isQuery, "field", timeKeys, returnMetrics, true, returnMetricNames, columnsSort, nil)

			// log.DefaultLogger.Info(fmt.Sprintf("%v,%v,%T", columnsSort, columnsType, columnsType))

			frame.Fields = append(frame.Fields,
				data.NewField(columnsSort, nil, columnsType),
			)

		}
		// 添加数据value
		for _, subValueBycolumns := range valueBycolumns {
			vals := make([]interface{}, len(firstResponseSort))
			for i, columnsSort := range firstResponseSort {
				//转换类型后的value

				columnsValue, err := formatParams(isQuery, "value", timeKeys, returnMetrics, true, returnMetricNames, columnsSort, subValueBycolumns[columnsSort])

				// log.DefaultLogger.Info(fmt.Sprintf("------%v,%v, %v, %v,%T, %v,%T--------", k, i, columnsSort, columnsValue, columnsValue, subValueBycolumns[columnsSort], subValueBycolumns[columnsSort]))

				//value 类型错误
				if err != nil {
					return response, fmt.Errorf(err.Error())
				}

				vals[i] = columnsValue
			}
			frame.AppendRow(vals...)
		}

		response.Frames = append(response.Frames, frame)
		return response, nil
	}

	log.DefaultLogger.Info("返回时间序列数据&分组")

	//按照tag分组
	dataAfterGroupBy := map[string][]map[string]interface{}{}
	for _, item := range valueBycolumns {
		key := ""
		for _, v := range tagKeys {
			if vv, ok := item[v]; ok {

				key = key + formattools.ValueToString(vv).(string) + ","
			}
		}
		preKey := strings.TrimSuffix(key, ",")

		dataAfterGroupBy[preKey] = append(dataAfterGroupBy[preKey], item)
	}

	// 分组返回
	for _, item := range dataAfterGroupBy {

		timeTypeKey := ""
		if len(timeKeys) > 0 {
			//只取第一个？
			timeTypeKey = timeKeys[0]
		}
		//默认不排序
		sortItem := item

		//timeKeys有值，按照time排序
		if timeTypeKey != "" && len(item) > 0 {
			sortItem, err = formattools.FieldSort(item, timeTypeKey)
			if err != nil {
				return response, fmt.Errorf(err.Error())
			}
		}

		// 别名替换
		aliasName := formattools.GetMetricFieldNameByAlias(alias, sortItem[0])

		//key拼接
		keyPrefix := "*"
		if aliasName != "" {
			keyPrefix = aliasName
		} else {
			key := ""
			for _, v := range tagKeys {
				if !strings.Contains(v, "_id") {
					if len(sortItem) > 0 {
						if keyValue, ok := sortItem[0][v]; ok {
							keys := formattools.ValueToString(keyValue)
							key = key + keys.(string) + ","
						}

					}
				}
			}
			if len(key) > 0 {
				keyPrefix = strings.TrimSuffix(key, ",")
			}
		}
		// log.DefaultLogger.Info("sortItem[0]", "数据", sortItem[0])
		// log.DefaultLogger.Info("tagKeys", "数据", tagKeys)
		// log.DefaultLogger.Info("keyrepfix", "数据", keyPrefix)

		// frame := data.NewFrame(keyPrefix)
		frame := data.NewFrame("")
		frame.Meta = &FrameMeta
		frameName := ""
		// 按照排序后添加字段
		for _, columnsSort := range firstResponseSort {
			columnsType, _ := formatParams(isQuery, "field", timeKeys, returnMetrics, false, returnMetricNames, columnsSort, nil)
			//
			NewFieldName := columnsSort
			//
			isMetricName := false
			for _, v := range returnMetricNames {
				if columnsSort == v {
					isMetricName = true
					break
				}
			}
			if isMetricName {
				if queryShowMetrics {
					NewFieldName = keyPrefix + "-" + columnsSort
				} else {
					NewFieldName = keyPrefix
				}
				frameName += NewFieldName + ","
			}

			// log.DefaultLogger.Info("columnsSort", "数据", columnsSort)
			// log.DefaultLogger.Info("returnMetricNames", "数据", returnMetricNames)
			// log.DefaultLogger.Info("isMetricName", "数据", isMetricName)
			// log.DefaultLogger.Info("queryShowMetrics", "数据", queryShowMetrics)

			frame.Fields = append(frame.Fields,
				data.NewField(NewFieldName, nil, columnsType),
			)
		}

		// frame.Name = frameName

		//没有数据,跳过
		if len(item) <= 0 {
			response.Frames = append(response.Frames, frame)
			continue
		}

		// 添加数据value
		for _, subValueBycolumns := range sortItem {
			vals := make([]interface{}, len(firstResponseSort))
			for i, columnsSort := range firstResponseSort {
				//转换类型后的value
				columnsValue, err := formatParams(isQuery, "value", timeKeys, returnMetrics, false, returnMetricNames, columnsSort, subValueBycolumns[columnsSort])
				//value 类型错误
				if err != nil {
					return response, fmt.Errorf(err.Error())
				}

				vals[i] = columnsValue
			}
			frame.AppendRow(vals...)
		}

		// log.DefaultLogger.Info("frame", "数据", &frame.Fields[0])
		response.Frames = append(response.Frames, frame)
	}

	return response, nil
}

// 三方trace接口查询
func (d *Datasource) trace(ctx context.Context, tracedeug bool, traceUrl, tracingIdValue string, fromTime, toTime int64) (res map[string]interface{}, err error) {

	var body map[string]interface{}

	postData := make(map[string]interface{})

	postData["_id"] = tracingIdValue

	postData["DATABASE"] = "flow_log"
	postData["TABLE"] = "l7_flow_log"
	postData["MAX_ITERATION"] = 30
	postData["NETWORK_DELAY_US"] = 3000000
	postData["time_end"] = toTime
	postData["time_start"] = fromTime

	postDataMap, _ := json.Marshal(postData)
	StrPostData := string(postDataMap)

	log.DefaultLogger.Info("请求tracing接口", "数据", StrPostData)

	//请求url
	tracedeugStr := strconv.FormatBool(tracedeug)
	traceingUrl := traceUrl + "/v1/stats/querier/L7FlowTracing?debug=" + tracedeugStr

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, traceingUrl, strings.NewReader(StrPostData))

	if err != nil {
		return body, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Add("Content-Type", "application/json; charset=utf-8")
	req.Header.Add("X-User-Id", "1")
	req.Header.Add("X-User-Type", "1")

	//发起请求
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return body, fmt.Errorf("请求接口失败: %w", err)
	}
	//
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.DefaultLogger.Error("关闭接口响应失败", "错误", err.Error())
		}
	}()
	defer resp.Body.Close()

	// Make sure the response was successful
	if resp.StatusCode != http.StatusOK {
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		newStr := buf.String()
		return body, fmt.Errorf("预期状态码返回200, 实际返回 %d,参数数据 %v, 返回数据 %v", resp.StatusCode, StrPostData, newStr)
	}

	// 接口返回格式
	apiRes := json.NewDecoder(resp.Body)
	apiRes.UseNumber()
	err = apiRes.Decode(&body)

	if err != nil {
		return body, fmt.Errorf("接口返回数据格式化失败: %w", err)
	}

	// 记录日志
	// log.DefaultLogger.Info("格式化后接口返回", "数据", body)

	return body, nil
}

// 返回格式处理，columns&value字段类型
func formatParams(isQuery bool, formatType string, timeKeys []string, returnMetrics []interface{}, verifyMetricsType bool, returnMetricNames []string, columnsSort string, value interface{}) (res interface{}, err error) {

	var res_kind_string bool

	if value == nil {
		res_kind_string = false
	} else {
		type_res := reflect.TypeOf(value)
		res_kind := type_res.Kind()
		if res_kind == reflect.String {
			res_kind_string = true
		}
	}

	//判断k是否是时间类型
	isTime := false
	for _, subTimeKeys := range timeKeys {
		if columnsSort == subTimeKeys {
			isTime = true
			break
		}
	}

	if isTime {
		if formatType == "field" {
			return []time.Time{}, nil

		} else {
			if res_kind_string {
				tv, err := value.(json.Number).Float64()
				if err != nil {
					return nil, fmt.Errorf(fmt.Sprintf("时间: columns: %v, value: %v 断言float64失败,类型%T", columnsSort, value, value))
				}
				return time.Unix(int64(tv), 0), nil
			} else {
				return nil, fmt.Errorf(fmt.Sprintf("时间：columns: %v, value: %v 断言失败,类型%T", columnsSort, value, value))
			}
		}

	} else {
		//判断是否是Metric数据
		isNumber := false
		for _, subReturnMetricNames := range returnMetricNames {
			if columnsSort == subReturnMetricNames {
				isNumber = true
				break
			}
		}

		if isNumber {
			//metric 类型
			isNumber2 := false
			//判断类型
			if verifyMetricsType {
				if len(returnMetrics) > 0 {
					for _, subReturnMetrics := range returnMetrics {
						subReturnMetricsMap := subReturnMetrics.(map[string]interface{})
						if subReturnMetricsMap["name"] == columnsSort {
							if subReturnMetricsMap["type"] != 7 {
								isNumber2 = true
								break
							}
						}
					}
				}
			} else {
				isNumber2 = true
			}

			if isNumber2 {
				if formatType == "field" {
					return []*float64{}, nil
					// return []float64{}, nil

				} else {
					// 不为nil
					if res_kind_string {
						mv, err := value.(json.Number).Float64()
						if err != nil {
							return nil, fmt.Errorf(fmt.Sprintf("columns: %v, value: %v 转float64失败,类型%T", columnsSort, value, value))
						}
						return &mv, nil
						// return mv, nil

					} else {
						return (*float64)(nil), nil
						// var feildV float64 = 0
						// return feildV, nil
					}

				}
			} else {
				//string
				if formatType == "field" {
					return []string{}, nil
				} else {
					return formattools.ValueToString(value).(string), nil
				}
			}
		} else {
			//string
			if formatType == "field" {
				return []string{}, nil
			} else {
				return formattools.ValueToString(value).(string), nil
			}
		}
	}
}

// 页面基础校验参数
func (d *Datasource) verifyParamsBase(dsj, qj, queryText map[string]interface{}) (err error) {

	//requestUrl
	if _, ok := dsj["requestUrl"]; !ok {
		return fmt.Errorf("缺失数据: requestUrl")
	}

	//traceUrl
	if _, ok := dsj["traceUrl"]; !ok {
		return fmt.Errorf("缺失数据: traceUrl")
	}

	// 获取sql
	if _, ok := qj["sql"]; !ok {
		return fmt.Errorf("缺失数据: sql")
	}
	// 获取returnMetrics
	if _, ok := qj["returnMetrics"]; !ok {
		return fmt.Errorf("缺失数据: returnMetrics")
	}

	// 获取returnTags
	if _, ok := qj["returnTags"]; !ok {
		return fmt.Errorf("缺失数据: returnTags")
	}

	//从queryText获取

	// appType
	if _, ok := queryText["appType"]; !ok {
		return fmt.Errorf("缺失数据: appType")
	}

	// 获取db
	if _, ok := queryText["db"]; !ok {
		return fmt.Errorf("缺失数据: db")
	}

	// 获取sources
	if _, ok := queryText["sources"]; !ok {
		return fmt.Errorf("缺失数据: sources")
	}

	return nil
}

// 页面校验参数
func (d *Datasource) verifyParams(qj, queryText map[string]interface{}) (err error) {

	//qj 获取
	//metaExtra
	if _, ok := qj["metaExtra"]; !ok {
		return fmt.Errorf("缺失数据: metaExtra")
	}

	// log.DefaultLogger.Error("query.JSON.queryText", "数据", qj["queryText"], "类型", fmt.Sprintf("%T", qj["queryText"]))

	//从queryText获取

	//formatAs
	if _, ok := queryText["formatAs"]; !ok {
		return fmt.Errorf("缺失数据: formatAs")
	}

	//alias
	if _, ok := queryText["alias"]; !ok {
		return fmt.Errorf("缺失数据: alias")
	}

	return nil
}

// 三方querier接口查询
func (d *Datasource) querier(ctx context.Context, db, sql, sources, token, requestUrl string, fromTimeInt64, toTimeInt64 int64) (res newtypes.ApiMetrics, err error) {

	var body newtypes.ApiMetrics

	postData := make(map[string]string)

	if sql == "" {
		return body, fmt.Errorf("sql不能为空")
	}

	if timeFrom := strings.Contains(sql, "'${__from:date:seconds}'"); timeFrom {
		fromTimeString := strconv.FormatInt(fromTimeInt64, 10)
		sql = strings.ReplaceAll(sql, "'${__from:date:seconds}'", fromTimeString)
	}

	if timeTo := strings.Contains(sql, "'${__to:date:seconds}'"); timeTo {
		toTimeString := strconv.FormatInt(toTimeInt64, 10)
		sql = strings.ReplaceAll(sql, "'${__to:date:seconds}'", toTimeString)
	}

	data := url.Values{}
	data.Set("sql", sql)

	postData["sql"] = sql

	if db != "" {
		postData["db"] = db
		data.Set("db", db)
	}

	if sources != "" {
		postData["data_precision"] = sources
		data.Set("data_precision", sources)
	}

	// postDataMap, _ := json.Marshal(postData)
	// StrPostData := string(postDataMap)

	log.DefaultLogger.Info("请求querier接口", "数据", data)

	//请求url
	querier := requestUrl + "/v1/query/?debug=true"

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, querier, bytes.NewReader([]byte(data.Encode())))

	if err != nil {
		return body, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	// 如果有token
	if token != "" {
		req.Header.Add("Authorization", "Bearer "+token)
	}

	//发起请求
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return body, fmt.Errorf("请求接口失败: %w", err)
	}
	//
	defer func() {
		if err := resp.Body.Close(); err != nil {
			log.DefaultLogger.Error("关闭接口响应失败", "错误", err.Error())
		}
	}()
	defer resp.Body.Close()

	// Make sure the response was successful
	if resp.StatusCode != http.StatusOK {
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		newStr := buf.String()
		return body, fmt.Errorf("预期状态码返回200, 实际返回 %d,参数数据 %v, 数据 %v", resp.StatusCode, data, newStr)
	}

	// 接口返回格式
	apiRes := json.NewDecoder(resp.Body)
	apiRes.UseNumber()
	err = apiRes.Decode(&body)

	if err != nil {
		return body, fmt.Errorf("接口返回数据格式化失败: %w", err)
	}

	// 记录日志
	// log.DefaultLogger.Info("格式化后接口返回", "数据", body)

	return body, nil
}

// CheckHealth performs a request to the specified data source and returns an error if the HTTP handler did not return
// a 200 OK response.
func (d *Datasource) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	// r, err := http.NewRequestWithContext(ctx, http.MethodGet, d.settings.URL, nil)
	// r, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://172.30.128.1:10001/metrics", nil)
	// if err != nil {
	// 	return newHealthCheckErrorf("could not create request"), nil
	// }
	// resp, err := d.httpClient.Do(r)
	// if err != nil {
	// 	return newHealthCheckErrorf("request error"), nil
	// }
	// defer func() {
	// 	if err := resp.Body.Close(); err != nil {
	// 		log.DefaultLogger.Error("check health: failed to close response body", "err", err.Error())
	// 	}
	// }()
	// if resp.StatusCode != http.StatusOK {
	// 	return newHealthCheckErrorf("got response code %d", resp.StatusCode), nil
	// }
	var vv interface{}
	json.Unmarshal(d.settings.JSONData, &vv)

	dsj := vv.(map[string]interface{})

	if _, ok := dsj["requestUrl"]; !ok {
		return newHealthCheckErrorf("缺失配置requestUrl"), nil
	}
	//requestUrl
	requestUrl := dsj["requestUrl"].(string)

	_, err := d.querier(ctx, "", "show databases", "", "", requestUrl, 0, 0)

	if err != nil {
		return newHealthCheckErrorf(err.Error()), nil
	}
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "数据源测试正常",
	}, nil
}

// newHealthCheckErrorf returns a new *backend.CheckHealthResult with its status set to backend.HealthStatusError
// and the specified message, which is formatted with Sprintf.
func newHealthCheckErrorf(format string, args ...interface{}) *backend.CheckHealthResult {
	return &backend.CheckHealthResult{Status: backend.HealthStatusError, Message: fmt.Sprintf(format, args...)}
}
