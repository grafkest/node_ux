declare module 'd3-force-3d' {
  export type ForceFn = (alpha: number) => void;

  export interface ForceCollide<NodeDatum> extends ForceFn {
    radius(): (node: NodeDatum) => number;
    radius(
      radius: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)
    ): ForceCollide<NodeDatum>;
    strength(): number;
    strength(strength: number): ForceCollide<NodeDatum>;
    iterations(): number;
    iterations(iterations: number): ForceCollide<NodeDatum>;
  }

  export interface ForceManyBody<NodeDatum> extends ForceFn {
    strength(): number | ((node: NodeDatum) => number);
    strength(
      strength: number | ((node: NodeDatum) => number)
    ): ForceManyBody<NodeDatum>;
    distanceMin(): number;
    distanceMin(distance: number): ForceManyBody<NodeDatum>;
    distanceMax(): number;
    distanceMax(distance: number): ForceManyBody<NodeDatum>;
  }

  export interface ForceLink<NodeDatum, LinkDatum> extends ForceFn {
    distance(): number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number);
    distance(
      distance: number | ((link: LinkDatum, i: number, links: LinkDatum[]) => number)
    ): ForceLink<NodeDatum, LinkDatum>;
  }

  export function forceCollide<NodeDatum = unknown>(
    radius?: number | ((node: NodeDatum, i: number, nodes: NodeDatum[]) => number)
  ): ForceCollide<NodeDatum>;
}

