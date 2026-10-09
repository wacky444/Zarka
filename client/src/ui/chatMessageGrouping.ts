export interface ChatMessageGroupItem {
  senderId: string;
  senderLabel: string;
  content: string;
  timestamp: number;
  isSelf: boolean;
  isSystem?: boolean;
}

export interface GroupedChatMessage {
  first: ChatMessageGroupItem;
  content: string;
  lastTimestamp: number;
}

const MESSAGE_GROUP_GAP_MS = 2 * 60 * 1000;

export function groupChatMessages(
  messages: readonly ChatMessageGroupItem[]
): GroupedChatMessage[] {
  const groups: GroupedChatMessage[] = [];
  for (const message of messages) {
    const previous = groups[groups.length - 1];
    const gap = previous ? message.timestamp - previous.lastTimestamp : -1;
    if (
      previous &&
      !message.isSystem &&
      !previous.first.isSystem &&
      message.senderId.length > 0 &&
      message.senderId === previous.first.senderId &&
      gap >= 0 &&
      gap <= MESSAGE_GROUP_GAP_MS
    ) {
      const previousContent = previous.content.trimEnd().replace(/[,:;]+$/u, "");
      const separator = /[.!?…]$/u.test(previousContent) ? " " : ". ";
      previous.content = `${previousContent}${separator}${message.content.trimStart()}`;
      previous.lastTimestamp = message.timestamp;
      continue;
    }
    groups.push({
      first: message,
      content: message.content,
      lastTimestamp: message.timestamp
    });
  }
  return groups;
}
