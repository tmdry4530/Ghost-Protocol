import type { Position, MazeData } from '@ghost-protocol/shared';

/**
 * 가장 가까운 미먹은 펠릿 찾기
 *
 * 맨해튼 거리 기준으로 현재 위치에서 가장 가까운
 * 아직 먹지 않은 펠릿의 좌표를 반환합니다.
 *
 * @param position 현재 위치
 * @param maze 미로 데이터 (펠릿 상태 포함)
 * @returns 가장 가까운 펠릿 위치. 없으면 null.
 */
export function nearestPellet(position: Position, maze: MazeData): Position | null {
  let nearest: Position | null = null;
  let minDistance = Infinity;

  for (let y = 0; y < maze.height; y++) {
    const row = maze.pellets[y];
    if (row === undefined) continue;

    for (let x = 0; x < maze.width; x++) {
      if (row[x] === true) {
        /** 맨해튼 거리 계산 */
        const distance = Math.abs(x - position.x) + Math.abs(y - position.y);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = { x, y };
        }
      }
    }
  }

  return nearest;
}
