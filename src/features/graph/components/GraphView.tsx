import { Badge } from '@consta/uikit/Badge';
import { Loader } from '@consta/uikit/Loader';
import { useTheme, type ThemePreset } from '@consta/uikit/Theme';
import { forceCollide } from 'd3-force-3d';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import ForceGraph2D, {
  ForceGraphMethods,
  LinkObject,
  NodeObject
} from 'react-force-graph-2d';
import type {
  ArtifactNode,
  DomainNode,
  GraphLink,
  Initiative,
  ModuleNode,
  ModuleStatus
} from '../../data';
import type { GraphLayoutNodePosition } from '../../types/graph';
import styles from './GraphView.module.css';

const CAMERA_STORAGE_KEY = 'graph-view:camera-main';
const LAYOUT_EPSILON = 0.05;

type GraphNode =
  | ({ type: 'module' } & ModuleNode)
  | ({ type: 'domain' } & DomainNode)
  | ({ type: 'initiative' } & Initiative)
  | ({ type: 'artifact'; reuseScore?: number } & ArtifactNode);

type LayoutChangeReason = 'drag' | 'engine';

type GraphViewProps = {
  modules: ModuleNode[];
  domains: DomainNode[];
  artifacts: ArtifactNode[];
  initiatives: Initiative[];
  links: GraphLink[];
  graphVersion?: string | number;
  onSelect: (node: GraphNode | null) => void;
  highlightedNode: string | null;
  visibleDomainIds: Set<string>;
  visibleModuleStatuses: Set<ModuleStatus>;
  layoutPositions: Record<string, GraphLayoutNodePosition>;
  normalizationRequest?: number;
  onLayoutChange?: (
    positions: Record<string, GraphLayoutNodePosition>,
    reason: LayoutChangeReason
  ) => void;
};

type ForceNode = NodeObject & GraphNode;
type ForceLink = LinkObject & GraphLink;

type CameraState = {
  center: { x: number; y: number };
  zoom: number;
};

function resolveCameraStorageKey(graphVersion?: string | number): string {
  return graphVersion ? `${CAMERA_STORAGE_KEY}:${graphVersion}` : CAMERA_STORAGE_KEY;
}

function readStoredCameraState(storageKey: string): CameraState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'zoom' in parsed &&
      'center' in parsed &&
      parsed.center &&
      typeof (parsed as { zoom: unknown }).zoom === 'number' &&
      Number.isFinite((parsed as { zoom: number }).zoom) &&
      (parsed as { zoom: number }).zoom > 0 &&
      typeof (parsed as { center: { x: unknown } }).center.x === 'number' &&
      Number.isFinite((parsed as { center: { x: number } }).center.x) &&
      typeof (parsed as { center: { y: unknown } }).center.y === 'number' &&
      Number.isFinite((parsed as { center: { y: number } }).center.y)
    ) {
      return {
        zoom: (parsed as { zoom: number }).zoom,
        center: {
          x: (parsed as { center: { x: number } }).center.x,
          y: (parsed as { center: { y: number } }).center.y
        }
      };
    }
  } catch (error) {
    console.warn('Failed to read camera state from storage', error);
  }

  return null;
}

function writeStoredCameraState(storageKey: string, state: CameraState | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!state) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist camera state', error);
  }
}

const GraphView: React.FC<GraphViewProps> = ({
  modules,
  domains,
  artifacts,
  initiatives,
  links,
  graphVersion,
  onSelect,
  highlightedNode,
  visibleDomainIds,
  visibleModuleStatuses,
  layoutPositions,
  normalizationRequest,
  onLayoutChange
}) => {
  const { theme, themeClassNames } = useTheme();
  const [palette, setPalette] = useState<GraphPalette>(() => resolvePalette(themeClassNames));
  const cameraStorageKey = useMemo(
    () => resolveCameraStorageKey(graphVersion),
    [graphVersion]
  );
  const initialCameraState = useMemo(
    () => readStoredCameraState(cameraStorageKey),
    [cameraStorageKey]
  );
  const graphRef = useRef<ForceGraphMethods | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const nodeCacheRef = useRef<Map<string, ForceNode>>(new Map());
  const layoutPositionsRef = useRef<Record<string, GraphLayoutNodePosition>>(layoutPositions);
  const lastReportedLayoutRef = useRef<string>('');
  const cameraStateRef = useRef<CameraState | null>(initialCameraState);
  const highlightedNodeRef = useRef<string | null>(highlightedNode);
  const captureTimeoutRef = useRef<number | null>(null);
  const lastFocusedNodeRef = useRef<string | null>(null);
  const hasInitialFitRef = useRef(false);
  const viewportSizeRef = useRef({ width: 0, height: 0 });
  const maxNodeCountRef = useRef(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isFocusedView, setIsFocusedView] = useState(false);
  const [graphInstanceKey, setGraphInstanceKey] = useState(0);
  const [isGraphVisible, setIsGraphVisible] = useState(true);

  const refreshGraphInstance = useCallback(() => {
    const refresh = (graphRef.current as unknown as { refresh?: () => void })?.refresh;
    if (typeof refresh === 'function') {
      refresh.call(graphRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    const applyPalette = () => {
      const nextPalette = resolvePalette(themeClassNames);
      setPalette((prev) => (arePalettesEqual(prev, nextPalette) ? prev : nextPalette));
    };

    applyPalette();

    if (typeof MutationObserver === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const target = findThemeElement(themeClassNames) ?? document.body;
    const observer = new MutationObserver(applyPalette);

    observer.observe(target, { attributes: true, attributeFilter: ['class', 'style'] });

    return () => observer.disconnect();
  }, [theme, themeClassNames]);

  useEffect(() => {
    layoutPositionsRef.current = layoutPositions;
  }, [layoutPositions]);

  useEffect(() => {
    highlightedNodeRef.current = highlightedNode;
    refreshGraphInstance();
  }, [highlightedNode, refreshGraphInstance]);

  useEffect(() => {
    nodeCacheRef.current.clear();
    graphRef.current = null;
    cameraStateRef.current = initialCameraState;
    hasInitialFitRef.current = false;
    lastFocusedNodeRef.current = null;
    setIsFocusedView(false);
    setIsGraphVisible(false);
    const frame = window.requestAnimationFrame(() => {
      setGraphInstanceKey((value) => value + 1);
      setIsGraphVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [graphVersion, initialCameraState, palette]);

  useEffect(() => {
    refreshGraphInstance();
  }, [palette, refreshGraphInstance]);

  useEffect(() => {
    const layoutSnapshot = layoutPositionsRef.current;
    nodeCacheRef.current.forEach((node) => applyLayoutPosition(node, layoutSnapshot));
    lastReportedLayoutRef.current = JSON.stringify(layoutSnapshot ?? {});
    refreshGraphInstance();
  }, [layoutPositions, refreshGraphInstance]);

  const updateViewportSize = useCallback((width: number, height: number) => {
    const normalizedWidth = Math.max(0, Math.round(width));
    const normalizedHeight = Math.max(0, Math.round(height));
    const current = viewportSizeRef.current;
    if (current.width === normalizedWidth && current.height === normalizedHeight) {
      return;
    }
    viewportSizeRef.current = { width: normalizedWidth, height: normalizedHeight };
    setDimensions((prev) =>
      prev.width === normalizedWidth && prev.height === normalizedHeight
        ? prev
        : { width: normalizedWidth, height: normalizedHeight }
    );
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') {
      return;
    }

    const element = wrapperRef.current;
    if (!element) {
      return;
    }

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      updateViewportSize(width, height);
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, [updateViewportSize]);

  useEffect(() => {
    if (!wrapperRef.current) {
      return;
    }

    const { clientWidth, clientHeight } = wrapperRef.current;
    if (clientWidth > 0 && clientHeight > 0) {
      updateViewportSize(clientWidth, clientHeight);
    }
  }, [updateViewportSize]);

  const getViewportSize = useCallback(() => {
    const current = viewportSizeRef.current;
    if (current.width > 0 && current.height > 0) {
      return current;
    }

    const element = wrapperRef.current;
    if (element) {
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (width > 0 && height > 0) {
        updateViewportSize(width, height);
        return viewportSizeRef.current;
      }
    }

    return current;
  }, [updateViewportSize]);

  const domainNodes = useMemo(() => {
    const flatDomains = flattenDomains(domains, visibleDomainIds);
    return flatDomains.map((domain) => ({
      ...domain,
      type: 'domain'
    }));
  }, [domains, visibleDomainIds]);

  const moduleNodes = useMemo<GraphNode[]>(
    () =>
      modules.map((module) => ({
        ...module,
        type: 'module'
      })),
    [modules]
  );

  const moduleStatusMap = useMemo(() => {
    const map = new Map<string, ModuleStatus>();
    moduleNodes.forEach((node) => {
      if (node.type === 'module') {
        map.set(node.id, node.status);
      }
    });
    return map;
  }, [moduleNodes]);

  const artifactNodes = useMemo<GraphNode[]>(
    () =>
      artifacts.map((artifact) => ({
        ...artifact,
        type: 'artifact',
        reuseScore: 0
      })),
    [artifacts]
  );

  const initiativeNodes = useMemo<GraphNode[]>(
    () =>
      initiatives.map((initiative) => ({
        ...initiative,
        type: 'initiative'
      })),
    [initiatives]
  );

  const stableNodesRef = useRef<ForceNode[]>([]);
  const nodesSignatureRef = useRef<string>('');

  const buildNodesSignature = useCallback(() => {
    const parts: string[] = [];

    const collect = (node: GraphNode) => {
      const status = 'status' in node ? String((node as ModuleNode).status ?? '') : '';
      const domainId = 'domainId' in node ? String((node as DomainNode).domainId ?? '') : '';
      const name = node.name ?? '';

      parts.push(`${node.id}:${node.type}:${status}:${domainId}:${name}`);
    };

    domainNodes.forEach(collect);
    artifactNodes.forEach(collect);
    moduleNodes.forEach(collect);
    initiativeNodes.forEach(collect);

    return parts.join('|');
  }, [artifactNodes, domainNodes, initiativeNodes, moduleNodes]);

  const nodes = useMemo(() => {
    const currentSignature = buildNodesSignature();
    if (currentSignature === nodesSignatureRef.current && stableNodesRef.current.length > 0) {
      return stableNodesRef.current;
    }

    const layoutSnapshot = layoutPositionsRef.current;
    const targetIds = new Set(
      domainNodes
        .map((node) => node.id)
        .concat(artifactNodes.map((node) => node.id))
        .concat(moduleNodes.map((node) => node.id))
        .concat(initiativeNodes.map((node) => node.id))
    );

    nodeCacheRef.current.forEach((_, id) => {
      if (!targetIds.has(id)) {
        nodeCacheRef.current.delete(id);
      }
    });

    const nextNodes: ForceNode[] = [];

    const upsertNode = (node: GraphNode) => {
      const cached = nodeCacheRef.current.get(node.id);
      if (cached && cached.type === node.type) {
        Object.assign(cached, node);
        applyLayoutPosition(cached, layoutSnapshot);
        nextNodes.push(cached);
        return;
      }

      const hydratedNode = { ...node } as ForceNode;
      applyLayoutPosition(hydratedNode, layoutSnapshot);
      nodeCacheRef.current.set(node.id, hydratedNode);
      nextNodes.push(hydratedNode);
    };

    domainNodes.forEach(upsertNode);
    artifactNodes.forEach(upsertNode);
    moduleNodes.forEach(upsertNode);
    initiativeNodes.forEach(upsertNode);

    nodesSignatureRef.current = currentSignature;
    stableNodesRef.current = nextNodes;
    return nextNodes;
  }, [artifactNodes, buildNodesSignature, domainNodes, initiativeNodes, moduleNodes]);

  const graphLinks = useMemo<ForceLink[]>(
    () => links.map((link) => ({ ...link })),
    [links]
  );

  const graphData = useMemo(
    () => ({
      nodes,
      links: graphLinks
    }),
    [graphLinks, nodes]
  );

  const nodeTypeMap = useMemo(() => {
    const map = new Map<string, GraphNode['type']>();
    nodes.forEach((node) => {
      map.set(node.id, node.type);
    });
    return map;
  }, [nodes]);

  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach((link) => {
      counts.set(link.source, (counts.get(link.source) ?? 0) + 1);
      counts.set(link.target, (counts.get(link.target) ?? 0) + 1);
    });
    return counts;
  }, [links]);

  const isolatedNodeIds = useMemo(() => {
    const isolated = new Set<string>();
    nodes.forEach((node) => {
      if ((connectionCounts.get(node.id) ?? 0) === 0) {
        isolated.add(node.id);
      }
    });
    return isolated;
  }, [connectionCounts, nodes]);

  const nodeCount = nodes.length;
  const linkCount = links.length;

  useEffect(() => {
    if (nodeCount > 0) {
      maxNodeCountRef.current = Math.max(maxNodeCountRef.current, nodeCount);
    }
  }, [nodeCount]);

  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined' && graphRef.current) {
      (window as typeof window & { __forceGraphRef?: ForceGraphMethods }).__forceGraphRef =
        graphRef.current;
    }
  }, [graphData]);

  useEffect(() => {
    if (!graphRef.current) {
      return;
    }

    const reheat = (graphRef.current as ForceGraphMethods & {
      d3ReheatSimulation?: () => void;
    }).d3ReheatSimulation;

    if (typeof reheat === 'function') {
      reheat();
    }
  }, [nodeCount, linkCount]);

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(captureTimeoutRef.current);
      }
    };
  }, []);

  const captureCameraState = useCallback(() => {
    const { width, height } = getViewportSize();
    if (!graphRef.current || width <= 0 || height <= 0) {
      return;
    }

    const graph = graphRef.current;
    const zoomValue = typeof graph.zoom === 'function' ? (graph.zoom() as number) : undefined;

    if (!Number.isFinite(zoomValue) || !zoomValue || zoomValue <= 0) {
      return;
    }

    const center = graph.screen2GraphCoords?.(width / 2, height / 2);
    if (
      center &&
      typeof center.x === 'number' &&
      Number.isFinite(center.x) &&
      typeof center.y === 'number' &&
      Number.isFinite(center.y)
    ) {
      const nextState: CameraState = {
        center: { x: center.x, y: center.y },
        zoom: zoomValue
      };
      cameraStateRef.current = nextState;
      writeStoredCameraState(cameraStorageKey, nextState);
    }
  }, [cameraStorageKey, getViewportSize]);

  const scheduleCameraCapture = useCallback(
    (delay = 0) => {
      if (typeof window === 'undefined') {
        captureCameraState();
        return;
      }

      if (captureTimeoutRef.current !== null) {
        window.clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }

      if (delay <= 0) {
        captureCameraState();
        return;
      }

      captureTimeoutRef.current = window.setTimeout(() => {
        captureCameraState();
        captureTimeoutRef.current = null;
      }, delay);
    },
    [captureCameraState]
  );

  const restoreCamera = useCallback(() => {
    const { width, height } = getViewportSize();
    if (!graphRef.current || width <= 0 || height <= 0) {
      return;
    }

    const graph = graphRef.current;
    const saved = cameraStateRef.current;

    if (saved) {
      if (typeof graph.zoom === 'function') {
        graph.zoom(saved.zoom, 220);
      }
      graph.centerAt(saved.center.x, saved.center.y, 220);
      scheduleCameraCapture(260);
      return;
    }

    graph.zoomToFit?.(240, 60);
    scheduleCameraCapture(320);
  }, [getViewportSize, scheduleCameraCapture]);

  const graphStructureKey = useMemo(() => {
    const nodeKey = nodes
      .map((node) => node.id)
      .sort()
      .join('|');

    const linkKey = graphLinks
      .map((link) => {
        const source =
          typeof link.source === 'object' && link.source !== null
            ? (link.source as ForceNode).id
            : String(link.source);
        const target =
          typeof link.target === 'object' && link.target !== null
            ? (link.target as ForceNode).id
            : String(link.target);

        return `${source}->${target}:${link.type}`;
      })
      .sort()
      .join('|');

    return `${nodeKey}__${linkKey}`;
  }, [graphLinks, nodes]);

  const lastGraphStructureRef = useRef<string>('');

  useEffect(() => {
    if (graphStructureKey === lastGraphStructureRef.current) {
      return;
    }

    lastGraphStructureRef.current = graphStructureKey;
    restoreCamera();
  }, [graphStructureKey, restoreCamera]);

  useEffect(() => {
    if (!normalizationRequest || nodes.length === 0) {
      return;
    }

    restoreCamera();

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const reheat = (graph as ForceGraphMethods & { d3ReheatSimulation?: () => void }).d3ReheatSimulation;
    if (typeof reheat === 'function') {
      reheat();
    }
  }, [normalizationRequest, nodes.length, restoreCamera]);

  const configureSimulation = useCallback(() => {
    if (!graphRef.current || nodes.length === 0) {
      return;
    }

    const graph = graphRef.current;
    const maxNodes = Math.max(maxNodeCountRef.current, nodes.length);
    const relativeDensity =
      maxNodes > 0 ? clamp(Math.sqrt(nodes.length) / Math.sqrt(maxNodes), 0.5, 1) : 1;
    const hasExplicitFilters =
      visibleDomainIds.size > 0 || visibleModuleStatuses.size > 0 || nodes.length < maxNodes;
    const filterScale = hasExplicitFilters ? 0.82 : 1;
    const spacingFactor = relativeDensity * filterScale;

    const baseLinkDistance = clamp(160 * spacingFactor, 58, 220);
    const baseChargeStrength = -110 * spacingFactor;
    const isolatedChargeStrength = -26 * filterScale;
    const chargeDistanceMax = 480 * spacingFactor + (hasExplicitFilters ? 60 : 140);

    const chargeForce = graph.d3Force('charge') as
      | ((alpha: number) => void) &
      {
        strength?: (value?: number | ((node: ForceNode) => number)) => typeof chargeForce;
        distanceMax?: (value?: number) => typeof chargeForce;
        distanceMin?: (value?: number) => typeof chargeForce;
      }
      | undefined;

    if (chargeForce?.strength && chargeForce.distanceMax && chargeForce.distanceMin) {
      chargeForce
        .strength((node: ForceNode) =>
          isolatedNodeIds.has(node.id) ? isolatedChargeStrength : baseChargeStrength
        )
        .distanceMax(chargeDistanceMax)
        .distanceMin(18);
    }

    const linkForce = graph.d3Force('link') as
      | ((alpha: number) => void) &
      {
        distance?: (value?: number | ((link: ForceLink) => number)) => typeof linkForce;
      }
      | undefined;

    if (linkForce?.distance) {
      linkForce.distance((link: ForceLink) => {
        const sourceId =
          typeof link.source === 'object' && link.source
            ? (link.source as ForceNode).id
            : String(link.source);
        const targetId =
          typeof link.target === 'object' && link.target
            ? (link.target as ForceNode).id
            : String(link.target);

        const sourceType = nodeTypeMap.get(sourceId);
        const targetType = nodeTypeMap.get(targetId);

        const involvesDomain = sourceType === 'domain' || targetType === 'domain';
        const involvesInitiative = sourceType === 'initiative' || targetType === 'initiative';
        const involvesArtifact = sourceType === 'artifact' || targetType === 'artifact';

        let distance = baseLinkDistance;

        if (involvesDomain && !involvesInitiative) {
          distance *= 0.72;
        } else if (involvesArtifact) {
          distance *= 0.82;
        } else if (involvesInitiative) {
          distance *= 1.08;
        }

        return clamp(distance, 58, 220);
      });
    }

    const collideForce = forceCollide<ForceNode>()
      .radius((node) => {
        switch (node.type) {
          case 'initiative':
            return 34;
          case 'module':
            return 26;
          case 'domain':
            return 22;
          default:
            return 20;
        }
      })
      .strength(0.9)
      .iterations(2);

    graph.d3Force('collide', collideForce);
    graph.d3ReheatSimulation?.();
  }, [
    isolatedNodeIds,
    nodeTypeMap,
    nodes.length,
    visibleDomainIds,
    visibleModuleStatuses
  ]);

  useEffect(() => {
    if (!isGraphVisible || !graphRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      configureSimulation();
      restoreCamera();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [configureSimulation, graphInstanceKey, isGraphVisible, restoreCamera]);

  useEffect(() => {
    if (!highlightedNode) {
      setIsFocusedView(false);
      lastFocusedNodeRef.current = null;
      return;
    }

    if (lastFocusedNodeRef.current && highlightedNode !== lastFocusedNodeRef.current) {
      setIsFocusedView(false);
    }

    const { width, height } = getViewportSize();
    if (!graphRef.current || width <= 0 || height <= 0) {
      return;
    }

    const target = nodeCacheRef.current.get(highlightedNode);
    if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
      return;
    }

    const graph = graphRef.current;
    const topLeft = graph.screen2GraphCoords?.(0, 0);
    const bottomRight = graph.screen2GraphCoords?.(width, height);
    if (!topLeft || !bottomRight) {
      return;
    }

    const minX = Math.min(topLeft.x, bottomRight.x);
    const maxX = Math.max(topLeft.x, bottomRight.x);
    const minY = Math.min(topLeft.y, bottomRight.y);
    const maxY = Math.max(topLeft.y, bottomRight.y);

    const isOutsideViewport =
      target.x < minX || target.x > maxX || target.y < minY || target.y > maxY;

    if (isOutsideViewport) {
      graph.centerAt(target.x, target.y, 400);
      const zoomValue =
        typeof graph.zoom === 'function' ? (graph.zoom() as number) : cameraStateRef.current?.zoom ?? 1;
      const nextState: CameraState = {
        center: { x: target.x, y: target.y },
        zoom: zoomValue
      };
      cameraStateRef.current = nextState;
      writeStoredCameraState(cameraStorageKey, nextState);
      scheduleCameraCapture(420);
    }
  }, [cameraStorageKey, getViewportSize, highlightedNode, scheduleCameraCapture]);

  const focusOnNode = useCallback(
    (node: ForceNode): boolean => {
      if (!graphRef.current || typeof node.x !== 'number' || typeof node.y !== 'number') {
        return false;
      }

      const graph = graphRef.current;
      const label = node.name ?? node.id;
      const viewport = getViewportSize();
      const targetZoom = computeFocusZoom(viewport, label);

      if (typeof graph.zoom === 'function') {
        graph.zoom(targetZoom, 400);
      }
      graph.centerAt(node.x, node.y, 400);

      const nextState: CameraState = {
        center: { x: node.x, y: node.y },
        zoom: targetZoom
      };
      cameraStateRef.current = nextState;
      writeStoredCameraState(cameraStorageKey, nextState);
      lastFocusedNodeRef.current = node.id;
      scheduleCameraCapture(420);
      return true;
    },
    [cameraStorageKey, getViewportSize, scheduleCameraCapture]
  );

  const showEntireGraph = useCallback(() => {
    if (!graphRef.current) {
      return;
    }

    const graph = graphRef.current;
    lastFocusedNodeRef.current = null;
    setIsFocusedView(false);
    cameraStateRef.current = null;
    writeStoredCameraState(cameraStorageKey, null);
    graph.zoomToFit?.(400, 80);
    scheduleCameraCapture(450);
  }, [cameraStorageKey, scheduleCameraCapture]);

  useEffect(() => {
    if (cameraStateRef.current || hasInitialFitRef.current) {
      return;
    }

    if (highlightedNode) {
      return;
    }

    const { width, height } = getViewportSize();
    if (!graphRef.current || width <= 0 || height <= 0) {
      return;
    }

    if (nodes.length === 0) {
      return;
    }

    showEntireGraph();
    hasInitialFitRef.current = true;
  }, [
    getViewportSize,
    highlightedNode,
    nodes,
    showEntireGraph
  ]);

  const handleNodeDoubleClick = useCallback(
    (node: ForceNode) => {
      onSelect(node);

      if (isFocusedView && lastFocusedNodeRef.current === node.id) {
        showEntireGraph();
        return;
      }

      const focused = focusOnNode(node);
      setIsFocusedView(focused);
    },
    [focusOnNode, isFocusedView, onSelect, showEntireGraph]
  );

  const handleFocusButton = useCallback(() => {
    if (!highlightedNode) {
      return;
    }

    const cachedNode = nodeCacheRef.current.get(highlightedNode);
    const fallbackNode = graphRef.current
      ?.graphData?.()
      ?.nodes?.find((candidate) => candidate.id === highlightedNode) as
      | ForceNode
      | undefined;
    const node = cachedNode ?? fallbackNode;
    if (!node) {
      return;
    }

    if (isFocusedView && lastFocusedNodeRef.current === node.id) {
      showEntireGraph();
      return;
    }

    const focused = focusOnNode(node);
    setIsFocusedView(focused);
  }, [focusOnNode, highlightedNode, isFocusedView, showEntireGraph]);

  const handleShowAllButton = useCallback(() => {
    showEntireGraph();
  }, [showEntireGraph]);

  const handleZoomTransform = useCallback(
    (transform?: { k: number; x: number; y: number }) => {
      const { width, height } = getViewportSize();
      if (!transform || width <= 0 || height <= 0) {
        return;
      }

      const { k, x, y } = transform;
      if (!Number.isFinite(k) || k <= 0) {
        return;
      }

      const nextState: CameraState = {
        center: {
          x: (width / 2 - x) / k,
          y: (height / 2 - y) / k
        },
        zoom: k
      };
      cameraStateRef.current = nextState;
      writeStoredCameraState(cameraStorageKey, nextState);
    },
    [cameraStorageKey, getViewportSize]
  );

  const handleZoomEnd = useCallback(() => {
    scheduleCameraCapture(0);
  }, [scheduleCameraCapture]);

  const emitLayoutUpdate = useCallback(
    (reason: LayoutChangeReason) => {
      if (!onLayoutChange) {
        return;
      }

      if (nodeCacheRef.current.size === 0 || nodes.length === 0) {
        return;
      }

      const visibleIds = new Set(nodes.map((node) => node.id));
      const entries: Array<[string, GraphLayoutNodePosition]> = [];

      nodeCacheRef.current.forEach((node, id) => {
        if (!visibleIds.has(id)) {
          return;
        }

        if (
          typeof node.x !== 'number' ||
          Number.isNaN(node.x) ||
          typeof node.y !== 'number' ||
          Number.isNaN(node.y)
        ) {
          return;
        }

        const payload: GraphLayoutNodePosition = {
          x: roundCoordinate(node.x),
          y: roundCoordinate(node.y)
        };

        if (typeof node.fx === 'number' && !Number.isNaN(node.fx)) {
          payload.fx = roundCoordinate(node.fx);
        }

        if (typeof node.fy === 'number' && !Number.isNaN(node.fy)) {
          payload.fy = roundCoordinate(node.fy);
        }

        entries.push([id, payload]);
      });

      const layoutSnapshot = layoutPositionsRef.current;
      const meaningfulEntries = entries.filter(([id, payload]) => {
        const previous = layoutSnapshot[id];
        return hasMeaningfulLayoutDiff(previous, payload, LAYOUT_EPSILON);
      });

      if (meaningfulEntries.length === 0) {
        return;
      }

      const updatePayload = Object.fromEntries(meaningfulEntries);
      const nextLayout = { ...layoutSnapshot, ...updatePayload };

      layoutPositionsRef.current = nextLayout;
      lastReportedLayoutRef.current = JSON.stringify(nextLayout);
      onLayoutChange(updatePayload, reason);
    },
    [nodes, onLayoutChange]
  );

  const handleNodeDragStart = useCallback(
    (node: ForceNode) => {
      if (node) {
        onSelect(node);
      }
    },
    [onSelect]
  );

  const handleNodeDragEnd = useCallback(
    (node: ForceNode) => {
      if (node) {
        onSelect(node);
      }

      if (node && typeof node.id === 'string') {
        const layout = layoutPositionsRef.current[node.id];
        const hasFixedX = typeof layout?.fx === 'number' && Number.isFinite(layout.fx);
        const hasFixedY = typeof layout?.fy === 'number' && Number.isFinite(layout.fy);

        const resolvedX = resolveCoordinate(
          node.x,
          node.fx,
          layout?.x ?? null,
          layout?.fx ?? null
        );
        const resolvedY = resolveCoordinate(
          node.y,
          node.fy,
          layout?.y ?? null,
          layout?.fy ?? null
        );

        if (resolvedX !== null) {
          node.x = resolvedX;
          node.fx = hasFixedX ? resolvedX : undefined;
        } else {
          node.fx = undefined;
          if (layout?.x !== undefined) {
            node.x = layout.x;
          }
        }

        if (resolvedY !== null) {
          node.y = resolvedY;
          node.fy = hasFixedY ? resolvedY : undefined;
        } else {
          node.fy = undefined;
          if (layout?.y !== undefined) {
            node.y = layout.y;
          }
        }

        if (typeof node.vx === 'number') {
          node.vx = 0;
        }
        if (typeof node.vy === 'number') {
          node.vy = 0;
        }

        nodeCacheRef.current.set(node.id, node);
      }

      emitLayoutUpdate('drag');
    },
    [emitLayoutUpdate, onSelect]
  );

  const handleEngineStop = useCallback(() => {
    emitLayoutUpdate('engine');
  }, [emitLayoutUpdate]);

  const getNodeLabel = useCallback((node: ForceNode) => node.name ?? node.id, []);

  const getLinkColor = useCallback(
    (link: ForceLink) =>
      resolveLinkColor(link, palette, visibleDomainIds, visibleModuleStatuses, moduleStatusMap),
    [moduleStatusMap, palette, visibleDomainIds, visibleModuleStatuses]
  );

  const getLinkDirectionalParticles = useCallback(
    (link: ForceLink) => (link.type === 'produces' || link.type === 'consumes' ? 2 : 0),
    []
  );

  const getLinkDirectionalParticleSpeed = useCallback(
    (link: ForceLink) => (link.type === 'produces' ? 0.005 : 0.005),
    []
  );

  const renderNode = useCallback(
    (node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      drawNode(
        node,
        ctx,
        globalScale,
        highlightedNodeRef.current,
        palette,
        visibleDomainIds,
        visibleModuleStatuses
      );
    },
    [palette, visibleDomainIds, visibleModuleStatuses]
  );

  const getNodeCanvasMode = useCallback(() => 'replace', []);

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      onSelect(node as ForceNode);
    },
    [onSelect]
  );

  const handleNodeDoubleClickWrapper = useCallback(
    (node: NodeObject) => {
      handleNodeDoubleClick(node as ForceNode);
    },
    [handleNodeDoubleClick]
  );

  const handleNodeDragStartWrapper = useCallback(
    (node: NodeObject) => {
      handleNodeDragStart(node as ForceNode);
    },
    [handleNodeDragStart]
  );

  const handleNodeDragEndWrapper = useCallback(
    (node: NodeObject) => {
      handleNodeDragEnd(node as ForceNode);
    },
    [handleNodeDragEnd]
  );

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.header}>
        <div className={`${styles.legend} glass-panel`}>
          <Badge label="🚀 Модуль • prod" size="s" view="filled" status="warning" />
          <Badge label="🔧 Модуль • in-dev" size="s" view="filled" status="normal" />
          <Badge label="🛑 Модуль • deprecated" size="s" view="filled" status="alert" />
          <Badge label="📂 Домен" size="s" view="filled" status="system" />
          <Badge label="🧩 Артефакт" size="s" view="filled" status="success" />
          <Badge label="🎯 Инициатива" size="s" view="filled" status="warning" />
        </div>
        {highlightedNode ? (
          <div className={`${styles.viewControls} glass-panel`}>
            <button
              type="button"
              className={styles.controlButton}
              onClick={handleFocusButton}
              title="Двойное нажатие по модулю, домену или артефакту приближает граф"
            >
              Приблизить
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={handleShowAllButton}
              title="Двойное нажатие повторно показывает весь граф"
            >
              Показать все
            </button>
          </div>
        ) : null}
      </div>
      <div className={styles.graphWrapper} ref={wrapperRef}>
        <React.Suspense fallback={<Loader size="m" />}>
          {isGraphVisible ? (
            <ForceGraph2D
              key={graphInstanceKey}
              ref={graphRef}
              width={dimensions.width || 600}
              height={dimensions.height || 400}
              graphData={graphData}
              nodeLabel={getNodeLabel}
              linkColor={getLinkColor}
              linkDirectionalParticles={getLinkDirectionalParticles}
              linkDirectionalParticleSpeed={getLinkDirectionalParticleSpeed}
              linkDirectionalParticleWidth={3}
              nodeCanvasObject={renderNode}
              nodeCanvasObjectMode={getNodeCanvasMode}
              onNodeClick={handleNodeClick}
              onNodeDoubleClick={handleNodeDoubleClickWrapper}
              onNodeDragStart={handleNodeDragStartWrapper}
              onNodeDragEnd={handleNodeDragEndWrapper}
              onEngineStop={handleEngineStop}
              onZoom={handleZoomTransform}
              onZoomEnd={handleZoomEnd}
            />
          ) : (
            <Loader size="m" />
          )}
        </React.Suspense>
      </div>
    </div>
  );
};

const MemoizedGraphView = React.memo(GraphView);

function applyLayoutPosition(
  node: ForceNode,
  layoutPositions: Record<string, GraphLayoutNodePosition>
) {
  const layout = layoutPositions[node.id];
  if (!layout) {
    return;
  }

  node.x = layout.x;
  node.y = layout.y;

  if (typeof layout.fx === 'number') {
    node.fx = layout.fx;
  } else if (node.fx !== undefined) {
    node.fx = undefined;
  }

  if (typeof layout.fy === 'number') {
    node.fy = layout.fy;
  } else if (node.fy !== undefined) {
    node.fy = undefined;
  }
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function resolveCoordinate(
  primary: unknown,
  fallback: unknown,
  stored: number | null,
  storedFixed: number | null
): number | null {
  if (typeof primary === 'number' && Number.isFinite(primary)) {
    return roundCoordinate(primary);
  }

  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return roundCoordinate(fallback);
  }

  if (typeof storedFixed === 'number' && Number.isFinite(storedFixed)) {
    return roundCoordinate(storedFixed);
  }

  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return roundCoordinate(stored);
  }

  return null;
}

function hasCoordinateDelta(
  previous: number | undefined,
  next: number | undefined,
  epsilon: number
): boolean {
  if (previous === undefined && next === undefined) {
    return false;
  }

  if (previous === undefined || next === undefined) {
    return true;
  }

  return Math.abs(previous - next) > epsilon;
}

function hasMeaningfulLayoutDiff(
  previous: GraphLayoutNodePosition | undefined,
  next: GraphLayoutNodePosition,
  epsilon: number
): boolean {
  if (!previous) {
    return true;
  }

  return (
    hasCoordinateDelta(previous.x, next.x, epsilon) ||
    hasCoordinateDelta(previous.y, next.y, epsilon) ||
    hasCoordinateDelta(previous.fx, next.fx, epsilon) ||
    hasCoordinateDelta(previous.fy, next.fy, epsilon)
  );
}

function flattenDomains(domains: DomainNode[], visibleDomainIds?: Set<string>): DomainNode[] {
  const visible = visibleDomainIds && visibleDomainIds.size > 0 ? visibleDomainIds : null;

  const collect = (node: DomainNode): DomainNode[] => {
    const childLists = node.children?.map(collect) ?? [];
    const hasVisibleChild = childLists.some((list) => list.length > 0);
    const isLeaf = !node.children || node.children.length === 0;
    const includeSelf =
      !node.isCatalogRoot && (!visible || visible.has(node.id) || hasVisibleChild) && isLeaf;

    const collectedChildren = childLists.flat();

    if (!includeSelf) {
      return collectedChildren;
    }

    return [node, ...collectedChildren];
  };

  return domains.flatMap(collect);
}

type GraphPalette = {
  moduleProduction: string;
  moduleInDev: string;
  moduleDeprecated: string;
  domain: string;
  artifact: string;
  initiative: string;
  text: string;
  linkDependency: string;
  linkProduces: string;
  linkRelates: string;
  linkConsumes: string;
  linkInitiative: string;
};

function drawNode(
  node: ForceNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  highlighted: string | null,
  palette: GraphPalette,
  visibleDomainIds: Set<string>,
  visibleModuleStatuses: Set<ModuleStatus>
) {
  const label = node.name ?? node.id;
  const x = typeof node.x === 'number' ? node.x : 0;
  const y = typeof node.y === 'number' ? node.y : 0;
  const isHighlighted = highlighted === node.id;
  const isDomainDimmed =
    node.type === 'domain' && visibleDomainIds.size > 0 && !visibleDomainIds.has(node.id);
  const isModuleDimmed =
    node.type === 'module' &&
    visibleModuleStatuses.size > 0 &&
    !visibleModuleStatuses.has(node.status);
  const baseAlpha = isHighlighted ? 1 : 1;
  const dimFactor =
    (highlighted && node.id !== highlighted ? 0.4 : 1) *
    (isModuleDimmed && !isHighlighted ? 0.35 : 1) *
    (isDomainDimmed && !isHighlighted ? 0.35 : 1);
  const effectiveAlpha = clamp(baseAlpha * dimFactor, 0.1, 1);
  const labelFontSize = Math.max(12 / Math.sqrt(globalScale), 10);
  const iconFontSize = Math.max(14 / Math.sqrt(globalScale), 12);

  ctx.save();
  ctx.globalAlpha = effectiveAlpha;

  const labelOffset = 14;
  let iconColor = palette.text;
  const icon = resolveNodeIcon(node);

  // Shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  if (isHighlighted) {
    ctx.shadowColor = withAlpha(palette.moduleInDev, 0.6);
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  switch (node.type) {
    case 'module': {
      const moduleRadius = 12; // Slightly larger
      const fill = resolveModuleColor(node.status, palette);
      renderCircle(ctx, x, y, moduleRadius, fill, withAlpha(fill, 0.8));

      // Active ring for highlighted nodes
      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(x, y, moduleRadius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = withAlpha(fill, 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      iconColor = '#FFFFFF';
      break;
    }
    case 'domain': {
      const domainRadius = 10;
      renderDiamond(ctx, x, y, domainRadius, palette.domain, withAlpha(palette.domain, 0.8));

      if (isHighlighted) {
        ctx.beginPath();
        ctx.moveTo(x, y - (domainRadius + 4));
        ctx.lineTo(x + (domainRadius + 4), y);
        ctx.lineTo(x, y + (domainRadius + 4));
        ctx.lineTo(x - (domainRadius + 4), y);
        ctx.closePath();
        ctx.strokeStyle = withAlpha(palette.domain, 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      break;
    }
    case 'artifact': {
      const artifactRadius = 9;
      renderTriangle(ctx, x, y, artifactRadius, palette.artifact, withAlpha(palette.artifact, 0.8));

      if (isHighlighted) {
        // Simple circle glow for triangle for simplicity
        ctx.beginPath();
        ctx.arc(x, y, artifactRadius + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = withAlpha(palette.artifact, 0.4);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      break;
    }
    case 'initiative': {
      const width = 28;
      const height = 18;
      renderRoundedRect(
        ctx,
        x - width / 2,
        y - height / 2,
        width,
        height,
        6,
        palette.initiative,
        withAlpha(palette.initiative, 0.8)
      );

      if (isHighlighted) {
        renderRoundedRect(
          ctx,
          x - width / 2 - 3,
          y - height / 2 - 3,
          width + 6,
          height + 6,
          8,
          'transparent',
          withAlpha(palette.initiative, 0.4)
        );
      }

      iconColor = '#FFFFFF';
      break;
    }
  }

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  if (icon) {
    ctx.font = `${iconFontSize}px sans-serif`;
    ctx.fillStyle = iconColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);
  }

  const textAlpha = isHighlighted ? 1 : Math.max(effectiveAlpha, 0.6); // Increased readability
  ctx.globalAlpha = textAlpha;
  ctx.font = `500 ${labelFontSize}px Inter, sans-serif`; // Use Inter font

  // Text shadow for better contrast against background
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 2;
  ctx.fillStyle = palette.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, y + labelOffset);

  ctx.shadowColor = 'transparent';
  ctx.restore();
}

function resolveLinkColor(
  link: ForceLink,
  palette: GraphPalette,
  visibleDomainIds: Set<string>,
  visibleModuleStatuses: Set<ModuleStatus>,
  moduleStatusMap: Map<string, ModuleStatus>
) {
  if (link.type === 'initiative-plan') {
    const moduleId =
      typeof link.target === 'object' ? (link.target as ForceNode).id : String(link.target);
    const base = palette.linkInitiative;

    if (visibleModuleStatuses.size > 0) {
      let status: ModuleStatus | undefined;
      if (typeof link.target === 'object' && (link.target as ForceNode).type === 'module') {
        status = (link.target as ForceNode & ModuleNode).status;
      } else {
        status = moduleStatusMap.get(moduleId);
      }

      if (status && !visibleModuleStatuses.has(status)) {
        return withAlpha(base, 0.2);
      }
    }

    return base;
  }

  const baseColor =
    link.type === 'dependency'
      ? palette.linkDependency
      : link.type === 'produces'
        ? palette.linkProduces
        : link.type === 'consumes'
          ? palette.linkConsumes
          : link.type === 'initiative-domain'
            ? palette.linkInitiative
            : palette.linkRelates;

  if ((link.type === 'domain' || link.type === 'initiative-domain') && visibleDomainIds.size > 0) {
    const targetId =
      typeof link.target === 'object' ? (link.target as ForceNode).id : String(link.target);
    if (!visibleDomainIds.has(targetId)) {
      return withAlpha(baseColor, 0.2);
    }
  }

  return baseColor;
}

function withAlpha(color: string, alpha: number) {
  if (!color.startsWith('#')) {
    return color;
  }

  const hex = color.slice(1);
  if (hex.length !== 6) {
    return color;
  }

  const bigint = Number.parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  outline: string
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  outline: string
) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  outline: string
) {
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius, y + radius);
  ctx.lineTo(x - radius, y + radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function renderRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  outline: string
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function resolveModuleColor(status: ModuleStatus, palette: GraphPalette): string {
  switch (status) {
    case 'production':
      return palette.moduleProduction;
    case 'in-dev':
      return palette.moduleInDev;
    case 'deprecated':
    default:
      return palette.moduleDeprecated;
  }
}

const MODULE_ICON_MAP: Record<ModuleStatus, string> = {
  production: '🚀',
  'in-dev': '🔧',
  deprecated: '🛑'
};

function resolveNodeIcon(node: GraphNode): string {
  if (node.type === 'module') {
    return MODULE_ICON_MAP[node.status];
  }

  if (node.type === 'domain') {
    return '📂';
  }

  if (node.type === 'artifact') {
    return '🧩';
  }

  if (node.type === 'initiative') {
    return '🎯';
  }

  return '';
}

function resolvePalette(themeClassNames?: ThemePreset | string): GraphPalette {
  if (typeof window === 'undefined') {
    return DEFAULT_PALETTE;
  }

  const styles = getComputedStyle((findThemeElement(themeClassNames) as HTMLElement) ?? document.body);
  const getVar = (token: string, fallback: string) => styles.getPropertyValue(token).trim() || fallback;

  return {
    moduleProduction: getVar('--color-bg-warning', DEFAULT_PALETTE.moduleProduction),
    moduleInDev: getVar('--color-bg-normal', DEFAULT_PALETTE.moduleInDev),
    moduleDeprecated: getVar('--color-bg-alert', DEFAULT_PALETTE.moduleDeprecated),
    domain: getVar('--color-bg-info', DEFAULT_PALETTE.domain),
    artifact: getVar('--color-bg-success', DEFAULT_PALETTE.artifact),
    initiative: getVar('--color-bg-brand', DEFAULT_PALETTE.initiative),
    text: getVar('--color-typo-primary', DEFAULT_PALETTE.text),
    linkDependency: getVar('--color-bg-border', DEFAULT_PALETTE.linkDependency),
    linkProduces: getVar('--color-bg-success', DEFAULT_PALETTE.linkProduces),
    linkRelates: getVar('--color-bg-info', DEFAULT_PALETTE.linkRelates),
    linkConsumes: getVar('--color-bg-normal', DEFAULT_PALETTE.linkConsumes),
    linkInitiative: getVar('--color-bg-accent', DEFAULT_PALETTE.linkInitiative)
  };
}

function findThemeElement(themeClassNames?: ThemePreset | string): Element | null {
  const tokens: string[] = [];

  if (typeof themeClassNames === 'string') {
    tokens.push(...themeClassNames.split(/\s+/).filter(Boolean));
  } else if (themeClassNames && typeof themeClassNames === 'object') {
    const color = (themeClassNames as ThemePreset).color;
    const colorToken = typeof color === 'string' ? color : color?.primary;

    [
      colorToken,
      (themeClassNames as ThemePreset).control,
      (themeClassNames as ThemePreset).font,
      (themeClassNames as ThemePreset).size,
      (themeClassNames as ThemePreset).space,
      (themeClassNames as ThemePreset).shadow
    ]
      .filter((token): token is string => Boolean(token && token.trim()))
      .forEach((token) => tokens.push(token.trim()));
  }

  const selectorVariants = [
    tokens.length > 0 ? tokens.map((token) => `.${token}`).join('') : null,
    tokens[0] ? `.${tokens[0]}` : null,
    '.Theme'
  ].filter(Boolean) as string[];

  for (const selector of selectorVariants) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    } catch {
      // Ignore invalid selectors and try the next fallback
    }
  }

  return null;
}

function arePalettesEqual(a: GraphPalette, b: GraphPalette): boolean {
  return (
    a.moduleProduction === b.moduleProduction &&
    a.moduleInDev === b.moduleInDev &&
    a.moduleDeprecated === b.moduleDeprecated &&
    a.domain === b.domain &&
    a.artifact === b.artifact &&
    a.initiative === b.initiative &&
    a.text === b.text &&
    a.linkDependency === b.linkDependency &&
    a.linkProduces === b.linkProduces &&
    a.linkRelates === b.linkRelates &&
    a.linkConsumes === b.linkConsumes &&
    a.linkInitiative === b.linkInitiative
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeFocusZoom(
  dimensions: { width: number; height: number },
  label: string
): number {
  const minViewport = Math.min(dimensions.width || 0, dimensions.height || 0);
  const boundedViewport = clamp(minViewport || 0, 360, 1440);
  const viewportRatio = 1 - (boundedViewport - 360) / (1440 - 360);
  const baseZoom = 2.4 + viewportRatio * 1.2; // 2.4 .. 3.6
  const labelAdjustment = clamp(label.length / 24, 0, 0.6);
  return clamp(baseZoom + labelAdjustment, 2.6, 4.2);
}

const DEFAULT_PALETTE: GraphPalette = {
  moduleProduction: '#FF8C69',
  moduleInDev: '#4C9AFF',
  moduleDeprecated: '#D06C6C',
  domain: '#5B8FF9',
  artifact: '#45C7B0',
  initiative: '#A25DDC',
  text: '#1F1F1F',
  linkDependency: '#B8B8B8',
  linkProduces: '#45C7B0',
  linkRelates: '#5B8FF9',
  linkConsumes: '#8E8E93',
  linkInitiative: '#A25DDC'
};

export type { GraphNode };
export default MemoizedGraphView;
