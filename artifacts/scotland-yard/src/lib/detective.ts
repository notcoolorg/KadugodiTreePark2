// 7 distinct detective colors — one per agent slot
export const DETECTIVE_COLORS = [
  '#3b82f6', // Blue
  '#f97316', // Orange
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#a855f7', // Purple
  '#facc15', // Yellow
  '#f87171', // Rose/Red
];

export function getDetectiveColorByIndex(index: number): string {
  return DETECTIVE_COLORS[index % DETECTIVE_COLORS.length];
}

export function getDetectiveIndex(playerId: string, allPlayers: { id: string; role: string }[]): number {
  return allPlayers.filter(p => p.role === 'detective').findIndex(p => p.id === playerId);
}
