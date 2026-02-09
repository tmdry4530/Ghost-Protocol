/** Survival record interface */
interface SurvivalRecord {
  readonly rank: number;
  readonly player: string;
  readonly value: string;
  readonly round?: number;
  readonly date: string;
}

/** Highest round data */
const highestRounds: SurvivalRecord[] = [];

/** High score data */
const highScores: SurvivalRecord[] = [];

/** Longest single life data */
const longestLives: SurvivalRecord[] = [];

/** Rank badge component */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#ffd700] to-[#ffb800] px-2 py-1 text-xs font-bold text-gray-900">
        👑
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#c0c0c0] to-[#a0a0a0] px-2 py-1 text-xs font-bold text-gray-900">
        🥈
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[#cd7f32] to-[#b87333] px-2 py-1 text-xs font-bold text-gray-900">
        🥉
      </span>
    );
  }
  return <span className="text-xs font-semibold text-gray-500">{rank}</span>;
}

/** Record card component */
function RecordCard({
  title,
  icon,
  records,
  columns,
}: {
  title: string;
  icon: string;
  records: SurvivalRecord[];
  columns: Array<{ label: string; key: keyof SurvivalRecord }>;
}) {
  return (
    <div className="rounded-lg bg-arena-card border border-arena-border p-6">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
        <span>{icon}</span>
        {title}
      </h3>
      {records.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500">No records yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto min-w-0">
          <table className="w-full">
          <thead>
            <tr className="border-b border-arena-border">
              <th className="px-3 py-2 text-left text-sm font-semibold text-gray-300">Rank</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-sm font-semibold text-gray-300 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={`${String(record.rank)}-${record.player}`}
                className="border-b border-arena-border/30 transition-colors hover:bg-ghost-violet/10 odd:bg-arena-surface/20"
              >
                <td className="px-3 py-2">
                  <RankBadge rank={record.rank} />
                </td>
                {columns.map((col) => {
                  const value = record[col.key];
                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2 text-sm whitespace-nowrap ${
                        col.key === 'player'
                          ? 'font-mono text-gray-400'
                          : col.key === 'value'
                            ? 'font-bold text-ghost-neon'
                            : 'text-gray-300'
                      }`}
                    >
                      {value !== undefined ? String(value) : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

/** Survival records component */
export function SurvivalRecords() {
  return (
    <div className="grid gap-8">
      <RecordCard
        title="Highest Round"
        icon="🎯"
        records={highestRounds}
        columns={[
          { label: 'Player', key: 'player' },
          { label: 'Round', key: 'value' },
          { label: 'Date', key: 'date' },
        ]}
      />

      <RecordCard
        title="High Score"
        icon="⭐"
        records={highScores}
        columns={[
          { label: 'Player', key: 'player' },
          { label: 'Score', key: 'value' },
          { label: 'Round', key: 'round' },
          { label: 'Date', key: 'date' },
        ]}
      />

      <RecordCard
        title="Longest Single Life"
        icon="⏱️"
        records={longestLives}
        columns={[
          { label: 'Player', key: 'player' },
          { label: 'Time', key: 'value' },
          { label: 'Round', key: 'round' },
          { label: 'Date', key: 'date' },
        ]}
      />
    </div>
  );
}
