/*
 * Copyright © 2016-2018 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import './rulechain.scss';

import 'tooltipster/dist/css/tooltipster.bundle.min.css';
import 'tooltipster/dist/js/tooltipster.bundle.min.js';
import 'tooltipster/dist/css/plugins/tooltipster/sideTip/themes/tooltipster-sideTip-shadow.min.css';

/* eslint-disable import/no-unresolved, import/default */

import addRuleNodeTemplate from './add-rulenode.tpl.html';
import addRuleNodeLinkTemplate from './add-link.tpl.html';

/* eslint-enable import/no-unresolved, import/default */

/*@ngInject*/
export function RuleChainController($stateParams, $scope, $compile, $q, $mdUtil, $timeout, $mdExpansionPanel, $document, $mdDialog,
                                    $filter, $translate, hotkeys, types, ruleChainService, Modelfactory, flowchartConstants,
                                    ruleChain, ruleChainMetaData, ruleNodeComponents) {

    var vm = this;

    vm.$mdExpansionPanel = $mdExpansionPanel;
    vm.types = types;

    vm.editingRuleNode = null;
    vm.isEditingRuleNode = false;

    vm.editingRuleNodeLink = null;
    vm.isEditingRuleNodeLink = false;

    vm.ruleChain = ruleChain;
    vm.ruleChainMetaData = ruleChainMetaData;

    vm.canvasControl = {};

    vm.ruleChainModel = {
        nodes: [],
        edges: []
    };

    vm.ruleNodeTypesModel = {};
    vm.ruleChainLibraryLoaded = false;
    for (var type in types.ruleNodeType) {
        if (!types.ruleNodeType[type].special) {
            vm.ruleNodeTypesModel[type] = {
                model: {
                    nodes: [],
                    edges: []
                },
                selectedObjects: []
            };
        }
    }

    vm.selectedObjects = [];

    vm.modelservice = Modelfactory(vm.ruleChainModel, vm.selectedObjects);

    vm.saveRuleChain = saveRuleChain;
    vm.revertRuleChain = revertRuleChain;

    vm.objectsSelected = objectsSelected;
    vm.deleteSelected = deleteSelected;

    initHotKeys();

    function initHotKeys() {
        hotkeys.bindTo($scope)
            .add({
                combo: 'ctrl+a',
                description: $translate.instant('rulenode.select-all'),
                allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
                callback: function (event) {
                    event.preventDefault();
                    vm.modelservice.selectAll();
                }
            })
            .add({
                combo: 'esc',
                description: $translate.instant('rulenode.deselect-all'),
                allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
                callback: function (event) {
                    event.preventDefault();
                    vm.modelservice.deselectAll();
                }
            })
            .add({
                combo: 'ctrl+s',
                description: $translate.instant('action.apply'),
                allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
                callback: function (event) {
                    event.preventDefault();
                    vm.saveRuleChain();
                }
            })
            .add({
                combo: 'ctrl+z',
                description: $translate.instant('action.decline-changes'),
                allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
                callback: function (event) {
                    event.preventDefault();
                    vm.revertRuleChain();
                }
            })
            .add({
                combo: 'del',
                description: $translate.instant('rulenode.delete-selected-objects'),
                allowIn: ['INPUT', 'SELECT', 'TEXTAREA'],
                callback: function (event) {
                    event.preventDefault();
                    vm.modelservice.deleteSelected();
                }
            })
    }

    vm.onEditRuleNodeClosed = function() {
        vm.editingRuleNode = null;
    };

    vm.onEditRuleNodeLinkClosed = function() {
        vm.editingRuleNodeLink = null;
    };

    vm.saveRuleNode = function(theForm) {
        theForm.$setPristine();
        vm.isEditingRuleNode = false;
        vm.ruleChainModel.nodes[vm.editingRuleNodeIndex] = vm.editingRuleNode;
        vm.editingRuleNode = angular.copy(vm.editingRuleNode);
    };

    vm.saveRuleNodeLink = function(theForm) {
        theForm.$setPristine();
        vm.isEditingRuleNodeLink = false;
        vm.ruleChainModel.edges[vm.editingRuleNodeLinkIndex] = vm.editingRuleNodeLink;
        vm.editingRuleNodeLink = angular.copy(vm.editingRuleNodeLink);
    };

    vm.onRevertRuleNodeEdit = function(theForm) {
        theForm.$setPristine();
        var node = vm.ruleChainModel.nodes[vm.editingRuleNodeIndex];
        vm.editingRuleNode = angular.copy(node);
    };

    vm.onRevertRuleNodeLinkEdit = function(theForm) {
        theForm.$setPristine();
        var edge = vm.ruleChainModel.edges[vm.editingRuleNodeLinkIndex];
        vm.editingRuleNodeLink = angular.copy(edge);
    };

    vm.nodeLibCallbacks = {
        nodeCallbacks: {
            'mouseEnter': function (event, node) {
                displayNodeDescriptionTooltip(event, node);
            },
            'mouseLeave': function () {
                destroyTooltips();
            },
            'mouseDown': function () {
                destroyTooltips();
            }
        }
    };

    vm.typeHeaderMouseEnter = function(event, typeId) {
        var ruleNodeType = types.ruleNodeType[typeId];
        displayTooltip(event,
            '<div class="tb-rule-node-tooltip">' +
            '<div id="tooltip-content" layout="column">' +
            '<div class="tb-node-title">' + $translate.instant(ruleNodeType.name) + '</div>' +
            '<div class="tb-node-details">' + $translate.instant(ruleNodeType.details) + '</div>' +
            '</div>' +
            '</div>'
        );
    };

    vm.destroyTooltips = destroyTooltips;

    function destroyTooltips() {
        if (vm.tooltipTimeout) {
            $timeout.cancel(vm.tooltipTimeout);
            vm.tooltipTimeout = null;
        }
        var instances = angular.element.tooltipster.instances();
        instances.forEach((instance) => {
            instance.destroy();
        });
    }

    function displayNodeDescriptionTooltip(event, node) {
        displayTooltip(event,
            '<div class="tb-rule-node-tooltip">' +
            '<div id="tooltip-content" layout="column">' +
            '<div class="tb-node-title">' + node.component.name + '</div>' +
            '<div class="tb-node-description">' + node.component.configurationDescriptor.nodeDefinition.description + '</div>' +
            '<div class="tb-node-details">' + node.component.configurationDescriptor.nodeDefinition.details + '</div>' +
            '</div>' +
            '</div>'
        );
    }

    function displayTooltip(event, content) {
        destroyTooltips();
        vm.tooltipTimeout = $timeout(() => {
            var element = angular.element(event.target);
            element.tooltipster(
                {
                    theme: 'tooltipster-shadow',
                    delay: 100,
                    trigger: 'custom',
                    triggerOpen: {
                        click: false,
                        tap: false
                    },
                    triggerClose: {
                        click: true,
                        tap: true,
                        scroll: true
                    },
                    side: 'right',
                    trackOrigin: true
                }
            );
            var contentElement = angular.element(content);
            $compile(contentElement)($scope);
            var tooltip = element.tooltipster('instance');
            tooltip.content(contentElement);
            tooltip.open();
        }, 500);
    }

    vm.editCallbacks = {
        edgeDoubleClick: function (event, edge) {
            var sourceNode = vm.modelservice.nodes.getNodeByConnectorId(edge.source);
            if (sourceNode.component.type != types.ruleNodeType.INPUT.value) {
                vm.isEditingRuleNode = false;
                vm.editingRuleNode = null;
                vm.editingRuleNodeLinkLabels = ruleChainService.getRuleNodeSupportedLinks(sourceNode.component);
                vm.isEditingRuleNodeLink = true;
                vm.editingRuleNodeLinkIndex = vm.ruleChainModel.edges.indexOf(edge);
                vm.editingRuleNodeLink = angular.copy(edge);
            }
        },
        nodeCallbacks: {
            'doubleClick': function (event, node) {
                if (node.component.type != types.ruleNodeType.INPUT.value) {
                    vm.isEditingRuleNodeLink = false;
                    vm.editingRuleNodeLink = null;
                    vm.isEditingRuleNode = true;
                    vm.editingRuleNodeIndex = vm.ruleChainModel.nodes.indexOf(node);
                    vm.editingRuleNode = angular.copy(node);
                }
            }
        },
        isValidEdge: function (source, destination) {
            return source.type === flowchartConstants.rightConnectorType && destination.type === flowchartConstants.leftConnectorType;
        },
        createEdge: function (event, edge) {
            var deferred = $q.defer();
            var sourceNode = vm.modelservice.nodes.getNodeByConnectorId(edge.source);
            if (sourceNode.component.type == types.ruleNodeType.INPUT.value) {
                var destNode = vm.modelservice.nodes.getNodeByConnectorId(edge.destination);
                if (destNode.component.type == types.ruleNodeType.RULE_CHAIN.value) {
                    deferred.reject();
                } else {
                    var res = $filter('filter')(vm.ruleChainModel.edges, {source: vm.inputConnectorId});
                    if (res && res.length) {
                        vm.modelservice.edges.delete(res[0]);
                    }
                    deferred.resolve(edge);
                }
            } else {
                var labels = ruleChainService.getRuleNodeSupportedLinks(sourceNode.component);
                addRuleNodeLink(event, edge, labels).then(
                    (link) => {
                        deferred.resolve(link);
                    },
                    () => {
                        deferred.reject();
                    }
                );
            }
            return deferred.promise;
        },
        dropNode: function (event, node) {
            addRuleNode(event, node);
        }
    };

    loadRuleChainLibrary();

    function loadRuleChainLibrary() {
        for (var i=0;i<ruleNodeComponents.length;i++) {
            var ruleNodeComponent = ruleNodeComponents[i];
            var componentType = ruleNodeComponent.type;
            var model = vm.ruleNodeTypesModel[componentType].model;
            var node = {
                id: model.nodes.length,
                component: ruleNodeComponent,
                name: '',
                nodeClass: vm.types.ruleNodeType[componentType].nodeClass,
                icon: vm.types.ruleNodeType[componentType].icon,
                x: 30,
                y: 10+50*model.nodes.length,
                connectors: []
            };
            if (ruleNodeComponent.configurationDescriptor.nodeDefinition.inEnabled) {
                node.connectors.push(
                    {
                        type: flowchartConstants.leftConnectorType,
                        id: model.nodes.length * 2
                    }
                );
            }
            if (ruleNodeComponent.configurationDescriptor.nodeDefinition.outEnabled) {
                node.connectors.push(
                    {
                        type: flowchartConstants.rightConnectorType,
                        id: model.nodes.length * 2 + 1
                    }
                );
            }
            model.nodes.push(node);
        }
        vm.ruleChainLibraryLoaded = true;
        prepareRuleChain();
    }

    function prepareRuleChain() {

        if (vm.ruleChainWatch) {
            vm.ruleChainWatch();
            vm.ruleChainWatch = null;
        }

        vm.nextNodeID = 1;
        vm.nextConnectorID = 1;

        vm.selectedObjects.length = 0;
        vm.ruleChainModel.nodes.length = 0;
        vm.ruleChainModel.edges.length = 0;

        vm.inputConnectorId = vm.nextConnectorID++;

        vm.ruleChainModel.nodes.push(
            {
                id: vm.nextNodeID++,
                component: types.inputNodeComponent,
                name: "",
                nodeClass: types.ruleNodeType.INPUT.nodeClass,
                icon: types.ruleNodeType.INPUT.icon,
                readonly: true,
                x: 50,
                y: 150,
                connectors: [
                    {
                        type: flowchartConstants.rightConnectorType,
                        id: vm.inputConnectorId
                    },
                ]

            }
        );
        ruleChainService.resolveTargetRuleChains(vm.ruleChainMetaData.ruleChainConnections)
            .then((ruleChainsMap) => {
                createRuleChainModel(ruleChainsMap);
            }
        );
    }

    function createRuleChainModel(ruleChainsMap) {
        var nodes = [];
        for (var i=0;i<vm.ruleChainMetaData.nodes.length;i++) {
            var ruleNode = vm.ruleChainMetaData.nodes[i];
            var component = ruleChainService.getRuleNodeComponentByClazz(ruleNode.type);
            if (component) {
                var node = {
                    id: vm.nextNodeID++,
                    ruleNodeId: ruleNode.id,
                    additionalInfo: ruleNode.additionalInfo,
                    configuration: ruleNode.configuration,
                    debugMode: ruleNode.debugMode,
                    x: ruleNode.additionalInfo.layoutX,
                    y: ruleNode.additionalInfo.layoutY,
                    component: component,
                    name: ruleNode.name,
                    nodeClass: vm.types.ruleNodeType[component.type].nodeClass,
                    icon: vm.types.ruleNodeType[component.type].icon,
                    connectors: []
                };
                if (component.configurationDescriptor.nodeDefinition.inEnabled) {
                    node.connectors.push(
                        {
                            type: flowchartConstants.leftConnectorType,
                            id: vm.nextConnectorID++
                        }
                    );
                }
                if (component.configurationDescriptor.nodeDefinition.outEnabled) {
                    node.connectors.push(
                        {
                            type: flowchartConstants.rightConnectorType,
                            id: vm.nextConnectorID++
                        }
                    );
                }
                nodes.push(node);
                vm.ruleChainModel.nodes.push(node);
            }
        }

        if (vm.ruleChainMetaData.firstNodeIndex > -1) {
            var destNode = nodes[vm.ruleChainMetaData.firstNodeIndex];
            if (destNode) {
                var connectors = vm.modelservice.nodes.getConnectorsByType(destNode, flowchartConstants.leftConnectorType);
                if (connectors && connectors.length) {
                    var edge = {
                        source: vm.inputConnectorId,
                        destination: connectors[0].id
                    };
                    vm.ruleChainModel.edges.push(edge);
                }
            }
        }

        if (vm.ruleChainMetaData.connections) {
            for (i = 0; i < vm.ruleChainMetaData.connections.length; i++) {
                var connection = vm.ruleChainMetaData.connections[i];
                var sourceNode = nodes[connection.fromIndex];
                destNode = nodes[connection.toIndex];
                if (sourceNode && destNode) {
                    var sourceConnectors = vm.modelservice.nodes.getConnectorsByType(sourceNode, flowchartConstants.rightConnectorType);
                    var destConnectors = vm.modelservice.nodes.getConnectorsByType(destNode, flowchartConstants.leftConnectorType);
                    if (sourceConnectors && sourceConnectors.length && destConnectors && destConnectors.length) {
                        edge = {
                            source: sourceConnectors[0].id,
                            destination: destConnectors[0].id,
                            label: connection.type
                        };
                        vm.ruleChainModel.edges.push(edge);
                    }
                }
            }
        }

        if (vm.ruleChainMetaData.ruleChainConnections) {
            var ruleChainNodesMap = {};
            for (i = 0; i < vm.ruleChainMetaData.ruleChainConnections.length; i++) {
                var ruleChainConnection = vm.ruleChainMetaData.ruleChainConnections[i];
                var ruleChain = ruleChainsMap[ruleChainConnection.targetRuleChainId.id];
                if (ruleChainConnection.additionalInfo && ruleChainConnection.additionalInfo.ruleChainNodeId) {
                    var ruleChainNode = ruleChainNodesMap[ruleChainConnection.additionalInfo.ruleChainNodeId];
                    if (!ruleChainNode) {
                        ruleChainNode = {
                            id: vm.nextNodeID++,
                            additionalInfo: ruleChainConnection.additionalInfo,
                            targetRuleChainId: ruleChainConnection.targetRuleChainId.id,
                            x: ruleChainConnection.additionalInfo.layoutX,
                            y: ruleChainConnection.additionalInfo.layoutY,
                            component: types.ruleChainNodeComponent,
                            name: ruleChain.name,
                            nodeClass: vm.types.ruleNodeType.RULE_CHAIN.nodeClass,
                            icon: vm.types.ruleNodeType.RULE_CHAIN.icon,
                            connectors: [
                                {
                                    type: flowchartConstants.leftConnectorType,
                                    id: vm.nextConnectorID++
                                }
                            ]
                        };
                        ruleChainNodesMap[ruleChainConnection.additionalInfo.ruleChainNodeId] = ruleChainNode;
                        vm.ruleChainModel.nodes.push(ruleChainNode);
                    }
                    sourceNode = nodes[ruleChainConnection.fromIndex];
                    if (sourceNode) {
                        connectors = vm.modelservice.nodes.getConnectorsByType(sourceNode, flowchartConstants.rightConnectorType);
                        if (connectors && connectors.length) {
                            var ruleChainEdge = {
                                source: connectors[0].id,
                                destination: ruleChainNode.connectors[0].id,
                                label: ruleChainConnection.type
                            };
                            vm.ruleChainModel.edges.push(ruleChainEdge);
                        }
                    }
                }
            }
        }

        if (vm.canvasControl.adjustCanvasSize) {
            vm.canvasControl.adjustCanvasSize();
        }

        vm.isDirty = false;

        $mdUtil.nextTick(() => {
            vm.ruleChainWatch = $scope.$watch('vm.ruleChainModel',
                function (newVal, oldVal) {
                    if (!vm.isDirty && !angular.equals(newVal, oldVal)) {
                        vm.isDirty = true;
                    }
                }, true
            );
        });
    }

    function saveRuleChain() {
        var ruleChainMetaData = {
            ruleChainId: vm.ruleChain.id,
            nodes: [],
            connections: [],
            ruleChainConnections: []
        };

        var nodes = [];

        for (var i=0;i<vm.ruleChainModel.nodes.length;i++) {
            var node = vm.ruleChainModel.nodes[i];
            if (node.component.type != types.ruleNodeType.INPUT.value && node.component.type != types.ruleNodeType.RULE_CHAIN.value) {
                var ruleNode = {};
                if (node.ruleNodeId) {
                    ruleNode.id = node.ruleNodeId;
                }
                ruleNode.type = node.component.clazz;
                ruleNode.name = node.name;
                ruleNode.configuration = node.configuration;
                ruleNode.additionalInfo = node.additionalInfo;
                ruleNode.debugMode = node.debugMode;
                if (!ruleNode.additionalInfo) {
                    ruleNode.additionalInfo = {};
                }
                ruleNode.additionalInfo.layoutX = node.x;
                ruleNode.additionalInfo.layoutY = node.y;
                ruleChainMetaData.nodes.push(ruleNode);
                nodes.push(node);
            }
        }
        var res = $filter('filter')(vm.ruleChainModel.edges, {source: vm.inputConnectorId});
        if (res && res.length) {
            var firstNodeEdge = res[0];
            var firstNode = vm.modelservice.nodes.getNodeByConnectorId(firstNodeEdge.destination);
            ruleChainMetaData.firstNodeIndex = nodes.indexOf(firstNode);
        }
        for (i=0;i<vm.ruleChainModel.edges.length;i++) {
            var edge = vm.ruleChainModel.edges[i];
            var sourceNode = vm.modelservice.nodes.getNodeByConnectorId(edge.source);
            var destNode = vm.modelservice.nodes.getNodeByConnectorId(edge.destination);
            if (sourceNode.component.type != types.ruleNodeType.INPUT.value) {
                var fromIndex = nodes.indexOf(sourceNode);
                if (destNode.component.type == types.ruleNodeType.RULE_CHAIN.value) {
                    var ruleChainConnection = {
                        fromIndex: fromIndex,
                        targetRuleChainId: {entityType: vm.types.entityType.rulechain, id: destNode.targetRuleChainId},
                        additionalInfo: destNode.additionalInfo,
                        type: edge.label
                    };
                    if (!ruleChainConnection.additionalInfo) {
                        ruleChainConnection.additionalInfo = {};
                    }
                    ruleChainConnection.additionalInfo.layoutX = destNode.x;
                    ruleChainConnection.additionalInfo.layoutY = destNode.y;
                    ruleChainConnection.additionalInfo.ruleChainNodeId = destNode.id;
                    ruleChainMetaData.ruleChainConnections.push(ruleChainConnection);
                } else {
                    var toIndex = nodes.indexOf(destNode);
                    var nodeConnection = {
                        fromIndex: fromIndex,
                        toIndex: toIndex,
                        type: edge.label
                    };
                    ruleChainMetaData.connections.push(nodeConnection);
                }
            }
        }
        ruleChainService.saveRuleChainMetaData(ruleChainMetaData).then(
            (ruleChainMetaData) => {
                vm.ruleChainMetaData = ruleChainMetaData;
                prepareRuleChain();
            }
        );
    }

    function revertRuleChain() {
        prepareRuleChain();
    }

    function addRuleNode($event, ruleNode) {

        ruleNode.configuration = angular.copy(ruleNode.component.configurationDescriptor.nodeDefinition.defaultConfiguration);

        $mdDialog.show({
            controller: 'AddRuleNodeController',
            controllerAs: 'vm',
            templateUrl: addRuleNodeTemplate,
            parent: angular.element($document[0].body),
            locals: {ruleNode: ruleNode, ruleChainId: vm.ruleChain.id.id},
            fullscreen: true,
            targetEvent: $event
        }).then(function (ruleNode) {
            ruleNode.id = vm.nextNodeID++;
            ruleNode.connectors = [];
            if (ruleNode.component.configurationDescriptor.nodeDefinition.inEnabled) {
                ruleNode.connectors.push(
                    {
                        id: vm.nextConnectorID++,
                        type: flowchartConstants.leftConnectorType
                    }
                );
            }
            if (ruleNode.component.configurationDescriptor.nodeDefinition.outEnabled) {
                ruleNode.connectors.push(
                    {
                        id: vm.nextConnectorID++,
                        type: flowchartConstants.rightConnectorType
                    }
                );
            }
            vm.ruleChainModel.nodes.push(ruleNode);
        }, function () {
        });
    }

    function addRuleNodeLink($event, link, labels) {
        return $mdDialog.show({
            controller: 'AddRuleNodeLinkController',
            controllerAs: 'vm',
            templateUrl: addRuleNodeLinkTemplate,
            parent: angular.element($document[0].body),
            locals: {link: link, labels: labels},
            fullscreen: true,
            targetEvent: $event
        });
    }

    function objectsSelected() {
        return vm.modelservice.nodes.getSelectedNodes().length > 0 ||
            vm.modelservice.edges.getSelectedEdges().length > 0
    }

    function deleteSelected() {
        vm.modelservice.deleteSelected();
    }
}

/*@ngInject*/
export function AddRuleNodeController($scope, $mdDialog, ruleNode, ruleChainId, helpLinks) {

    var vm = this;

    vm.helpLinks = helpLinks;
    vm.ruleNode = ruleNode;
    vm.ruleChainId = ruleChainId;

    vm.add = add;
    vm.cancel = cancel;

    function cancel() {
        $mdDialog.cancel();
    }

    function add() {
        $scope.theForm.$setPristine();
        $mdDialog.hide(vm.ruleNode);
    }
}

/*@ngInject*/
export function AddRuleNodeLinkController($scope, $mdDialog, link, labels, helpLinks) {

    var vm = this;

    vm.helpLinks = helpLinks;
    vm.link = link;
    vm.labels = labels;

    vm.add = add;
    vm.cancel = cancel;

    function cancel() {
        $mdDialog.cancel();
    }

    function add() {
        $scope.theForm.$setPristine();
        $mdDialog.hide(vm.link);
    }
}
