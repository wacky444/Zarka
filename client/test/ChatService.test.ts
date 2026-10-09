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
import { groupChatMessages } from "../src/ui/chatMessageGrouping";
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

test("groups adjacent messages from same sender within two minutes", () => {
  const grouped = groupChatMessages([
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "hola",
      timestamp: 1_000,
      isSelf: false
    },
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "voy a mover",
      timestamp: 61_000,
      isSelf: false
    },
    {
      senderId: "alicia",
      senderLabel: "Alicia",
      content: "OK",
      timestamp: 90_000,
      isSelf: false
    },
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "voy ya",
      timestamp: 120_000,
      isSelf: false
    }
  ]);

  assert.deepEqual(
    grouped.map(({ first, content }) => ({
      sender: first.senderLabel,
      content
    })),
    [
      { sender: "Pepe", content: "hola. voy a mover" },
      { sender: "Alicia", content: "OK" },
      { sender: "Pepe", content: "voy ya" }
    ]
  );
});

test("groups at the two-minute boundary without duplicate punctuation", () => {
  const grouped = groupChatMessages([
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "Ready.",
      timestamp: 1_000,
      isSelf: false
    },
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "on my way",
      timestamp: 121_000,
      isSelf: false
    },
    {
      senderId: "pepe",
      senderLabel: "Pepe",
      content: "again",
      timestamp: 241_001,
      isSelf: false
    }
  ]);

  assert.deepEqual(
    grouped.map((group) => group.content),
    ["Ready. on my way", "again"]
  );
});

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
