import type { Position, MazeData } from '@ghost-protocol/shared';

/**
 * 펠릿 클러스터 (인접 그룹) 탐색
 *
 * 인접한 펠릿들의 그룹을 찾아 최소 크기 이상의
 * 클러스터 목록을 반환합니다. BFS를 사용합니다.
 *
 * @param maze 미로 데이터
 * @param minSize 최소 클러스터 크기
 * @returns 펠릿 클러스터 배열 (각 클러스터는 위치 배열)
 */
export function pelletCluster(maze: MazeData, minSize: number): Position[][] {
  const visited = new Set<string>();
  const clusters: Position[][] = [];

  /** 위치를 문자열 키로 변환 */
  const key = (x: number, y: number): string => `${x.toString()},${y.toString()}`;

  /** 4방향 탐색용 벡터 */
  const neighbors = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  for (let y = 0; y < maze.height; y++) {
    const row = maze.pellets[y];
    if (row === undefined) continue;

    for (let x = 0; x < maze.width; x++) {
      if (row[x] !== true || visited.has(key(x, y))) continue;

      // BFS로 클러스터 탐색
      const cluster: Position[] = [];
      const queue: Position[] = [{ x, y }];
      visited.add(key(x, y));

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;

        cluster.push(current);

        for (const { dx, dy } of neighbors) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          const nKey = key(nx, ny);

          if (
            nx >= 0 &&
            nx < maze.width &&
            ny >= 0 &&
            ny < maze.height &&
            !visited.has(nKey) &&
            maze.pellets[ny]?.[nx] === true
          ) {
            visited.add(nKey);
            queue.push({ x: nx, y: ny });
          }
        }
      }

      if (cluster.length >= minSize) {
        clusters.push(cluster);
      }
    }
  }

  return clusters;
}
