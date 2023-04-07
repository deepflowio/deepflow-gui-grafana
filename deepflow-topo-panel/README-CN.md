# DeepFlow Topology Panel

DeepFlow 的流量拓扑可用于展示服务或资源之间的依赖关系，以便更好地分析和解决问题，例如分析性能瓶颈、单点故障或潜在的依赖访问等问题。接下来将为您详细介绍拓扑图。

## 拓扑图的使用

![topo_use.png](https://yunshan-guangzhou.oss-cn-beijing.aliyuncs.com/pub/pic/20230407642f82713d0bc.png)

## Panel Options

### Topo Settings

#### Type

- Simple Topo：系统根据服务或资源之间的关系，通过`节点`、`路径`进行排序
- Tree Topo：系统根据路径访问关系，按照树形结构对节点进行摆放，常用于节点数少且路径单一的场景
- Tree Topo With Group：支持对数据进行分组查询

#### Node tags

- Set tags to be displayed on the topo graph node.

## Simple Topo

![simple_topo.png](https://yunshan-guangzhou.oss-cn-beijing.aliyuncs.com/pub/pic/20230407642f82706192c.png)

Simple Topo 由`节点`、`路径`及一些`操作`组成:

- 节点：代表服务或资源，可以是某个容器服务、云服务器或者区域等
- 路径：代表服务或资源的访问方向，为`客户端`访问`服务端`，表示数据传输方向
- 操作：鼠标悬停或点击`节点`或`路径`
  - 悬停: 高亮`节点`或`路径`，进行 ToolTip 提示相关信息
    - ToolTip ：鼠标根据悬停位置的不同展示相应的数据
      - 节点：展示 pod 名称、node 类型
      - 路径：展示客户端名称、服务端名称、流量采集位置、平均请求时间、服务端异常比例、平均时延
  - 点击: 点击`节点`或`路径`，页面锁定高亮`节点`及相关`路径`，再次点击取消高亮

## Tree Topo

![tree_topo.png](https://yunshan-guangzhou.oss-cn-beijing.aliyuncs.com/pub/pic/20230407642f826e5270d.png)

Tree Topo 由`节点`、`曲线`及一些`操作`组成。数据节点方块的形式展示，在方块内显示 node 类型以及该节点的名称。有请求关联的方块之间用曲线进行连接。`操作`可参考 Simple Topo 的`操作`

## Tree Topo With Group

![tree_topo_with_group.png](https://yunshan-guangzhou.oss-cn-beijing.aliyuncs.com/pub/pic/20230407642f826f39316.png)

支持对数据进行分组查询，同时对同一组内的节点进行划分，并标记分组名称。`Tree Topo With Group`使用方式与`Tree Topo`基本一致。
