package formattools

import (
	"deepflow-grafana-backend-plugin/pkg/newtypes"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"sort"
)

func getAutoGroupKeyPrefix(ss map[string]interface{}, role string) string {

	var re *regexp.Regexp
	var re_1 *regexp.Regexp
	var re_resource *regexp.Regexp
	var res []string

	if role == "client" {

		//623被遗弃的字段用auto_xxx代替，页面短时间内可能还会带该字段查询，所以保留
		re_resource = regexp.MustCompile(`^(resource_gl\d)_id_0$`)
		re = regexp.MustCompile(`^(auto_instance)_id_0$`)
		re_1 = regexp.MustCompile(`^(auto_service)_id_0$`)
	} else if role == "server" {

		//623被遗弃的字段用auto_xxx代替，页面短时间内可能还会带该字段查询，所以保留
		re_resource = regexp.MustCompile(`^(resource_gl\d)_id_1$`)
		re = regexp.MustCompile(`^(auto_service)_id_1$`)
		re_1 = regexp.MustCompile(`^(auto_instance)_id_1$`)
	}
	for k := range ss {

		// 优先用auto_xxxx
		res = re.FindStringSubmatch(k)
		if len(res) > 0 {
			return res[1]
		} else {
			res = re_1.FindStringSubmatch(k)
			if len(res) > 0 {
				return res[1]
			} else {
				res = re_resource.FindStringSubmatch(k)
				if len(res) > 0 {
					return res[1]
				}
			}
		}
	}
	return ""
}

func getPriorityField(ss map[string]interface{}, suffix string) string {

	//   const keys = ['gprocess']
	//   return keys.find(k => {
	//     return `${k}${suffix}` in d
	//   })
	if _, ok := ss["gprocess"]; ok {
		return "gprocess" + suffix
	}
	return ""
}

func AddResourceFieldsInData(ss map[string]interface{}, role string) {

	var prefix = ""
	var suffix = ""
	var nodeType = ""

	var resourceKeyPrefix = getAutoGroupKeyPrefix(ss, role)

	if role == "client" {
		prefix = "client_"
		suffix = "_0"
	} else if role == "server" {
		prefix = "server_"
		suffix = "_1"
	}

	var priorityField = getPriorityField(ss, suffix)
	if priorityField != "" {
		ss[prefix+"resource_id"] = ss[priorityField+"_id"+suffix]
		ss[prefix+"resource"] = ss[priorityField+suffix]
	} else {
		if v, ok := ss[prefix+"node_type"]; ok {
			nodeType = v.(string)
		}

		// log

		if resourceKeyPrefix == "" {
			resourceKeyPrefix = nodeType
		}

		ss[prefix+"resource_type"] = nodeType

		if nodeType == "ip" || nodeType == "internet_ip" {
			str := fmt.Sprintf("%v(%v)", ss[resourceKeyPrefix+suffix], ss[resourceKeyPrefix+"_id"+suffix])
			ss[prefix+"resource_id"] = str
			ss[prefix+"resource"] = ss[resourceKeyPrefix+suffix]
		} else {
			if v, ok := ss[nodeType+"_id"+suffix]; ok {
				ss[prefix+"resource_id"] = v
			} else {
				ss[prefix+"resource_id"] = ss[resourceKeyPrefix+"_id"+suffix]
			}
			if v, ok := ss[nodeType+suffix]; ok {
				ss[prefix+"resource"] = v
			} else {
				ss[prefix+"resource"] = ss[resourceKeyPrefix+suffix]
			}
		}
	}

}

// 按照时间字段排序
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

// alias 替换
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

// 值转string
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

// tag翻译
func TagTranslate(tag newtypes.ApiMetrics) (res map[interface{}]map[string]interface{}, err error) {
	TagRes := make(map[interface{}]map[string]interface{})

	if res, ok := tag.Result["values"]; !ok {
		return TagRes, fmt.Errorf("接口返回数据格缺失字段: values")
	} else {
		//查询为空
		if res == nil {
			return TagRes, nil
		}
	}

	values := tag.Result["values"].([]interface{})

	for _, t := range values {
		v := t.([]interface{})
		tagValue := v[0]
		tagDisplayname := v[1]

		TagRes[tagValue] = make(map[string]interface{})

		TagRes[tagValue]["display_name"] = tagDisplayname
	}
	return TagRes, nil
}
