/**
 * BranchMap — S21. A simple SVG tree diagram showing the branching structure.
 * Scenes are nodes; choices are directed edges.
 */
import type { Scene } from '../../store/story-store';

interface Props {
  scenes: Scene[];
  currentIndex: number;
  visitedIndices: Set<number>;
  onJump: (idx: number) => void;
  onClose: () => void;
}

const NODE_W = 110;
const NODE_H = 44;
const H_GAP = 52;
const V_GAP = 80;

interface LayoutNode {
  scene: Scene;
  idx: number;
  x: number;
  y: number;
}

function buildLayout(scenes: Scene[]): { nodes: LayoutNode[]; width: number; height: number } {
  // BFS layering — level = distance from node 0
  const levels: number[] = new Array(scenes.length).fill(-1);
  const queue = [0];
  levels[0] = 0;
  while (queue.length) {
    const cur = queue.shift()!;
    for (const ch of scenes[cur]?.choices ?? []) {
      const ni = ch.nextSceneIndex;
      if (ni >= 0 && ni < scenes.length && levels[ni] === -1) {
        levels[ni] = levels[cur] + 1;
        queue.push(ni);
      }
    }
  }
  // Nodes that are unreachable get level = max+1
  const maxLevel = Math.max(...levels.filter((l) => l >= 0));
  levels.forEach((l, i) => { if (l === -1) levels[i] = maxLevel + 1; });

  // Group by level
  const byLevel: number[][] = [];
  levels.forEach((l, i) => { if (!byLevel[l]) byLevel[l] = []; byLevel[l].push(i); });

  const nodes: LayoutNode[] = [];
  const svgWidth = Math.max(...byLevel.map((grp) => grp.length)) * (NODE_W + H_GAP);
  const svgHeight = byLevel.length * (NODE_H + V_GAP) + 20;

  byLevel.forEach((group, level) => {
    const rowW = group.length * (NODE_W + H_GAP) - H_GAP;
    const startX = (svgWidth - rowW) / 2;
    group.forEach((idx, pos) => {
      nodes.push({ scene: scenes[idx], idx, x: startX + pos * (NODE_W + H_GAP), y: 20 + level * (NODE_H + V_GAP) });
    });
  });

  return { nodes, width: Math.max(svgWidth, 300), height: svgHeight };
}

export function BranchMap({ scenes, currentIndex, visitedIndices, onJump, onClose }: Props) {
  const { nodes, width, height } = buildLayout(scenes);

  const nodeByIdx = new Map(nodes.map((n) => [n.idx, n]));

  const edges: { x1: number; y1: number; x2: number; y2: number; label: string }[] = [];
  for (const n of nodes) {
    for (const ch of n.scene.choices ?? []) {
      const target = nodeByIdx.get(ch.nextSceneIndex);
      if (!target) continue;
      edges.push({
        x1: n.x + NODE_W / 2,
        y1: n.y + NODE_H,
        x2: target.x + NODE_W / 2,
        y2: target.y,
        label: ch.text,
      });
    }
  }

  return (
    <div className="bmap-overlay" onClick={onClose}>
      <div className="bmap-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bmap-head">
          <span>🌳 Branch Map</span>
          <button className="bmap-close" onClick={onClose}>✕</button>
        </div>
        <div className="bmap-scroll">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="bmap-svg">
            <defs>
              <marker id="bm-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <polygon points="0 0,7 3.5,0 7" fill="#7c3aed" opacity="0.7" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((e, i) => (
              <g key={i}>
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                  stroke="#7c3aed" strokeWidth={1.5} strokeOpacity={0.55}
                  markerEnd="url(#bm-arrow)" />
                <text
                  x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 4}
                  fontSize={9} fill="#a78bfa" textAnchor="middle" dominantBaseline="auto"
                >
                  {e.label.length > 20 ? `${e.label.slice(0, 18)}…` : e.label}
                </text>
              </g>
            ))}

            {/* Nodes */}
            {nodes.map((n) => {
              const isCurrent = n.idx === currentIndex;
              const isVisited = visitedIndices.has(n.idx);
              return (
                <g key={n.idx} style={{ cursor: 'pointer' }} onClick={() => onJump(n.idx)}>
                  <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={8}
                    fill={isCurrent ? '#7c3aed' : isVisited ? 'rgba(124,58,237,0.18)' : 'rgba(30,20,50,0.85)'}
                    stroke={isCurrent ? '#a78bfa' : '#4b2d8a'} strokeWidth={isCurrent ? 2 : 1}
                  />
                  <text x={n.x + NODE_W / 2} y={n.y + 15}
                    fontSize={9} fill={isCurrent ? '#fff' : '#c4b5fd'} textAnchor="middle" fontWeight={isCurrent ? 'bold' : 'normal'}
                  >
                    Scene {n.idx + 1}
                  </text>
                  <text x={n.x + NODE_W / 2} y={n.y + 29}
                    fontSize={8.5} fill={isCurrent ? '#e9d5ff' : '#8b7cb3'} textAnchor="middle"
                  >
                    {n.scene.title.length > 16 ? `${n.scene.title.slice(0, 14)}…` : n.scene.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <p className="bmap-hint">Click any node to jump to that scene.</p>
      </div>
    </div>
  );
}
