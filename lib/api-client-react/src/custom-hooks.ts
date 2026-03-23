import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { Game } from "./generated/api.schemas";
import { getGetGameQueryKey } from "./generated/api";

export interface SetRoleBody {
  playerId: string;
  role: "mrx" | "detective";
}

export interface PublicLobby {
  roomCode: string;
  playerCount: number;
  maxPlayers: number;
  players: { name: string }[];
  createdAt: string;
}

export const setPlayerRole = async (
  roomCode: string,
  data: SetRoleBody
): Promise<Game> => {
  return customFetch<Game>(`/api/games/${roomCode}/set-role`, {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const useSetRole = (roomCode: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SetRoleBody) => setPlayerRole(roomCode, data),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(getGetGameQueryKey(roomCode), updatedGame);
    },
  });
};

export const fetchPublicLobbies = async (): Promise<PublicLobby[]> => {
  return customFetch<PublicLobby[]>("/api/games/public");
};

export const usePublicLobbies = () => {
  return useQuery({
    queryKey: ["public-lobbies"],
    queryFn:  fetchPublicLobbies,
    refetchInterval: 3000,
  });
};

export const kickPlayer = async (
  roomCode: string,
  targetPlayerId: string,
  hostId: string
): Promise<Game> => {
  return customFetch<Game>(
    `/api/games/${roomCode}/players/${targetPlayerId}?hostId=${hostId}`,
    { method: "DELETE" }
  );
};

export const useKickPlayer = (roomCode: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetPlayerId, hostId }: { targetPlayerId: string; hostId: string }) =>
      kickPlayer(roomCode, targetPlayerId, hostId),
    onSuccess: (updatedGame) => {
      queryClient.setQueryData(getGetGameQueryKey(roomCode), updatedGame);
    },
  });
};

export interface MatchmakingStatus {
  queueId: string;
  queueSize: number;
  gameRoomCode: string | null;
  myPlayerId: string | null;
}

export const joinMatchmakingQueue = async (playerName: string): Promise<MatchmakingStatus> => {
  return customFetch<MatchmakingStatus>("/api/games/matchmaking/queue", {
    method: "POST",
    body: JSON.stringify({ playerName }),
  });
};

export const leaveMatchmakingQueue = async (queueId: string): Promise<void> => {
  await customFetch(`/api/games/matchmaking/queue/${queueId}`, { method: "DELETE" });
};

export const pollMatchmakingQueue = async (queueId: string): Promise<MatchmakingStatus> => {
  return customFetch<MatchmakingStatus>(`/api/games/matchmaking/queue/${queueId}`);
};

export const useMatchmakingQueue = (queueId: string | null) => {
  return useQuery({
    queryKey: ["matchmaking", queueId],
    queryFn:  () => pollMatchmakingQueue(queueId!),
    enabled:  !!queueId,
    refetchInterval: 2000,
  });
};
