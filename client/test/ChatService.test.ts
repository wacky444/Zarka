import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  Channel,
  ChannelMessage,
  ChannelMessageAck,
  Client,
  Session,
  Socket
} from "@heroiclabs/nakama-js";
import { MatchChatService } from "../src/services/chatService";
import type { TurnService } from "../src/services/turnService";

interface FakeSocket {
  onchannelmessage: (payload: ChannelMessage) => void;
  ondisconnect: (event: Event) => void;
  joinedRooms: string[];
  sentMessages: number;
  connect: () => Promise<void>;
  joinChat: (
    target: string,
    type: number,
    persistence: boolean,
    hidden: boolean
  ) => Promise<Channel>;
  leaveChat: (channelId: string) => Promise<void>;
  writeChatMessage: (
    channelId: string,
    content: unknown
  ) => Promise<ChannelMessageAck>;
  disconnect: (fireDisconnectEvent?: boolean) => void;
}

test("chat reconnects and rejoins after socket disconnect before sending", async () => {
  const sockets: FakeSocket[] = [];
  const client = {
    createSocket: () => {
      const socket: FakeSocket = {
        onchannelmessage: () => {},
        ondisconnect: () => {},
        joinedRooms: [],
        sentMessages: 0,
        connect: async () => {},
        joinChat: async (target) => {
          socket.joinedRooms.push(target);
          return {
            id: `channel-${sockets.length}`,
            presences: [],
            self: { user_id: "user", session_id: "session", username: "user", node: "node" }
          } as Channel;
        },
        leaveChat: async () => {},
        writeChatMessage: async (channelId) => {
          socket.sentMessages += 1;
          return {
            channel_id: channelId,
            message_id: "message",
            code: 0,
            username: "user",
            create_time: new Date().toISOString(),
            update_time: new Date().toISOString(),
            persistence: true
          };
        },
        disconnect: (fireDisconnectEvent = true) => {
          if (fireDisconnectEvent) socket.ondisconnect(new Event("close"));
        }
      };
      sockets.push(socket);
      return socket as unknown as Socket;
    }
  } as unknown as Client;
  const turnService = {
    getClient: () => client,
    getSession: () => ({ token: "session" }) as Session,
    getChatHistory: async () => ({ payload: { messages: [] } }),
    saveChatMessage: async () => ({})
  } as unknown as TurnService;
  const chat = new MatchChatService(turnService);

  await chat.connect("match-1");
  sockets[0].ondisconnect(new Event("close"));
  await chat.send("hello");

  assert.equal(sockets.length, 2);
  assert.deepEqual(sockets[1].joinedRooms, ["match:match-1"]);
  assert.equal(sockets[1].sentMessages, 1);

  await chat.disconnect();
});
