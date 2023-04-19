# DeepFlow Topology Panel

The Topology Panel of DeepFlow can be used to display the dependency relationships between services or resources for better analysis and problem-solving, such as analyzing performance bottlenecks, single points of failure, or potential dependency access issues. Next, we will introduce the topology graph in detail.

## Usage of Topology Graph use


## Panel Options

### Topo Settings

#### Type

- Simple Topo：The system sorts `nodes` and `paths` based on the relationships between services or resources
- Tree Topo：The system arranges nodes in a tree structure based on path access relationships, commonly used for scenarios with fewer nodes and single paths
- Tree Topo With Group：Supports grouping queries for data and dividing nodes in the same group, with group names marked. Simple Topo simple

#### Node tags

- Set tags to be displayed on the topo graph node.

## Simple Topo

![simple-topo.jpg](https://raw.githubusercontent.com/deepflowio/deepflow-gui-grafana/main/deepflow-topo-panel/src/img/screenshot-simple-topo.jpg)

Simple Topo consists of `nodes`, `paths`, and some operations:

- Nodes: Represent services or resources, which can be container services, cloud servers, or regions
- Paths: Represent the direction of access to services or resources, indicating the direction of data transmission from `the client` to `the server`
- Operations: Hover or click on nodes or paths
  - Hover: Highlight nodes or paths and provide ToolTip to display relevant information
    - ToolTip: Displays different data based on the location of the mouse hover
      - Nodes: Displays pod names and node types
      - Paths: Displays client names, server names, traffic collection locations, average request time, server exception rate, and average delay
  - Click: Click on nodes or paths to highlight the nodes and related paths, click again to cancel the highlight

## Tree Topo

![tree_topo.jpg](https://raw.githubusercontent.com/deepflowio/deepflow-gui-grafana/main/deepflow-topo-panel/src/img/screenshot-tree-topo.jpg)

Tree Topo consists of nodes, curves, and some operations. Data nodes are displayed in square form, showing the node type and name of the node. The squares with request associations are connected by curves. The operation can refer to the operations of Simple Topo.

## Tree Topo With Group

![tree_topo_with_group.jpg](https://raw.githubusercontent.com/deepflowio/deepflow-gui-grafana/main/deepflow-topo-panel/src/img/screenshot-tree-topo-with-group.jpg)

Supports grouping queries for data and dividing nodes in the same group, with group names marked. The usage of Tree Topo With Group is similar to that of Tree Topo.
