# DeepFlow Tracing Panel

DeepFlow Tracing Panel 通过火焰图的形式来可视化分布式链路的全栈调用路径，可以帮助开发人员、系统运维人员以及云运维人员快速识别调用性能瓶颈及错误。

**DeepFlow 的一部分，只能与 DeepFlow 数据源一起使用，并使用“分布式跟踪 - Flame”应用程序类型。**

![DeepFlow Tracing](./src/img/screenshot.jpg)

## Feature

DeepFlow Tracing Panel 由 Flame Graph, Service List, Request Log, Related Data 四个部分组。Flame Graph 支持对请求执行路径期间发生的每一次服务调用进行可视化为条状 bar，每一个 bar 根据实际调用展示不同信息，点击条状 bar，右侧数据面板展示对应 Span 的服务、日志、相关数据，帮助您快速分析程序性能状态。接下来将为您详细介绍每部分功能的使用与说明。

![flame.png](https://yunshan-guangzhou.oss-cn-beijing.aliyuncs.com/pub/pic/20230407642f82b251c2e.png)

### Flame Graph

火焰图 x 轴以时间为维度，y 轴以调用堆栈深度为维度，按 Span 调用的顺序从上到下进行展示。火焰图由多个`条状 bar`组成，每个`条状 bar`代表一个 Span，支持对`条状 bar`进行点击等操作。

- 组成：`图标` + `调用信息` + `执行时间`
  - 图标：区分 Span 类型
    - A: 应用 Span，通过 Opentelemetry 协议收集的 Span，覆盖业务代码、框架代码
    - S: 系统 Span，通过 eBPF 零侵入采集的 Span，覆盖系统调用、应用函数（如 HTTPS）、API Gateway、服务网格 Sidecar
    - N: 网络 Span，通过 BPF 从网络流量中采集的 Span，覆盖 iptables、ipvs、OvS、LinuxBridge 等容器网络组件
  - 调用信息： 应用 Span 和系统 Span 展示的是`应用协议`、`请求类型`、`请求资源`；网络 Span 展示的是`路径统计位置`
  - 长度：表达一个 Span 的执行时间
- 操作：支持`悬停`与`点击`
  - 鼠标悬停到`条状 bar`，通过 TIP 的形式展示对应 Span 的相关信息
    - 应用 Span与网络 Span：`应用协议`、`请求类型`、`请求资源`、`服务名称`、`持续时间`
    - 系统 Span：`应用协议`、`请求类型`、`请求资源`、`服务名称`、`系统语言`、`持续时间`
    - 执行时间: 展示了 Span 的整个执行时间，自身执行时间的占比
  - 点击: 点击`条状 bar`，即高亮自身及父 Span，同时左侧的数据面板展示该 Span 的详细信息

### Service List

Service List 展示此次请求过程中所调用的服务名称，服务调用所产生的时间，以及该时间在整个请求时间下所占的时间比例。

- 点击服务列表，可在火焰图中高亮出调用此服务的 Span

### Request Log

Request Log 展示一次调用所产生的日志。

- 点击火焰图中的 Span，可展示该 Span 所产生的日志

### Related Data

Related Data 记录了由该 Span 可以追踪到的相关数据，如流量采集位置、应用协议、请求类型、请求资源、tracid、spanid、父spanid、系统调用跟踪请求id、tcp的序列号等数据。

- 点击火焰图中的 Span，可展示由该 span 所追踪出来的相关 span 信息
