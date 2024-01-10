package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"sort"
	"strings"
)

func ValueToString(val interface{}) interface{} {
	switch t := val.(type) {
	case json.Number:
		return t.String()
	case nil:
		return "null"
	default:
		return val.(string)
	}
}

func FieldSort(slice []map[string]interface{}, fieldName string) (data []map[string]interface{}, err error) {
	//
	mapData := make(map[int64]map[string]interface{})
	//
	var keySplice []int64

	for _, value := range slice {
		tv := value[fieldName]
		type_res := reflect.TypeOf(tv)
		if type_res.Kind() == reflect.String {
			tv, err := tv.(json.Number).Float64()
			if err != nil {
				return nil, fmt.Errorf(fmt.Sprintf("时间: columns: %v, value: %v 断言float64失败,类型%T", fieldName, tv, tv))
			}
			key := int64(tv)
			mapData[key] = value
			keySplice = append(keySplice, key)
		} else {
			return nil, fmt.Errorf(fmt.Sprintf("时间：columns: %v, value: %v 断言失败,类型%T", fieldName, tv, tv))
		}

	}

	int64AsIntValues := make([]int, len(keySplice))

	for i, val := range keySplice {
		int64AsIntValues[i] = int(val)
	}
	sort.Ints(int64AsIntValues)

	for _, v := range int64AsIntValues {
		data = append(data, mapData[int64(v)])
	}

	return data, nil

}

func GetMetricFieldNameByAlias(alias string, item map[string]interface{}) string {
	regexp1 := regexp.MustCompile(`\$\{.*?\}`)

	res := regexp1.ReplaceAllStringFunc(alias, func(s string) string {
		regexp2 := regexp.MustCompile(`\$\{(\S*)\}`)
		ress := regexp2.FindStringSubmatch(s)
		if len(ress) > 0 {
			if v, ok := item[ress[1]]; ok {
				return ValueToString(v).(string)
			} else {
				return s
			}
		} else {
			return s
		}

	})
	return res
}

func main() {
	returnMetricNames := make([]string, 1)

	returnMetricNames[0] = "TopK(Cloud Tag,1)"

	values := make([]interface{}, 1)

	values_0 := make([]interface{}, 2)

	// values_0_0 := make([]interface{}, 2)

	values_0[0] = 1704683117
	values_0[1] = 0

	values[0] = values_0

	columns := make([]interface{}, 2)
	columns[0] = "time_1"
	columns[1] = "TopK(Cloud Tag,1)"

	//= []string{"time_1", "TopK(Cloud Tag,1)"}

	//column为key，格式化数据
	valueBycolumns := make([]map[string]interface{}, len(values))

	var res_kind_string bool

	for i := 0; i < len(values); i++ {
		subValue := values[i].([]interface{})

		kv := make(map[string]interface{})
		for j := 0; j < len(columns); j++ {
			kvName := columns[j].(string)
			kvValue := subValue[j]
			if kvName == "toString(_id)" {
				kvName = "_id"
				kvValue = "id-" + ValueToString(kvValue).(string)
			}

			fmt.Println(kvValue)
			if kvValue == nil {
				res_kind_string = false
			} else {
				type_res := reflect.TypeOf(kvValue)
				res_kind := type_res.Kind()
				fmt.Println(res_kind)
				if res_kind == reflect.String {
					res_kind_string = true
				}
			}

			fmt.Println(res_kind_string)

			kv[kvName] = kvValue
		}
		valueBycolumns[i] = kv
	}

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

	dataAfterGroupBy := map[string][]map[string]interface{}{}
	for _, item := range valueBycolumns {
		key := ""
		for _, v := range tagKeys {
			if vv, ok := item[v]; ok {

				key = key + ValueToString(vv).(string) + ","
			}
		}
		preKey := strings.TrimSuffix(key, ",")

		dataAfterGroupBy[preKey] = append(dataAfterGroupBy[preKey], item)
	}

	fmt.Println(dataAfterGroupBy)

	// 分组返回
	// for _, item := range dataAfterGroupBy {

	// 	timeTypeKey := ""
	// 	if len(timeKeys) > 0 {
	// 		//只取第一个？
	// 		timeTypeKey = timeKeys[0]
	// 	}
	// 	//默认不排序
	// 	sortItem := item

	// 	//timeKeys有值，按照time排序
	// 	if timeTypeKey != "" && len(item) > 0 {
	// 		sortItem, err := FieldSort(item, timeTypeKey)
	// 		if err != nil {
	// 			fmt.Errorf(err.Error())
	// 		}
	// 	}

	// 	// 别名替换
	// 	aliasName := GetMetricFieldNameByAlias(alias, sortItem[0])

	// 	//key拼接
	// 	keyPrefix := "*"
	// 	if aliasName != "" {
	// 		keyPrefix = aliasName
	// 	} else {
	// 		key := ""
	// 		for _, v := range tagKeys {
	// 			if !strings.Contains(v, "_id") {
	// 				if len(sortItem) > 0 {
	// 					if keyValue, ok := sortItem[0][v]; ok {
	// 						keys := ValueToString(keyValue)
	// 						key = key + keys.(string) + ","
	// 					}

	// 				}
	// 			}
	// 		}
	// 		if len(key) > 0 {
	// 			keyPrefix = strings.TrimSuffix(key, ",")
	// 		}
	// 	}
	// 	// log.DefaultLogger.Info("sortItem[0]", "数据", sortItem[0])
	// 	// log.DefaultLogger.Info("tagKeys", "数据", tagKeys)
	// 	// log.DefaultLogger.Info("keyrepfix", "数据", keyPrefix)

	// 	// frame := data.NewFrame(keyPrefix)
	// 	frame := data.NewFrame("")

	// 	frameName := ""
	// 	// 按照排序后添加字段
	// 	for _, columnsSort := range firstResponseSort {
	// 		columnsType, _ := formatParams(isQuery, "field", timeKeys, returnMetrics, false, returnMetricNames, columnsSort, nil)
	// 		//
	// 		NewFieldName := columnsSort
	// 		//
	// 		isMetricName := false
	// 		for _, v := range returnMetricNames {
	// 			if columnsSort == v {
	// 				isMetricName = true
	// 				break
	// 			}
	// 		}
	// 		if isMetricName {
	// 			if queryShowMetrics {
	// 				NewFieldName = keyPrefix + "-" + columnsSort
	// 			} else {
	// 				NewFieldName = keyPrefix
	// 			}
	// 			frameName += NewFieldName + ","
	// 		}

	// 		// log.DefaultLogger.Info("columnsSort", "数据", columnsSort)
	// 		// log.DefaultLogger.Info("returnMetricNames", "数据", returnMetricNames)
	// 		// log.DefaultLogger.Info("isMetricName", "数据", isMetricName)
	// 		// log.DefaultLogger.Info("queryShowMetrics", "数据", queryShowMetrics)

	// 		frame.Fields = append(frame.Fields,
	// 			data.NewField(NewFieldName, nil, columnsType),
	// 		)
	// 	}

	// 	// frame.Name = frameName

	// 	//没有数据,跳过
	// 	if len(item) <= 0 {
	// 		continue
	// 	}

	// 	// 添加数据value
	// 	for _, subValueBycolumns := range sortItem {
	// 		vals := make([]interface{}, len(firstResponseSort))
	// 		for i, columnsSort := range firstResponseSort {
	// 			//转换类型后的value
	// 			columnsValue, err := formatParams(isQuery, "value", timeKeys, returnMetrics, false, returnMetricNames, columnsSort, subValueBycolumns[columnsSort])
	// 			//value 类型错误
	// 			if err != nil {
	// 				fmt.Errorf(err.Error())
	// 			}

	// 			vals[i] = columnsValue
	// 		}
	// 		frame.AppendRow(vals...)
	// 	}

	// 	// log.DefaultLogger.Info("frame", "数据", &frame.Fields[0])

	// }

}
